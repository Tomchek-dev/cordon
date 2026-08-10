import { Injectable } from '@nestjs/common';
import { AccessToken } from 'livekit-server-sdk';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VoiceService {
  constructor(private readonly prisma: PrismaService) {}

  async createToken(channelId: string, userId: string) {
    const [user, channel] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.channel.findUnique({ where: { id: channelId } }),
    ]);

    // Announcement channels are listen-only for everyone except ADMIN - this
    // is the actual enforcement point; the frontend's hide-the-mic-button
    // behavior is just presentation on top of it.
    const canPublish = !channel?.isAnnouncementChannel || user.role === 'ADMIN';

    const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
      identity: user.id,
      name: user.displayName,
      ttl: '4h',
    });
    token.addGrant({
      room: channelId,
      roomJoin: true,
      canPublish,
      canSubscribe: true,
    });

    return {
      token: await token.toJwt(),
      wsUrl: process.env.LIVEKIT_WS_URL,
      roomName: channelId,
    };
  }
}
