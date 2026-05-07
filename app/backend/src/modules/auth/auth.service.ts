import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { SignOptions } from 'jsonwebtoken';

import { MailService } from '../../infrastructure/mail/mail.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const EMAIL_TOKEN_TTL_MS = 1000 * 60 * 60 * 24;
const PASSWORD_RESET_TOKEN_TTL_MS = 1000 * 60 * 30;

type AuthTokenValidationStatus = 'valid' | 'used' | 'expired' | 'invalid' | 'already_verified';

type AuthTokenValidationResult = {
  status: AuthTokenValidationStatus;
  message: string;
};

type EmailVerificationTokenRecord = Prisma.EmailVerificationTokenGetPayload<{
  include: { user: true };
}>;

type PasswordResetTokenRecord = Prisma.PasswordResetTokenGetPayload<{
  include: { user: true };
}>;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing) {
      throw new BadRequestException('Este correo ya está registrado.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: dto.fullName?.trim() || null,
      },
    });

    await this.issueAndSendEmailVerification(user);
    this.logger.log('User registered', {
      userId: user.id,
      emailDomain: this.getEmailDomain(user.email),
    });

    return {
      message: 'Cuenta creada. Revisa tu correo para verificar la cuenta.',
    };
  }

  async checkEmailAvailability(emailRaw: string) {
    const email = emailRaw.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing) {
      return {
        available: false,
        message: 'Este correo ya está en uso. Inicia sesión o recupera tu contraseña.',
      };
    }

    return {
      available: true,
      message: 'Correo disponible.',
    };
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      this.logger.warn('Login rejected', {
        reason: 'invalid_credentials',
        emailDomain: this.getEmailDomain(email),
      });
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      this.logger.warn('Login rejected', {
        reason: 'invalid_credentials',
        userId: user.id,
        emailDomain: this.getEmailDomain(user.email),
      });
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
    }

    if (!user.isEmailVerified) {
      this.logger.warn('Login rejected', {
        reason: 'email_not_verified',
        userId: user.id,
      });
      throw new UnauthorizedException('Debes verificar tu correo electronico antes de iniciar sesion.');
    }

    const tokens = await this.generateAuthTokens(user.id, user.email);
    await this.setRefreshToken(user.id, tokens.refreshToken);
    this.logger.log('Login succeeded', { userId: user.id });

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        avatar: user.avatar,
      },
      ...tokens,
    };
  }

  async refresh(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user?.refreshTokenHash) {
      throw new UnauthorizedException('Sesión inválida.');
    }

    const isValidRefresh = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!isValidRefresh) {
      throw new UnauthorizedException('Sesión inválida.');
    }

    const tokens = await this.generateAuthTokens(user.id, user.email);
    await this.setRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async logout(userId: string, refreshToken: string) {
    if (!userId) {
      throw new UnauthorizedException('Usuario no autenticado.');
    }

    const payload = await this.verifyRefreshToken(refreshToken);

    if (payload.sub !== userId) {
      throw new UnauthorizedException('Token no pertenece al usuario autenticado.');
    }

    await this.prisma.user.update({
      where: { id: payload.sub },
      data: { refreshTokenHash: null },
    });
    this.logger.log('Logout succeeded', { userId: payload.sub });

    return { message: 'Sesión cerrada correctamente.' };
  }

  async validateEmailVerificationToken(rawToken: string): Promise<AuthTokenValidationResult> {
    if (!rawToken) {
      throw new BadRequestException('Token de verificación requerido.');
    }

    const verification = await this.findEmailVerificationToken(rawToken);
    return this.resolveEmailVerificationTokenStatus(verification);
  }

  async verifyEmailToken(rawToken: string) {
    if (!rawToken) {
      throw new BadRequestException('Token de verificación requerido.');
    }

    const verification = await this.findEmailVerificationToken(rawToken);
    const validation = this.resolveEmailVerificationTokenStatus(verification);

    if (!verification) {
      throw new BadRequestException(validation.message);
    }

    if (
      validation.status === 'invalid'
      || validation.status === 'used'
      || validation.status === 'expired'
    ) {
      throw new BadRequestException(validation.message);
    }

    if (validation.status === 'already_verified') {
      if (!verification.consumedAt) {
        await this.prisma.emailVerificationToken.update({
          where: { id: verification.id },
          data: { consumedAt: new Date() },
        });
      }

      return { message: validation.message };
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: verification.userId },
        data: { isEmailVerified: true },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: verification.id },
        data: { consumedAt: new Date() },
      }),
    ]);
    this.logger.log('Email verified', { userId: verification.userId });

    return { message: 'Correo verificado correctamente.' };
  }

  async resendVerification(emailRaw: string) {
    const email = emailRaw.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      return { message: 'Si el correo existe, se enviará un nuevo enlace.' };
    }

    if (user.isEmailVerified) {
      return { message: 'Este correo ya se encuentra verificado.' };
    }

    await this.issueAndSendEmailVerification(user);
    this.logger.log('Verification email resent', { userId: user.id });

    return { message: 'Si el correo existe, se enviará un nuevo enlace.' };
  }

  async requestPasswordReset(emailRaw: string) {
    const email = emailRaw.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      return { message: 'Si el correo existe, se enviará un enlace para restablecer la contraseña.' };
    }

    await this.issueAndSendPasswordReset(user);
    this.logger.log('Password reset requested', { userId: user.id });

    return { message: 'Si el correo existe, se enviará un enlace para restablecer la contraseña.' };
  }

  async validatePasswordResetToken(rawToken: string): Promise<AuthTokenValidationResult> {
    if (!rawToken) {
      throw new BadRequestException('Token de restablecimiento requerido.');
    }

    const passwordReset = await this.findPasswordResetToken(rawToken);
    return this.resolvePasswordResetTokenStatus(passwordReset);
  }

  async resetPassword(rawToken: string, newPassword: string) {
    if (!rawToken) {
      throw new BadRequestException('Token de restablecimiento requerido.');
    }

    const passwordReset = await this.findPasswordResetToken(rawToken);
    const validation = this.resolvePasswordResetTokenStatus(passwordReset);

    if (!passwordReset || validation.status !== 'valid') {
      throw new BadRequestException(validation.message);
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: passwordReset.userId },
        data: {
          passwordHash,
          refreshTokenHash: null,
        },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: passwordReset.id },
        data: { consumedAt: new Date() },
      }),
    ]);
    this.logger.log('Password reset completed', { userId: passwordReset.userId });

    return { message: 'Contraseña actualizada correctamente.' };
  }

  private async issueAndSendEmailVerification(user: User) {
    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);

    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS),
      },
    });

    const verificationUrl = this.buildAppAuthLink('verify-email', token);

    await this.mailService.sendVerificationEmail({
      to: user.email,
      fullName: user.fullName,
      verificationUrl,
    });
  }

  private async issueAndSendPasswordReset(user: User) {
    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
      },
    });

    const resetUrl = this.buildAppAuthLink('reset-password', token);

    await this.mailService.sendPasswordResetEmail({
      to: user.email,
      fullName: user.fullName,
      resetUrl,
    });
  }

  private hashToken(rawToken: string) {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private getEmailDomain(email: string) {
    const parts = email.split('@');
    return parts[parts.length - 1]?.toLowerCase() || 'unknown';
  }

  private async findEmailVerificationToken(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);

    return this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
  }

  private async findPasswordResetToken(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);

    return this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
  }

  private resolveEmailVerificationTokenStatus(
    verification: EmailVerificationTokenRecord | null,
  ): AuthTokenValidationResult {
    if (!verification) {
      return {
        status: 'invalid',
        message: 'El enlace de verificación no es válido.',
      };
    }

    if (verification.user.isEmailVerified) {
      return {
        status: 'already_verified',
        message: 'Tu correo ya fue confirmado. Ya puedes iniciar sesión.',
      };
    }

    if (verification.consumedAt) {
      return {
        status: 'used',
        message: 'Este enlace de verificación ya fue utilizado.',
      };
    }

    if (verification.expiresAt.getTime() < Date.now()) {
      return {
        status: 'expired',
        message: 'Este enlace de verificación expiró. Solicita uno nuevo desde la app.',
      };
    }

    return {
      status: 'valid',
      message: 'Token válido.',
    };
  }

  private resolvePasswordResetTokenStatus(
    passwordReset: PasswordResetTokenRecord | null,
  ): AuthTokenValidationResult {
    if (!passwordReset) {
      return {
        status: 'invalid',
        message: 'El enlace de recuperación no es válido.',
      };
    }

    if (passwordReset.consumedAt) {
      return {
        status: 'used',
        message: 'Este enlace de recuperación ya fue utilizado.',
      };
    }

    if (passwordReset.expiresAt.getTime() < Date.now()) {
      return {
        status: 'expired',
        message: 'Este enlace de recuperación expiró. Solicita uno nuevo desde la app.',
      };
    }

    return {
      status: 'valid',
      message: 'Token válido.',
    };
  }

  private buildAppAuthLink(route: 'verify-email' | 'reset-password', token: string) {
    const webBaseUrl = this.configService.getOrThrow<string>('APP_BASE_URL').replace(/\/$/, '');

    return `${webBaseUrl}/auth/${route}?token=${encodeURIComponent(token)}`;
  }

  private async generateAuthTokens(userId: string, email: string) {
    const accessSecret = this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');
    const refreshSecret = this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    const accessTtl = this.configService.getOrThrow<string>('JWT_ACCESS_EXPIRES_IN');
    const refreshTtl = this.configService.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email },
        {
          secret: accessSecret,
          expiresIn: accessTtl as SignOptions['expiresIn'],
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, email },
        {
          secret: refreshSecret,
          expiresIn: refreshTtl as SignOptions['expiresIn'],
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  private async setRefreshToken(userId: string, refreshToken: string) {
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash },
    });
  }

  private async verifyRefreshToken(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token requerido.');
    }

    const refreshSecret = this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');

    try {
      return await this.jwtService.verifyAsync<{ sub: string; email: string }>(
        refreshToken,
        {
          secret: refreshSecret,
        },
      );
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado.');
    }
  }

  async updateAvatar(userId: string, avatarData: string) {
    if (!userId) {
      throw new UnauthorizedException('Usuario no autenticado.');
    }

    if (!avatarData || avatarData.trim() === '') {
      throw new BadRequestException('Datos de avatar inválidos.');
    }

    // Validar que sea JSON válido
    try {
      JSON.parse(avatarData);
    } catch {
      throw new BadRequestException('Los datos del avatar deben ser JSON válido.');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarData },
    });

    return {
      message: 'Avatar actualizado correctamente.',
      avatar: user.avatar,
    };
  }
}
