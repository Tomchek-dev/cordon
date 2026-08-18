import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { BangCommandsService, type BangCommandReply } from '../chat/bang-commands.service';
import type { SlashCommandContext } from '../chat/slash-commands.service';
import { MESSAGE_AUTHOR_INCLUDE, MESSAGE_CREATED_EVENT, type MessageCard, type MessageCreatedEvent } from '../chat/events';

const EBAY_BOT_TOKEN_HASH = 'system:ebay-bot';
const RESULT_LIMIT = 5;
// eBay's basic public scope - works with the client credentials grant, no
// per-user consent needed. Renews with the access token every ~2 hours.
const OAUTH_SCOPE = 'https://api.ebay.com/oauth/api_scope';

interface EbayItemSummary {
  title: string;
  price?: { value: string; currency: string };
  itemWebUrl: string;
  condition?: string;
  image?: { imageUrl: string };
}

interface EbaySearchResponse {
  itemSummaries?: EbayItemSummary[];
}

@Injectable()
export class EbayService implements OnModuleInit {
  private readonly logger = new Logger(EbayService.name);
  private botId: string;
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bangCommands: BangCommandsService,
    private readonly events: EventEmitter2,
  ) {}

  async onModuleInit() {
    const bot = await this.prisma.bot.upsert({
      where: { tokenHash: EBAY_BOT_TOKEN_HASH },
      // dmEnabled is set on update too (not just create) so the bot created
      // before DM support existed picks it up on the next boot.
      update: { dmEnabled: true },
      create: {
        name: 'eBay Price Checker',
        tokenHash: EBAY_BOT_TOKEN_HASH,
        ownerId: null,
        permissions: [],
        dmEnabled: true,
      },
    });
    this.botId = bot.id;
    this.logger.log(
      `eBay Price Checker ready (id=${bot.id}), ${this.isEnabled() ? `active (${this.isProduction() ? 'production' : 'sandbox'})` : 'inactive - no EBAY_APP_ID/EBAY_CERT_ID set'}`,
    );

    this.bangCommands.register('ebay', 'Check eBay prices: !ebay <search terms>', (ctx) => this.handleCommand(ctx));
  }

  isEnabled(): boolean {
    return !!process.env.EBAY_APP_ID && !!process.env.EBAY_CERT_ID;
  }

  private isProduction(): boolean {
    return process.env.EBAY_ENV === 'production';
  }

  private apiHost(): string {
    return this.isProduction() ? 'api.ebay.com' : 'api.sandbox.ebay.com';
  }

  private async handleCommand(ctx: SlashCommandContext): Promise<BangCommandReply> {
    const query = ctx.args.trim();
    if (!this.isEnabled()) {
      return { content: "eBay price-checking isn't configured yet.", botId: this.botId };
    }
    if (!query) {
      return { content: 'Usage: !ebay <search terms> — e.g. !ebay logitech mx master 3', botId: this.botId };
    }

    let items: EbayItemSummary[];
    try {
      items = await this.search(query);
    } catch (err) {
      this.logger.warn(`eBay search failed: ${(err as Error).message}`);
      return { content: "Couldn't reach eBay right now - try again in a moment.", botId: this.botId };
    }

    if (items.length === 0) {
      return { content: `No eBay results for "${query}".`, botId: this.botId };
    }

    const { summary, cards } = this.buildReply(query, items);
    return { content: summary, cards, botId: this.botId };
  }

  // Lets someone DM this bot and just type a search - no "!ebay" prefix -
  // same as chatting with a person. Only fires inside a channel that's
  // actually a DM with this bot (see Channel.botId); everywhere else this is
  // a no-op, so it doesn't interfere with normal chat or the bang command.
  @OnEvent(MESSAGE_CREATED_EVENT)
  async handleMessageCreated(message: MessageCreatedEvent) {
    if (message.botId || !this.isEnabled()) return;

    const channel = await this.prisma.channel.findUnique({
      where: { id: message.channelId },
      select: { botId: true },
    });
    if (channel?.botId !== this.botId) return;

    const query = message.content.trim();
    if (!query) return;

    let content: string;
    let cards: MessageCard[] | undefined;
    try {
      const items = await this.search(query);
      if (items.length === 0) {
        content = `No eBay results for "${query}".`;
      } else {
        ({ summary: content, cards } = this.buildReply(query, items));
      }
    } catch (err) {
      this.logger.warn(`eBay DM search failed: ${(err as Error).message}`);
      content = "Couldn't reach eBay right now - try again in a moment.";
    }

    const reply = await this.prisma.message.create({
      data: {
        channelId: message.channelId,
        botId: this.botId,
        content,
        replyToId: message.id,
        // Round-trip through JSON so optional (possibly-undefined) MessageCard
        // fields become plain JSON Prisma's Json input accepts.
        cards: cards ? JSON.parse(JSON.stringify(cards)) : undefined,
      },
      include: MESSAGE_AUTHOR_INCLUDE,
    });
    this.events.emit(MESSAGE_CREATED_EVENT, {
      ...reply,
      cards: reply.cards as MessageCreatedEvent['cards'],
    } satisfies MessageCreatedEvent);
  }

  // A short text summary (the chat UI doesn't render markdown, and the
  // per-listing detail now lives in `cards` instead) plus one card per
  // listing for the frontend to render as an image/title/price row.
  private buildReply(query: string, items: EbayItemSummary[]): { summary: string; cards: MessageCard[] } {
    const summary = `🔎 eBay: "${query}"${this.isProduction() ? '' : '   🧪 sandbox test data, not real listings'} — ${items.length} result${items.length === 1 ? '' : 's'}`;
    const cards = items.map((item) => ({
      title: item.title,
      subtitle: [
        item.price
          ? item.price.currency === 'USD'
            ? `$${item.price.value}`
            : `${item.price.value} ${item.price.currency}`
          : 'Price unavailable',
        item.condition,
      ]
        .filter(Boolean)
        .join('  ·  '),
      imageUrl: item.image?.imageUrl,
      url: item.itemWebUrl,
    }));
    return { summary, cards };
  }

  private async search(query: string): Promise<EbayItemSummary[]> {
    const token = await this.getAccessToken();
    const url = `https://${this.apiHost()}/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=${RESULT_LIMIT}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
    });
    if (!res.ok) {
      throw new Error(`eBay search returned ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as EbaySearchResponse;
    return (body.itemSummaries ?? []).slice(0, RESULT_LIMIT);
  }

  private async getAccessToken(): Promise<string> {
    // 60s safety margin so a token doesn't expire mid-request.
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60_000) {
      return this.cachedToken.value;
    }

    const credentials = Buffer.from(`${process.env.EBAY_APP_ID}:${process.env.EBAY_CERT_ID}`).toString('base64');
    const res = await fetch(`https://${this.apiHost()}/identity/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: OAUTH_SCOPE }),
    });
    if (!res.ok) {
      throw new Error(`eBay OAuth token request returned ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return this.cachedToken.value;
  }
}
