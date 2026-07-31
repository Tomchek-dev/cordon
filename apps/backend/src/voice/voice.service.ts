import { Injectable } from '@nestjs/common';
import { AccessToken } from 'livekit-server-sdk';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VoiceService {
  constructor(private readonly prisma: PrismaService) {}

  async createToken(channelId: string, userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
      identity: user.id,
      name: user.displayName,
      ttl: '4h',
    });
    token.addGrant({
      room: channelId,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    return {
      token: await token.toJwt(),
      wsUrl: process.env.LIVEKIT_WS_URL,
      roomName: channelId,
    };
  }
}
