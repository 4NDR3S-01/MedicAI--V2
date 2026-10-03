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
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { SignOptions } from 'jsonwebtoken';

import { getBirthDateIssue } from '../../common/birth-date';
import { MailService } from '../../infrastructure/mail/mail.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { MANAGED_EMAIL_DOMAIN } from '../circle/circle.constants';
import { UpdateProfileDto } from './dto/update-profile.dto';

const EMAIL_TOKEN_TTL_MS = 1000 * 60 * 60 * 24;
const PASSWORD_RESET_TOKEN_TTL_MS = 1000 * 60 * 30;
// Si varias peticiones de la misma app renuevan la sesión a la vez con el mismo
// refresh token, la primera lo rota y las demás reciben el mismo par nuevo
// durante esta ventana en lugar de un 401 que cerraría la sesión.
const REFRESH_REUSE_GRACE_MS = 15_000;

const PROFILE_SELECT = {
  id: true,
  email: true,
  fullName: true,
  birthDate: true,
  phone: true,
  avatar: true,
  conditions: true,
  allergies: true,
  pregnancy: true,
  lactation: true,
  recentSurgeries: true,
  immunosuppression: true,
  anticoagulantTreatment: true,
  notificationLeadMinutes: true,
  aiHealthContextConsent: true,
} satisfies Prisma.UserSelect;

type ProfileUser = Prisma.UserGetPayload<{ select: typeof PROFILE_SELECT }>;

