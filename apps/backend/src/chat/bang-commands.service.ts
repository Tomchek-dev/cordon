import { Injectable } from '@nestjs/common';
import type { SlashCommandContext } from './slash-commands.service';
import type { MessageCard } from './events';

export interface BangCommandReply {
  content: string;
  botId?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentMimeType?: string;
  attachmentSize?: number;
  cards?: MessageCard[];
}

export type BangCommandResult = string | BangCommandReply | void;
export type BangCommandHandler = (ctx: SlashCommandContext) => Promise<BangCommandResult> | BangCommandResult;

// A second, parallel command namespace to slash commands - "!" is reserved
// for warehouse-floor operational bots (pickups, dock logging) where the
// reply often carries a generated attachment (e.g. a pickup label), which
// slash-command replies don't support.
@Injectable()
export class BangCommandsService {
  private readonly commands = new Map<string, { description: string; handler: BangCommandHandler }>();

  register(name: string, description: string, handler: BangCommandHandler) {
    this.commands.set(name.toLowerCase(), { description, handler });
  }

  has(name: string): boolean {
    return this.commands.has(name.toLowerCase());
  }

  list(): { name: string; description: string }[] {
    return Array.from(this.commands.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, { description }]) => ({ name, description }));
  }

  async execute(name: string, ctx: SlashCommandContext): Promise<BangCommandReply | null> {
    const command = this.commands.get(name.toLowerCase());
    if (!command) return null;
    const result = await command.handler(ctx);
    if (!result) return { content: '' };
    return typeof result === 'string' ? { content: result } : result;
  }
}
