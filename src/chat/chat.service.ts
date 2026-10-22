import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  /// ✅ SEND MESSAGE
  async sendMessage(data: {
    senderId: number;
    receiverId: number;
    propertyId: number;
    message: string;
  }) {
    if (!data.senderId || !data.receiverId || !data.propertyId) {
      throw new BadRequestException('Invalid message data');
    }

    return this.prisma.message.create({
      data: {
        senderId: data.senderId,
        receiverId: data.receiverId,
        propertyId: data.propertyId,
        message: data.message,
      },
    });
  }

  /// ✅ GET MESSAGES BETWEEN 2 USERS (SAFE)
  async getMessages(
    propertyId: number,
    userId: number,
    otherUserId: number,
  ) {
    if (!propertyId || !userId || !otherUserId) {
      throw new BadRequestException('Invalid parameters');
    }

    return this.prisma.message.findMany({
      where: {
        propertyId,
        OR: [
          {
            senderId: userId,
            receiverId: otherUserId,
          },
          {
            senderId: otherUserId,
            receiverId: userId,
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /// ✅ CHAT LIST (LATEST MESSAGE PER USER)
async getChatList(userId: number) {
  const messages = await this.prisma.message.findMany({
    where: {
      OR: [
        { senderId: userId },
        { receiverId: userId },
      ],
    },
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      sender: true,   // 👈 JOIN USER
      receiver: true, // 👈 JOIN USER
    },
  });

  const map = new Map<number, any>();

  for (const msg of messages) {
    const isSender = msg.senderId === userId;

    const otherUser = isSender ? msg.receiver : msg.sender;

    if (otherUser && !map.has(otherUser.id)) {
      map.set(otherUser.id, {
        ...msg,
        otherUserId: otherUser.id,
        otherUserName: otherUser.name || otherUser.mobile || 'User',
      });
    }
  }

  return Array.from(map.values());
}
}