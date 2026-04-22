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

import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const EMAIL_TOKEN_TTL_MS = 1000 * 60 * 60 * 24;

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
      throw new BadRequestException('El correo ya esta registrado.');
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

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new UnauthorizedException('Credenciales invalidas.');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales invalidas.');
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException('Debes verificar tu correo antes de iniciar sesion.');
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

  async refresh(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user?.refreshTokenHash) {
      throw new UnauthorizedException('Sesion invalida.');
    }

    const isValidRefresh = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!isValidRefresh) {
      throw new UnauthorizedException('Sesion invalida.');
    }

    const tokens = await this.generateAuthTokens(user.id, user.email);
    await this.setRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async logout(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);

    await this.prisma.user.update({
      where: { id: payload.sub },
      data: { refreshTokenHash: null },
    });

    return { message: 'Sesion cerrada correctamente.' };
  }

  async verifyEmailToken(rawToken: string) {
    if (!rawToken) {
      throw new BadRequestException('Token de verificacion requerido.');
    }

    const tokenHash = this.hashToken(rawToken);
    const verification = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!verification) {
      throw new BadRequestException('Token invalido.');
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
      return { message: 'Si el correo existe, se enviara un nuevo enlace.' };
    }

    if (user.isEmailVerified) {
      return { message: 'Este correo ya se encuentra verificado.' };
    }

    await this.issueAndSendEmailVerification(user);

    return { message: 'Si el correo existe, se enviara un nuevo enlace.' };
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

    const baseUrl = this.configService.getOrThrow<string>('APP_BASE_URL');
    const verificationUrl = `${baseUrl}/auth/verify-email?token=${token}`;

    await this.mailService.sendVerificationEmail({
      to: user.email,
      fullName: user.fullName,
      verificationUrl,
    });
  }

  private hashToken(rawToken: string) {
    return createHash('sha256').update(rawToken).digest('hex');
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
      throw new UnauthorizedException('Refresh token invalido o expirado.');
    }
  }
}
