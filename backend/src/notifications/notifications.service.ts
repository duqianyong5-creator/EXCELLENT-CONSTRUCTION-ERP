import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './notification.entity';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/user.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification) private repo: Repository<Notification>,
    @Inject(forwardRef(() => UsersService)) private usersService: UsersService,
  ) {}

  async create(
    userId: string | null,
    data: {
      title: string;
      content: string;
      type?: string;
      meta?: Record<string, any>;
      notifyAdmins?: boolean;
    },
  ): Promise<Notification[]> {
    const saved: Notification[] = [];

    if (userId) {
      const notif = this.repo.create({ userId, ...data });
      saved.push(await this.repo.save(notif));
    }

    if (data.notifyAdmins) {
      const admins = await this.usersService.findAll({ role: UserRole.ADMIN });
      for (const admin of admins) {
        const notif = this.repo.create({
          userId: admin.id,
          title: data.title,
          content: data.content,
          type: data.type,
          meta: data.meta,
        });
        saved.push(await this.repo.save(notif));
      }
    }

    return saved;
  }

  async findForUser(userId: string): Promise<Notification[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async markRead(id: string, userId: string): Promise<void> {
    await this.repo.update({ id, userId }, { isRead: true });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.repo.update({ userId }, { isRead: true });
  }

  async countUnread(userId: string): Promise<number> {
    return this.repo.count({ where: { userId, isRead: false } });
  }
}
