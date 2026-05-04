import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Task } from '../tasks/task.entity';

export enum AnomalyType {
  GPS_DISCONNECT = 'gps_disconnect',
  SPEED_ANOMALY = 'speed_anomaly',
  TELEPORT = 'teleport',
  TIME_INCONSISTENCY = 'time_inconsistency',
}

@Entity('gps_anomalies')
export class GpsAnomaly {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'driver_id' })
  driverId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'driver_id' })
  driver: User;

  @Column({ name: 'task_id', nullable: true })
  taskId: string;

  @ManyToOne(() => Task, { nullable: true })
  @JoinColumn({ name: 'task_id' })
  task: Task;

  @Column({ name: 'anomaly_type', type: 'enum', enum: AnomalyType })
  anomalyType: AnomalyType;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  speed: number;

  @CreateDateColumn({ name: 'detected_at' })
  detectedAt: Date;

  @Column({ default: false })
  resolved: boolean;

  @Column({ name: 'resolved_at', nullable: true })
  resolvedAt: Date;

  @Column({ name: 'resolved_by', nullable: true })
  resolvedBy: string;
}
