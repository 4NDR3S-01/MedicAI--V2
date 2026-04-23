import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  Request,
  UnauthorizedException,
} from '@nestjs/common';

import { AuthService } from './auth.service';
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
  constructor(private readonly authService: AuthService) {}

  @UseGuards(IpThrottleGuard)
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
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

  @Get('verify-email')
  verifyEmailFromLink(@Query('token') token: string) {
    return this.authService.verifyEmailToken(token);
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
}
