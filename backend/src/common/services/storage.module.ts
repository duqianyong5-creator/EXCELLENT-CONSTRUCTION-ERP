import { Module, Global } from '@nestjs/common';
import { StorageService } from './storage.service';
import { EmailService } from './email.service';

@Global()
@Module({
  providers: [StorageService, EmailService],
  exports: [StorageService, EmailService],
})
export class StorageModule {}
