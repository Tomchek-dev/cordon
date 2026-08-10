import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ForbiddenException, Logger, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import { RoomServiceClient } from 'livekit-server-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelsService, CHANNEL_CREATED_EVENT } from '../channels/channels.service';
import type { ChannelCreatedEvent } from '../channels/channels.service';
import { PresenceService, PRESENCE_CHANNEL } from '../presence/presence.service';
import type { PresenceStatus } from '../presence/presence.service';
import { RedisService } from '../redis/redis.service';
import { SlashCommandsService } from './slash-commands.service';
import { BangCommandsService } from './bang-commands.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  MESSAGE_AUTHOR_INCLUDE,
  MESSAGE_CREATED_EVENT,
  NOTIFICATION_EVENT,
  type MessageCreatedEvent,
  type NotificationEvent,
} from './events';

function userRoom(userId: string): string {
  return `user:${userId}`;
}

interface AuthedSocket extends Socket {
  data: {
    userId: string;
    username: string;
  };
}

@WebSocketGateway({ cors: { origin: process.env.FRONTEND_ORIGIN ?? false } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  // Tracks how many live sockets a user has open, so presence only flips to
  // OFFLINE once their last connection actually drops (they may have multiple tabs).
  private readonly connectionsByUser = new Map<string, number>();
  // Server-side calls hit LiveKit directly (LIVEKIT_HOST), same as the
  // comment on that env var explains - this backend runs on the host, not
  // inside the Docker network LiveKit itself is proxied through for clients.
  private readonly roomService = new RoomServiceClient(
    process.env.LIVEKIT_HOST!,
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
  );

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly channelsService: ChannelsService,
    private readonly presenceService: PresenceService,
    private readonly redis: RedisService,
    private readonly slashCommands: SlashCommandsService,
    private readonly bangCommands: BangCommandsService,
    private readonly events: EventEmitter2,
    private readonly auditLog: AuditLogService,
  ) {}

  onModuleInit() {
    this.redis.subscriber.subscribe(PRESENCE_CHANNEL);
    this.redis.subscriber.on('message', (channel, message) => {
      if (channel !== PRESENCE_CHANNEL) return;
      this.server.emit('presence', JSON.parse(message));
    });
  }

  // A channel/DM was just created via the REST API. Force-join the relevant
  // sockets to its room immediately, since they can't call 'joinChannel'
  // themselves for a channel they don't yet know exists.
  @OnEvent(CHANNEL_CREATED_EVENT)
  handleChannelCreated(payload: ChannelCreatedEvent) {
    if (payload.memberIds === 'all') {
      this.server.socketsJoin(payload.channelId);
      this.server.emit('channelsChanged');
      return;
    }

    payload.memberIds.forEach((userId) => {
      this.server.in(userRoom(userId)).socketsJoin(payload.channelId);
      this.server.in(userRoom(userId)).emit('channelsChanged');
    });
  }

  async handleConnection(client: AuthedSocket) {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify(token);
      client.data.userId = payload.sub;
      client.data.username = payload.username;
    } catch {
      this.logger.warn('Rejected socket connection: invalid token');
      client.disconnect();
      return;
    }

    client.join(userRoom(client.data.userId));

    // Join every channel this user is already a member of so background events
    // (new messages, edits) reach them even when that channel isn't the active one.
    const memberships = await this.prisma.channelMember.findMany({
      where: { userId: client.data.userId },
      select: { channelId: true },
    });
    memberships.forEach((m) => client.join(m.channelId));

    const count = this.connectionsByUser.get(client.data.userId) ?? 0;
    this.connectionsByUser.set(client.data.userId, count + 1);
    if (count === 0) {
      await this.presenceService.setStatus(client.data.userId, 'ONLINE');
    }
  }

  async handleDisconnect(client: AuthedSocket) {
    if (!client.data?.userId) return;
    const count = (this.connectionsByUser.get(client.data.userId) ?? 1) - 1;
    if (count <= 0) {
      this.connectionsByUser.delete(client.data.userId);
      await this.presenceService.setStatus(client.data.userId, 'OFFLINE');
    } else {
      this.connectionsByUser.set(client.data.userId, count);
    }
  }

  @SubscribeMessage('setStatus')
  async handleSetStatus(
    @MessageBody() data: PresenceStatus | { status: PresenceStatus; reason?: string },
    @ConnectedSocket() client: AuthedSocket,
  ) {
    const status = typeof data === 'string' ? data : data.status;
    const reason = typeof data === 'string' ? undefined : data.reason;
    if (status !== 'ONLINE' && status !== 'AWAY' && status !== 'BUSY') return;
    await this.presenceService.setStatus(client.data.userId, status);

    // Only announce when a reason was actually given - an ordinary status
    // flip shouldn't interrupt anyone, but "stepping away for lunch" is
    // useful for teammates to see in real time.
    if (reason?.trim()) {
      const user = await this.prisma.user.findUnique({
        where: { id: client.data.userId },
        select: { displayName: true },
      });
      this.server.emit('statusReason', {
        userId: client.data.userId,
        displayName: user?.displayName ?? 'Someone',
        status,
        reason: reason.trim(),
      });
    }
  }

  @SubscribeMessage('joinChannel')
  async handleJoinChannel(@MessageBody() channelId: string, @ConnectedSocket() client: AuthedSocket) {
    try {
      await this.channelsService.ensureMembership(channelId, client.data.userId);
      client.join(channelId);
    } catch (err) {
      if (err instanceof ForbiddenException) {
        client.emit('error', { message: err.message });
      }
    }
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @MessageBody()
    data: {
      channelId: string;
      content: string;
      attachment?: { url: string; filename: string; mimeType: string; size: number };
      replyToId?: string;
    },
    @ConnectedSocket() client: AuthedSocket,
  ) {
    if (!data.content?.trim() && !data.attachment) return;
    await this.channelsService.ensureMembership(data.channelId, client.data.userId);

    const trimmed = data.content?.trim() ?? '';
    if (trimmed.startsWith('/') && !data.attachment) {
      const [commandName, ...rest] = trimmed.slice(1).split(/\s+/);
      const reply = await this.slashCommands.execute(commandName, {
        channelId: data.channelId,
        userId: client.data.userId,
        args: rest.join(' '),
      });
      if (reply.content) {
        const systemMessage = await this.prisma.message.create({
          data: { channelId: data.channelId, content: reply.content, botId: reply.botId },
          include: MESSAGE_AUTHOR_INCLUDE,
        });
        this.server.to(data.channelId).emit('newMessage', systemMessage);
      }
      return;
    }

    // "!" commands (warehouse-floor bots) only intercept when actually
    // registered, unlike "/" which is fully reserved - "!" is common enough
    // in ordinary chat that an unrecognized one should just post as a message.
    if (trimmed.startsWith('!') && !data.attachment) {
      const [commandName, ...rest] = trimmed.slice(1).split(/\s+/);
      if (this.bangCommands.has(commandName)) {
        const reply = await this.bangCommands.execute(commandName, {
          channelId: data.channelId,
          userId: client.data.userId,
          args: rest.join(' '),
        });
        if (reply?.content) {
          const systemMessage = await this.prisma.message.create({
            data: {
              channelId: data.channelId,
              content: reply.content,
              botId: reply.botId,
              attachmentUrl: reply.attachmentUrl,
              attachmentName: reply.attachmentName,
              attachmentMimeType: reply.attachmentMimeType,
              attachmentSize: reply.attachmentSize,
            },
            include: MESSAGE_AUTHOR_INCLUDE,
          });
          // Unlike slash-command replies, these are operationally relevant to
          // the whole team, so they go through the normal notification fan-out.
          this.events.emit(MESSAGE_CREATED_EVENT, systemMessage satisfies MessageCreatedEvent);
        }
        return;
      }
    }

    const message = await this.prisma.message.create({
      data: {
        channelId: data.channelId,
        authorId: client.data.userId,
        content: data.content ?? '',
        attachmentUrl: data.attachment?.url,
        attachmentName: data.attachment?.filename,
        attachmentMimeType: data.attachment?.mimeType,
        attachmentSize: data.attachment?.size,
        replyToId: data.replyToId,
      },
      include: MESSAGE_AUTHOR_INCLUDE,
    });

    // Broadcasting happens in handleMessageCreated below, triggered by this event -
    // the same path a bot posting over the REST API goes through, so there's exactly
    // one place that puts a message on the wire regardless of where it came from.
    this.events.emit(MESSAGE_CREATED_EVENT, message satisfies MessageCreatedEvent);
  }

  // Fired for every newly created regular message (user-sent or bot-posted via REST).
  // Slash-command replies and edits/deletes broadcast directly since they're not part
  // of this "new message" flow (and don't need webhook delivery either).
  @OnEvent(MESSAGE_CREATED_EVENT)
  handleMessageCreated(message: MessageCreatedEvent) {
    this.server.to(message.channelId).emit('newMessage', message);
  }

  @SubscribeMessage('editMessage')
  async handleEditMessage(
    @MessageBody() data: { messageId: string; content: string },
    @ConnectedSocket() client: AuthedSocket,
  ) {
    const existing = await this.prisma.message.findUnique({ where: { id: data.messageId } });
    if (!existing || existing.authorId !== client.data.userId) {
      client.emit('error', { message: 'cannot edit this message' });
      return;
    }

    const message = await this.prisma.message.update({
      where: { id: data.messageId },
      data: { content: data.content, editedAt: new Date() },
      include: MESSAGE_AUTHOR_INCLUDE,
    });

    this.server.to(existing.channelId).emit('messageUpdated', message);
  }

  @SubscribeMessage('deleteMessage')
  async handleDeleteMessage(
    @MessageBody() data: { messageId: string },
    @ConnectedSocket() client: AuthedSocket,
  ) {
    const existing = await this.prisma.message.findUnique({ where: { id: data.messageId } });
    if (!existing || existing.authorId !== client.data.userId) {
      client.emit('error', { message: 'cannot delete this message' });
      return;
    }

    await this.prisma.message.delete({ where: { id: data.messageId } });
    this.server.to(existing.channelId).emit('messageDeleted', { id: data.messageId, channelId: existing.channelId });
    await this.auditLog.log(client.data.userId, 'message.deleted', 'Message', data.messageId, {
      channelId: existing.channelId,
    });
  }

  @SubscribeMessage('markRead')
  async handleMarkRead(@MessageBody() channelId: string, @ConnectedSocket() client: AuthedSocket) {
    await this.channelsService.markRead(channelId, client.data.userId);
    client.to(channelId).emit('read', { channelId, userId: client.data.userId, lastReadAt: new Date() });
  }

  // Fired by the client right after it successfully joins a LiveKit room (voice
  // call). Token minting alone can't tell us this - the client hasn't actually
  // joined the room yet at that point. Only notify other members when this is
  // the FIRST participant, so a call already in progress doesn't re-notify
  // everyone each time someone else joins.
  @SubscribeMessage('voiceJoined')
  async handleVoiceJoined(@MessageBody() data: { channelId: string }, @ConnectedSocket() client: AuthedSocket) {
    await this.channelsService.ensureMembership(data.channelId, client.data.userId);

    const participants = await this.roomService.listParticipants(data.channelId).catch(() => []);
    if (participants.length > 1) return;

    const user = await this.prisma.user.findUnique({
      where: { id: client.data.userId },
      select: { displayName: true },
    });
    const recipients = await this.prisma.channelMember.findMany({
      where: { channelId: data.channelId, userId: { not: client.data.userId }, muted: false },
    });

    for (const recipient of recipients) {
      this.events.emit(NOTIFICATION_EVENT, {
        userId: recipient.userId,
        channelId: data.channelId,
        preview: `🎙️ ${user?.displayName ?? 'Someone'} started a voice call`,
        kind: 'call',
      } satisfies NotificationEvent);
    }
  }

  // Purely ephemeral - no DB write, just relayed to everyone else already in
  // the room. The frontend debounces sends and times out stale indicators.
  @SubscribeMessage('typing')
  handleTyping(@MessageBody() channelId: string, @ConnectedSocket() client: AuthedSocket) {
    client.to(channelId).emit('userTyping', { channelId, userId: client.data.userId });
  }

  @SubscribeMessage('addReaction')
  async handleAddReaction(
    @MessageBody() data: { messageId: string; emoji: string },
    @ConnectedSocket() client: AuthedSocket,
  ) {
    const message = await this.prisma.message.findUnique({ where: { id: data.messageId } });
    if (!message) return;
    await this.channelsService.ensureMembership(message.channelId, client.data.userId);
    await this.prisma.messageReaction.upsert({
      where: {
        messageId_userId_emoji: { messageId: data.messageId, userId: client.data.userId, emoji: data.emoji },
      },
      create: { messageId: data.messageId, userId: client.data.userId, emoji: data.emoji },
      update: {},
    });
    this.server
      .to(message.channelId)
      .emit('reactionAdded', { messageId: data.messageId, userId: client.data.userId, emoji: data.emoji });
  }

  @SubscribeMessage('removeReaction')
  async handleRemoveReaction(
    @MessageBody() data: { messageId: string; emoji: string },
    @ConnectedSocket() client: AuthedSocket,
  ) {
    const message = await this.prisma.message.findUnique({ where: { id: data.messageId } });
    if (!message) return;
    await this.prisma.messageReaction.deleteMany({
      where: { messageId: data.messageId, userId: client.data.userId, emoji: data.emoji },
    });
    this.server
      .to(message.channelId)
      .emit('reactionRemoved', { messageId: data.messageId, userId: client.data.userId, emoji: data.emoji });
  }

  @SubscribeMessage('togglePin')
  async handleTogglePin(@MessageBody() data: { messageId: string }, @ConnectedSocket() client: AuthedSocket) {
    const message = await this.prisma.message.findUnique({ where: { id: data.messageId } });
    if (!message) return;
    await this.channelsService.ensureMembership(message.channelId, client.data.userId);
    const updated = await this.prisma.message.update({
      where: { id: data.messageId },
      data: { pinnedAt: message.pinnedAt ? null : new Date() },
    });
    this.server
      .to(message.channelId)
      .emit('messagePinned', { messageId: data.messageId, pinnedAt: updated.pinnedAt });
    await this.auditLog.log(
      client.data.userId,
      updated.pinnedAt ? 'message.pinned' : 'message.unpinned',
      'Message',
      data.messageId,
      { channelId: message.channelId },
    );
  }

  // Pushed by NotificationsService (regular messages, respecting mute/DM-only) and
  // by the reminder scheduler (always, since a reminder is something you asked for).
  @OnEvent(NOTIFICATION_EVENT)
  handleNotification(payload: NotificationEvent) {
    this.server.in(userRoom(payload.userId)).emit('notification', payload);
  }
}
