import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MESSAGE_AUTHOR_INCLUDE } from '../chat/events';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async searchMessages(userId: string, query: string, channelId?: string) {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const memberships = await this.prisma.channelMember.findMany({
      where: { userId },
      select: { channelId: true },
    });
    const memberChannelIds = memberships.map((m) => m.channelId);

    if (channelId && !memberChannelIds.includes(channelId)) {
      throw new ForbiddenException('not a member of this channel');
    }

    const messages = await this.prisma.message.findMany({
      where: {
        channelId: channelId ?? { in: memberChannelIds },
        content: { contains: trimmed, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        ...MESSAGE_AUTHOR_INCLUDE,
        channel: { select: { id: true, name: true, type: true } },
      },
    });

    return messages;
  }
}
