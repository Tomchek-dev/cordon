import { Injectable } from '@nestjs/common';

export interface SlashCommandContext {
  channelId: string;
  userId: string;
  args: string;
}

export interface SlashCommandReply {
  content: string;
  // Attribute the reply to a specific bot (e.g. "Reminder Bot") instead of
  // posting as an unattributed system message.
  botId?: string;
}

export type SlashCommandResult = string | SlashCommandReply | void;
export type SlashCommandHandler = (ctx: SlashCommandContext) => Promise<SlashCommandResult> | SlashCommandResult;

@Injectable()
export class SlashCommandsService {
  private readonly commands = new Map<string, { description: string; handler: SlashCommandHandler }>();

  constructor() {
    this.register('help', 'List available slash commands', () => {
      const lines = Array.from(this.commands.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, { description }]) => `/${name} — ${description}`);
      return lines.join('\n');
    });
  }

  // Later phases (e.g. the Phase 4 Reminder Bot) register additional commands
  // here at startup instead of hardcoding them into the gateway.
  register(name: string, description: string, handler: SlashCommandHandler) {
    this.commands.set(name.toLowerCase(), { description, handler });
  }

  has(name: string): boolean {
    return this.commands.has(name.toLowerCase());
  }

  async execute(name: string, ctx: SlashCommandContext): Promise<SlashCommandReply> {
    const command = this.commands.get(name.toLowerCase());
    if (!command) {
      return { content: `Unknown command: /${name}. Try /help.` };
    }
    const result = await command.handler(ctx);
    if (!result) return { content: '' };
    return typeof result === 'string' ? { content: result } : result;
  }
}
