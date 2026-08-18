export const MESSAGE_CREATED_EVENT = 'message.created';

// Generic structured content a bot can attach to a reply - rendered as
// cards in the UI instead of (or alongside) plain text. Not eBay-specific;
// any bot can populate this.
export interface MessageCard {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  url?: string;
}

export interface MessageCreatedEvent {
  id: string;
  channelId: string;
  authorId: string | null;
  botId: string | null;
  content: string;
  createdAt: Date;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentMimeType?: string | null;
  attachmentSize?: number | null;
  replyToId?: string | null;
  cards?: MessageCard[] | null;
}

// Shared include shape so every place a message gets created/fetched returns
// the same author/bot/reaction/reply fields the frontend expects.
export const MESSAGE_AUTHOR_INCLUDE = {
  author: { select: { id: true, username: true, displayName: true, avatar: true } },
  bot: { select: { id: true, name: true } },
  reactions: { select: { emoji: true, userId: true } },
  replyTo: {
    select: {
      id: true,
      content: true,
      author: { select: { id: true, displayName: true } },
      bot: { select: { id: true, name: true } },
    },
  },
} as const;

export const NOTIFICATION_EVENT = 'notification.push';

export interface NotificationEvent {
  userId: string;
  channelId: string;
  preview: string;
  kind: 'message' | 'mention' | 'reminder' | 'call';
}
