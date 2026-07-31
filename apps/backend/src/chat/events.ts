export const MESSAGE_CREATED_EVENT = 'message.created';

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
}

// Shared include shape so every place a message gets created/fetched returns
// the same author/bot fields the frontend expects.
export const MESSAGE_AUTHOR_INCLUDE = {
  author: { select: { id: true, username: true, displayName: true, avatar: true } },
  bot: { select: { id: true, name: true } },
} as const;

export const NOTIFICATION_EVENT = 'notification.push';

export interface NotificationEvent {
  userId: string;
  channelId: string;
  preview: string;
  kind: 'message' | 'mention' | 'reminder';
}