type AuthTokens = { accessToken: string; refreshToken: string };

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
  private readonly recentlyRotatedRefreshTokens = new Map<
    string,
    { userId: string; tokens: AuthTokens; expiresAt: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();

    const birthDate = dto.birthDate?.trim() || null;
    const birthDateIssue = birthDate ? getBirthDateIssue(birthDate) : null;
    if (birthDateIssue) {
      throw new BadRequestException(birthDateIssue);
    }

    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });

    if (existing) {
      throw new BadRequestException('Este correo ya está registrado.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        // Create user with all profile data
        const newUser = await tx.user.create({
          data: {
            email,
            passwordHash,
            fullName: dto.fullName?.trim() || null,
            birthDate,
            phone: dto.phone?.trim() || null,
            conditions: dto.conditions?.trim() || null,
            allergies: dto.allergies?.trim() || null,
            pregnancy: dto.specialConditions?.pregnancy ?? false,
            lactation: dto.specialConditions?.lactation ?? false,
            recentSurgeries: dto.specialConditions?.recentSurgeries ?? false,
            immunosuppression: dto.specialConditions?.immunosuppression ?? false,
            anticoagulantTreatment: dto.specialConditions?.anticoagulantTreatment ?? false,
            aiHealthContextConsent: dto.aiHealthContextConsent ?? false,
            aiHealthContextConsentAt: dto.aiHealthContextConsent ? new Date() : null,
          },
        });

        // Create medications if not deferred
        if (dto.medications && dto.medications.length > 0 && !dto.medicationsDeferred) {
          const validMedications = dto.medications
            .filter((med) => med.name?.trim() && med.dose?.trim() && med.frequency?.trim())
            .map((med) => ({
              userId: newUser.id,
              name: med.name.trim(),
              dosage: med.dose.trim(),
              frequency: med.frequency.trim(),
              times: med.schedule ? [med.schedule.trim()] : [],
            }));

          if (validMedications.length > 0) {
            await tx.medication.createMany({ data: validMedications });
          }
        }

        // Create appointments if not deferred
        if (dto.appointments && dto.appointments.length > 0 && !dto.appointmentsDeferred) {
          const validAppointments = dto.appointments
            .map((apt) => {
              try {
                const [dateStr, timeStr] = [apt.date?.trim(), apt.time?.trim()];
                if (!dateStr || !timeStr) return null;

                const dateTime = new Date(`${dateStr}T${timeStr}:00`);
                if (Number.isNaN(dateTime.getTime())) return null;

                return {
                  userId: newUser.id,
                  title: apt.specialty?.trim() || 'Cita médica',
                  doctorName: '',
                  scheduledAt: dateTime,
                  location: apt.place?.trim() || null,
                };
              } catch (error) {
                this.logger.warn('Failed to parse appointment', { appointment: apt, error });
                return null;
              }
            })
            .filter((apt): apt is NonNullable<typeof apt> => apt !== null);

          if (validAppointments.length > 0) {
            await tx.appointment.createMany({ data: validAppointments });
          }
        }

        return newUser;
      });

      // El correo se envía en segundo plano: la cuenta ya existe y, si Resend
      // falla, el usuario puede pedir otro enlace desde la app. Antes un fallo
      // aquí devolvía error aunque la cuenta se hubiera creado.
      this.runInBackground(this.issueAndSendEmailVerification(user), 'register:verification-email', user.id);
      this.logger.log('User registered with profile', {
        userId: user.id,
        emailDomain: this.getEmailDomain(user.email),
        medicationsCount: dto.medicationsDeferred ? 0 : dto.medications?.length || 0,
        appointmentsCount: dto.appointmentsDeferred ? 0 : dto.appointments?.length || 0,
      });

      return {
        message: 'Cuenta creada. Revisa tu correo para verificar la cuenta.',
      };
    } catch (error) {
      this.logger.error('Registration failed', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Error al registrar la cuenta. Intenta de nuevo.');
    }
  }

  async checkEmailAvailability(emailRaw: string) {
    const email = emailRaw.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });

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

    // Perfil a cargo de otra persona: aún no tiene contraseña propia.
    if (user.isManaged) {
      this.logger.warn('Login rejected', { reason: 'managed_profile', userId: user.id });
      throw new UnauthorizedException('Esta cuenta todavía no está activada. Usa el enlace que te enviaron por correo para crear tu contraseña.');
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
      user: this.mapProfileUser(user),
      ...tokens,
    };
  }

  async refresh(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const presentedHash = this.hashToken(refreshToken);

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, refreshTokenHash: true },
    });

    if (!user?.refreshTokenHash) {
      throw new UnauthorizedException('Sesión inválida.');
    }

    if (!(await this.matchesRefreshTokenHash(refreshToken, presentedHash, user.refreshTokenHash))) {
      const recent = this.takeRecentlyRotated(presentedHash, user.id);
      if (recent) {
        return recent;
      }
      throw new UnauthorizedException('Sesión inválida.');
    }

    const tokens = await this.generateAuthTokens(user.id, user.email);
    await this.setRefreshToken(user.id, tokens.refreshToken);
    this.rememberRotation(presentedHash, user.id, tokens);

    return tokens;
  }

  async logout(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const presentedHash = this.hashToken(refreshToken);
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, refreshTokenHash: true },
    });

    // Solo el refresh token vigente cierra la sesión: uno antiguo (ya rotado)
    // no puede usarse para echar al usuario de su sesión actual.
    const isCurrent = Boolean(
      user?.refreshTokenHash && (await this.matchesRefreshTokenHash(refreshToken, presentedHash, user.refreshTokenHash)),
    );
    if (!isCurrent) {
      return { message: 'Sesión cerrada correctamente.' };
    }

    await this.prisma.user.update({
      where: { id: payload.sub },
      data: { refreshTokenHash: null },
      select: { id: true },
    });
    this.forgetRotationsForUser(payload.sub);
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

    this.runInBackground(this.issueAndSendEmailVerification(user), 'resend-verification', user.id);
    this.logger.log('Verification email resent', { userId: user.id });

    return { message: 'Si el correo existe, se enviará un nuevo enlace.' };
  }

  async requestPasswordReset(emailRaw: string) {
    const email = emailRaw.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Los perfiles a cargo sin correo real (dominio reservado) no reciben nada.
    if (!user || user.email.endsWith(`@${MANAGED_EMAIL_DOMAIN}`)) {
      return { message: 'Si el correo existe, se enviará un enlace para restablecer la contraseña.' };
    }

    // En segundo plano: además de responder antes, evita que el tiempo de
    // respuesta revele si el correo existe (enumeración de usuarios).
    this.runInBackground(this.issueAndSendPasswordReset(user), 'forgot-password', user.id);
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

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: passwordReset.userId },
        data: {
          passwordHash,
          refreshTokenHash: null,
          // Perfil a cargo que recibe su cuenta ("entregar cuenta"): crear la
          // contraseña con el enlace del correo confirma ese correo y lo activa.
          isManaged: false,
          isEmailVerified: true,
        },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: passwordReset.id },
        data: { consumedAt: new Date() },
      }),
    ]);
    this.forgetRotationsForUser(passwordReset.userId);
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

  /**
   * Los refresh tokens son JWT de alta entropía, así que basta un SHA-256 (como
   * con los tokens de correo). bcrypt aquí costaba ~100-400 ms de CPU por
   * operación y además trunca a 72 bytes: todos los refresh tokens de un mismo
   * usuario compartían esos 72 bytes, por lo que cualquier token antiguo no
   * expirado seguía siendo válido tras la rotación.
   */
  private async setRefreshToken(userId: string, refreshToken: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: this.hashToken(refreshToken) },
      select: { id: true },
    });
  }

  private async matchesRefreshTokenHash(rawToken: string, presentedHash: string, storedHash: string) {
    // Hashes bcrypt heredados (sesiones iniciadas antes de este cambio): se
    // aceptan una vez y en la siguiente rotación se guardan como SHA-256.
    if (storedHash.startsWith('$2')) {
      return bcrypt.compare(rawToken, storedHash);
    }

    const presented = Buffer.from(presentedHash, 'hex');
    const stored = Buffer.from(storedHash, 'hex');
    return presented.length === stored.length && timingSafeEqual(presented, stored);
  }

  private rememberRotation(presentedHash: string, userId: string, tokens: AuthTokens) {
    const now = Date.now();
    for (const [key, entry] of this.recentlyRotatedRefreshTokens) {
      if (entry.expiresAt <= now) this.recentlyRotatedRefreshTokens.delete(key);
    }
    this.recentlyRotatedRefreshTokens.set(presentedHash, {
      userId,
      tokens,
      expiresAt: now + REFRESH_REUSE_GRACE_MS,
    });
  }

  private takeRecentlyRotated(presentedHash: string, userId: string) {
    const entry = this.recentlyRotatedRefreshTokens.get(presentedHash);
    if (!entry || entry.userId !== userId || entry.expiresAt <= Date.now()) {
      return undefined;
    }
    return entry.tokens;
  }

  private forgetRotationsForUser(userId: string) {
    for (const [key, entry] of this.recentlyRotatedRefreshTokens) {
      if (entry.userId === userId) this.recentlyRotatedRefreshTokens.delete(key);
    }
  }

  private runInBackground(task: Promise<unknown>, operation: string, userId: string) {
    task.catch((error: unknown) => {
      this.logger.error('Background auth task failed', error as Error, { operation, userId });
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

  // ─── Eliminar cuenta ───────────────────────────────────────────────────────

  /**
   * Perfiles a cargo que solo administra este usuario: si se borra la cuenta,
   * nadie más podría gestionarlos, así que se borran con ella.
   */
  private async findOrphanDependents(userId: string) {
    const managed = await this.prisma.circleGrant.findMany({
      where: { granteeId: userId, manageCircle: true, link: { status: 'ACTIVE' }, owner: { isManaged: true } },
      select: { owner: { select: { id: true, fullName: true } } },
    });
    const orphans: { id: string; fullName: string | null }[] = [];
    for (const { owner } of managed) {
      const others = await this.prisma.circleGrant.count({
        where: { ownerId: owner.id, manageCircle: true, granteeId: { not: userId }, link: { status: 'ACTIVE' } },
      });
      if (!others) orphans.push(owner);
    }
    return orphans;
  }

  async deleteAccountPreview(userId: string) {
    return { dependents: await this.findOrphanDependents(userId) };
  }

  /**
   * Borra la cuenta y TODA su información (medicamentos, tomas, citas,
   * vínculos, permisos, invitaciones y grupos, por cascada) más los perfiles a
   * cargo que se quedarían sin nadie que los administre. Irreversible.
   */
  async deleteAccount(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, passwordHash: true } });
    if (!user) throw new UnauthorizedException('Usuario no encontrado.');
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('La contraseña no es correcta.');
    }

    const orphans = await this.findOrphanDependents(userId);
    await this.prisma.$transaction([
      this.prisma.user.deleteMany({ where: { id: { in: orphans.map((orphan) => orphan.id) }, isManaged: true } }),
      this.prisma.user.delete({ where: { id: userId } }),
    ]);
    this.forgetRotationsForUser(userId);
    this.logger.log('Account deleted', { userId, dependentsDeleted: orphans.length });
    return { message: 'Tu cuenta y tus datos fueron eliminados.' };
  }

  async getProfile(userId: string) {
    if (!userId) {
      throw new UnauthorizedException('Usuario no autenticado.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT });
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado.');
    }

    return { user: this.mapProfileUser(user) };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (!userId) {
      throw new UnauthorizedException('Usuario no autenticado.');
    }

    const data: Record<string, unknown> = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName.trim() || null;
    if (dto.birthDate !== undefined) data.birthDate = dto.birthDate.trim() || null;
    if (dto.phone !== undefined) data.phone = dto.phone.trim() || null;
    if (dto.conditions !== undefined) data.conditions = dto.conditions.trim() || null;
    if (dto.allergies !== undefined) data.allergies = dto.allergies.trim() || null;
    if (dto.pregnancy !== undefined) data.pregnancy = dto.pregnancy;
    if (dto.lactation !== undefined) data.lactation = dto.lactation;
    if (dto.recentSurgeries !== undefined) data.recentSurgeries = dto.recentSurgeries;
    if (dto.immunosuppression !== undefined) data.immunosuppression = dto.immunosuppression;
    if (dto.anticoagulantTreatment !== undefined) data.anticoagulantTreatment = dto.anticoagulantTreatment;
    if (dto.notificationLeadMinutes !== undefined) {
      data.notificationLeadMinutes = dto.notificationLeadMinutes;
    }
    if (dto.birthDate?.trim()) {
      const birthDateIssue = getBirthDateIssue(dto.birthDate.trim());
      if (birthDateIssue) {
        throw new BadRequestException(birthDateIssue);
      }
    }
    if (dto.aiHealthContextConsent !== undefined) {
      data.aiHealthContextConsent = dto.aiHealthContextConsent;
      data.aiHealthContextConsentAt = dto.aiHealthContextConsent ? new Date() : null;
    }

    if (Object.keys(data).length === 0) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT });
      return { message: 'Sin cambios.', user: user ? this.mapProfileUser(user) : null };
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: PROFILE_SELECT,
    });

    this.logger.log('User profile updated', { userId });
    return {
      message: 'Perfil actualizado correctamente.',
      user: this.mapProfileUser(user),
    };
  }

  private mapProfileUser(user: ProfileUser) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      birthDate: user.birthDate,
      phone: user.phone,
      avatar: user.avatar,
      conditions: user.conditions,
      allergies: user.allergies,
      pregnancy: user.pregnancy,
      lactation: user.lactation,
      recentSurgeries: user.recentSurgeries,
      immunosuppression: user.immunosuppression,
      anticoagulantTreatment: user.anticoagulantTreatment,
      notificationLeadMinutes: user.notificationLeadMinutes,
      aiHealthContextConsent: user.aiHealthContextConsent,
    };
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
      select: { avatar: true },
    });

    return {
      message: 'Avatar actualizado correctamente.',
      avatar: user.avatar,
    };
  }
}
