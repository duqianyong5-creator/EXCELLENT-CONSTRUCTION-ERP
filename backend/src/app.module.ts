import { Module, Get, Controller } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TasksModule } from './tasks/tasks.module';
import { GpsModule } from './gps/gps.module';
import { WorkRecordsModule } from './work-records/work-records.module';
import { AdjustmentsModule } from './adjustments/adjustments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { StorageModule } from './common/services/storage.module';

@Controller()
class AppController {
  @Get('ping')
  ping() {
    return { status: 'ok', time: new Date().toISOString() };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        return {
          type: 'postgres' as const,
          host: config.get<string>('DB_HOST'),
          port: config.get<number>('DB_PORT', 5432),
          username: config.get<string>('DB_USER'),
          password: config.get<string>('DB_PASSWORD'),
          database: config.get<string>('DB_NAME') || 'postgres',
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: config.get<string>('NODE_ENV') !== 'production',
          ssl: { rejectUnauthorized: false },
          logging: false,
        };
      },
      inject: [ConfigService],
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    UsersModule,
    TasksModule,
    GpsModule,
    WorkRecordsModule,
    AdjustmentsModule,
    NotificationsModule,
    StorageModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
