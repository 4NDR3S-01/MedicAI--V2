import { Module } from '@nestjs/common';

import { MailModule } from '../../infrastructure/mail/mail.module';
import { AuthModule } from '../auth/auth.module';
import { CircleAccessService } from './circle-access.service';
import { CircleController } from './circle.controller';
import { CircleService } from './circle.service';

@Module({
  imports: [AuthModule, MailModule],
  controllers: [CircleController],
  providers: [CircleService, CircleAccessService],
  exports: [CircleAccessService],
})
export class CircleModule {}
