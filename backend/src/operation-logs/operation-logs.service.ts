import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OperationLog } from './operation-log.entity';

export interface OperationLogInput {
  actorId?: string | null;
  actorName?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  description: string;
  details?: Record<string, any> | null;
}

@Injectable()
export class OperationLogsService {
  constructor(
    @InjectRepository(OperationLog) private repo: Repository<OperationLog>,
  ) {}

  async record(input: OperationLogInput): Promise<OperationLog> {
    const log = this.repo.create({
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      description: input.description,
      details: input.details ?? null,
    });
    return this.repo.save(log);
  }

  async findRecent(limit = 100): Promise<OperationLog[]> {
    return this.repo.find({
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 200),
      relations: ['actor'],
    });
  }
}
