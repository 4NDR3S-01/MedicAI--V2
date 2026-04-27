import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Redirect,
  UseGuards,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { CheckEmailDto } from './dto/check-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { JwtAuthGuard } from './guards/jwt.guard';
import { IpThrottleGuard } from './guards/ip-throttle.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @UseGuards(IpThrottleGuard)
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('check-email')
  checkEmail(@Body() dto: CheckEmailDto) {
    return this.authService.checkEmailAvailability(dto.email);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto, @Request() req: any) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Token inválido.');
    }
    return this.authService.refresh(dto.refreshToken, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Body() dto: RefreshTokenDto, @Request() req: any) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Token inválido.');
    }
    return this.authService.logout(userId, dto.refreshToken);
  }

  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmailToken(dto.token);
  }

  @Redirect()
  @Get('verify-email')
  verifyEmailFromLink(@Query('token') token: string) {
    if (!token) {
      throw new BadRequestException('Token de verificación requerido.');
    }

    const deepLinkBase = (
      this.configService.get<string>('APP_DEEP_LINK_BASE_URL')
      || 'medicai://auth'
    ).replace(/\/$/, '');

    return {
      url: `${deepLinkBase}/verify-email?token=${encodeURIComponent(token)}`,
    };
  }

  @Post('resend-verification')
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto.email);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Redirect()
  @Get('reset-password')
  redirectResetPasswordFromLink(@Query('token') token: string) {
    if (!token) {
      throw new BadRequestException('Token de restablecimiento requerido.');
    }

    const deepLinkBase = (
      this.configService.get<string>('APP_DEEP_LINK_BASE_URL')
      || 'medicai://auth'
    ).replace(/\/$/, '');

    return {
      url: `${deepLinkBase}/reset-password?token=${encodeURIComponent(token)}`,
    };
  }
}
