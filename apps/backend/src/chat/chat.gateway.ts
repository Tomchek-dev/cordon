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
import { PrismaService } from '../prisma/prisma.service';
import { ChannelsService, CHANNEL_CREATED_EVENT } from '../channels/channels.service';
import type { ChannelCreatedEvent } from '../channels/channels.service';
import { PresenceService, PRESENCE_CHANNEL } from '../presence/presence.service';
import type { PresenceStatus } from '../presence/presence.service';
import { RedisService } from '../redis/redis.service';
import { SlashCommandsService } from './slash-commands.service';
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

@WebSocketGateway({ cors: { origin: process.env.FRONTEND_ORIGIN ?? '*' } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  // Tracks how many live sockets a user has open, so presence only flips to
  // OFFLINE once their last connection actually drops (they may have multiple tabs).
  private readonly connectionsByUser = new Map<string, number>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly channelsService: ChannelsService,
    private readonly presenceService: PresenceService,
    private readonly redis: RedisService,
    private readonly slashCommands: SlashCommandsService,
    private readonly events: EventEmitter2,
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
    @MessageBody() status: PresenceStatus,
    @ConnectedSocket() client: AuthedSocket,
  ) {
    if (status !== 'ONLINE' && status !== 'AWAY' && status !== 'BUSY') return;
    await this.presenceService.setStatus(client.data.userId, status);
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

    const message = await this.prisma.message.create({
      data: {
        channelId: data.channelId,
        authorId: client.data.userId,
        content: data.content ?? '',
        attachmentUrl: data.attachment?.url,
        attachmentName: data.attachment?.filename,
        attachmentMimeType: data.attachment?.mimeType,
        attachmentSize: data.attachment?.size,
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
  }

  @SubscribeMessage('markRead')
  async handleMarkRead(@MessageBody() channelId: string, @ConnectedSocket() client: AuthedSocket) {
    await this.channelsService.markRead(channelId, client.data.userId);
  }

  // Pushed by NotificationsService (regular messages, respecting mute/DM-only) and
  // by the reminder scheduler (always, since a reminder is something you asked for).
  @OnEvent(NOTIFICATION_EVENT)
  handleNotification(payload: NotificationEvent) {
    this.server.in(userRoom(payload.userId)).emit('notification', payload);
  }
}
