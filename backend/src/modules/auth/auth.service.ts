import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { SignOptions } from 'jsonwebtoken';

import { MailService } from '../../infrastructure/mail/mail.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const EMAIL_TOKEN_TTL_MS = 1000 * 60 * 60 * 24;
const PASSWORD_RESET_TOKEN_TTL_MS = 1000 * 60 * 30;

@Injectable()
export class AuthService {
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
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException('Debes verificar tu correo electronico antes de iniciar sesion.');
    }

    const tokens = await this.generateAuthTokens(user.id, user.email);
    await this.setRefreshToken(user.id, tokens.refreshToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      ...tokens,
    };
  }

  async refresh(refreshToken: string, userId: string) {
    const payload = await this.verifyRefreshToken(refreshToken);

    if (payload.sub !== userId) {
      throw new UnauthorizedException('Token no pertenece al usuario autenticado.');
    }

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

    return { message: 'Sesión cerrada correctamente.' };
  }

  async verifyEmailToken(rawToken: string) {
    if (!rawToken) {
      throw new BadRequestException('Token de verificación requerido.');
    }

    const tokenHash = this.hashToken(rawToken);
    const verification = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!verification) {
      throw new BadRequestException('Token inválido.');
    }

    if (verification.consumedAt) {
      throw new BadRequestException('Este token ya fue utilizado.');
    }

    if (verification.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Token expirado. Solicita uno nuevo.');
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

    return { message: 'Si el correo existe, se enviará un nuevo enlace.' };
  }

  async requestPasswordReset(emailRaw: string) {
    const email = emailRaw.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      return { message: 'Si el correo existe, se enviará un enlace para restablecer la contraseña.' };
    }

    await this.issueAndSendPasswordReset(user);

    return { message: 'Si el correo existe, se enviará un enlace para restablecer la contraseña.' };
  }

  async resetPassword(rawToken: string, newPassword: string) {
    if (!rawToken) {
      throw new BadRequestException('Token de restablecimiento requerido.');
    }

    const tokenHash = this.hashToken(rawToken);
    const passwordReset = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!passwordReset) {
      throw new BadRequestException('Token inválido.');
    }

    if (passwordReset.consumedAt) {
      throw new BadRequestException('Este token ya fue utilizado.');
    }

    if (passwordReset.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Token expirado. Solicita uno nuevo.');
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
}
