import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { MESSAGE_AUTHOR_INCLUDE, MESSAGE_CREATED_EVENT, type MessageCreatedEvent } from '../chat/events';

const ASSISTANT_BOT_TOKEN_HASH = 'system:assistant-bot';
const MENTION_PATTERN = /@assistant\b/i;
const CONTEXT_MESSAGE_LIMIT = 12;

const SYSTEM_PROMPT =
  'You are "Assistant", an AI helper embedded in an internal team chat tool called Cordon. ' +
  'You were just @-mentioned in a channel. Reply directly and helpfully to the most recent ' +
  'message, using the preceding conversation only as context. Keep replies concise and ' +
  "conversational. Respond in plain text only - no markdown formatting (no #, *, backticks, or " +
  "dash-prefixed lists) - the chat UI doesn't render markdown. Do not prefix your reply with your own name.";

// Responds when @-mentioned in a channel message. Same "build it, gate it, don't
// block on the key" posture as the Tenor GIF picker: fully wired, but silently
// a no-op until ANTHROPIC_API_KEY is set (see isEnabled()).
@Injectable()
export class AssistantService implements OnModuleInit {
  private readonly logger = new Logger(AssistantService.name);
  private botId: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async onModuleInit() {
    const bot = await this.prisma.bot.upsert({
      where: { tokenHash: ASSISTANT_BOT_TOKEN_HASH },
      update: {},
      create: { name: 'Assistant', tokenHash: ASSISTANT_BOT_TOKEN_HASH, ownerId: null, permissions: [] },
    });
    this.botId = bot.id;
    this.logger.log(
      `Assistant Bot ready (id=${bot.id}), ${this.isEnabled() ? 'active' : 'inactive - no ANTHROPIC_API_KEY set'}`,
    );
  }

  isEnabled(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  @OnEvent(MESSAGE_CREATED_EVENT)
  handleMessageCreated(message: MessageCreatedEvent) {
    // Ignore bot-authored messages (including our own replies) so a reply
    // can never re-trigger itself into a loop.
    if (message.botId) return;
    if (!this.isEnabled()) return;
    if (!MENTION_PATTERN.test(message.content)) return;

    this.respond(message).catch((err) => {
      this.logger.warn(`Assistant reply failed: ${(err as Error).message}`);
    });
  }

  private async respond(trigger: MessageCreatedEvent): Promise<void> {
    const priorMessages = await this.prisma.message.findMany({
      where: { channelId: trigger.channelId, createdAt: { lte: trigger.createdAt } },
      orderBy: { createdAt: 'desc' },
      take: CONTEXT_MESSAGE_LIMIT,
      select: {
        content: true,
        author: { select: { displayName: true } },
        bot: { select: { name: true } },
      },
    });

    const transcript = priorMessages
      .reverse()
      .map((m) => `${m.author?.displayName ?? m.bot?.name ?? 'Unknown'}: ${m.content}`)
      .join('\n');

    const replyText = await this.tryRespond(transcript);
    if (!replyText) return;

    const message = await this.prisma.message.create({
      data: { channelId: trigger.channelId, botId: this.botId, content: replyText, replyToId: trigger.id },
      include: MESSAGE_AUTHOR_INCLUDE,
    });
    this.events.emit(MESSAGE_CREATED_EVENT, message satisfies MessageCreatedEvent);
  }

  private async tryRespond(transcript: string): Promise<string | null> {
    try {
      const anthropic = new Anthropic();
      const response = await anthropic.messages.create({
        model: 'claude-opus-5',
        max_tokens: 4096,
        output_config: { effort: 'medium' },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: transcript }],
      });

      if (response.stop_reason === 'refusal') {
        this.logger.warn('Assistant reply refused by safety classifiers');
        return null;
      }
      const textBlock = response.content.find((b) => b.type === 'text');
      return textBlock && 'text' in textBlock ? textBlock.text : null;
    } catch (err) {
      this.logger.warn(`Assistant call failed: ${(err as Error).message}`);
      return null;
    }
  }
}
