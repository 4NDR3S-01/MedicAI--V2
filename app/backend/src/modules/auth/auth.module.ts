import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { MailModule } from '../../infrastructure/mail/mail.module';
import { AccountExportService } from './account-export.service';
import { AccessTokenService } from './access-token.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt.guard';
import { IpThrottleGuard } from './guards/ip-throttle.guard';

@Module({
  imports: [JwtModule.register({}), MailModule],
  controllers: [AuthController],
  providers: [AuthService, AccessTokenService, AccountExportService, JwtAuthGuard, IpThrottleGuard],
  exports: [AuthService, AccessTokenService, JwtAuthGuard, JwtModule],
})
export class AuthModule {}
