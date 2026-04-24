import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend;
  private readonly fromEmail: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.getOrThrow<string>('RESEND_API_KEY');
    this.fromEmail = this.configService.get<string>('MAIL_FROM') || 'MedicAI <onboarding@resend.dev>';
    if (!this.configService.get<string>('MAIL_FROM')) {
      this.logger.warn('MAIL_FROM no está configurado. Se usará MedicAI <onboarding@resend.dev>.');
    }
    this.resend = new Resend(apiKey);
  }

  async sendVerificationEmail(params: {
    to: string;
    fullName?: string | null;
    verificationUrl: string;
  }) {
    const name = params.fullName?.trim() || 'Hola';

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;max-width:560px;margin:0 auto;">
        <h2 style="margin-bottom:8px;">Verifica tu correo en MedicAI</h2>
        <p>Hola ${name},</p>
        <p>Gracias por registrarte. Confirma tu correo para activar tu cuenta.</p>
        <p style="margin:24px 0;">
          <a href="${params.verificationUrl}" style="background:#0f766e;color:#fff;padding:12px 18px;text-decoration:none;border-radius:8px;display:inline-block;">
            Verificar correo
          </a>
        </p>
        <p style="font-size:13px;color:#555;word-break:break-word;">
          Si el botón no funciona, abre este enlace:
          <br />
          <a href="${params.verificationUrl}" style="color:#0f766e;">${params.verificationUrl}</a>
        </p>
        <p>Si no solicitaste esta cuenta, ignora este mensaje.</p>
      </div>
    `;
    const text = [
      `Verifica tu correo en MedicAI`,
      `Hola ${name},`,
      `Confirma tu correo para activar tu cuenta.`,
      `Si el botón no funciona, abre este enlace: ${params.verificationUrl}`,
      `Si no solicitaste esta cuenta, ignora este mensaje.`,
    ].join('\n\n');

    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to: params.to,
        subject: 'Verifica tu correo de MedicAI',
        html,
        text,
      });
    } catch (error) {
      this.logger.error('Failed to send verification email', error as Error);
      throw error;
    }
  }

  async sendPasswordResetEmail(params: {
    to: string;
    fullName?: string | null;
    resetUrl: string;
  }) {
    const name = params.fullName?.trim() || 'Hola';

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;max-width:560px;margin:0 auto;">
        <h2 style="margin-bottom:8px;">Restablece tu contraseña en MedicAI</h2>
        <p>Hola ${name},</p>
        <p>Recibimos una solicitud para restablecer tu contraseña.</p>
        <p style="margin:24px 0;">
          <a href="${params.resetUrl}" style="background:#0f766e;color:#fff;padding:12px 18px;text-decoration:none;border-radius:8px;display:inline-block;">
            Restablecer contraseña
          </a>
        </p>
        <p style="font-size:13px;color:#555;word-break:break-word;">
          Si el botón no funciona, abre este enlace:
          <br />
          <a href="${params.resetUrl}" style="color:#0f766e;">${params.resetUrl}</a>
        </p>
        <p>Si no solicitaste este cambio, ignora este mensaje.</p>
      </div>
    `;
    const text = [
      `Restablece tu contraseña en MedicAI`,
      `Hola ${name},`,
      `Recibimos una solicitud para restablecer tu contraseña.`,
      `Si el botón no funciona, abre este enlace: ${params.resetUrl}`,
      `Si no solicitaste este cambio, ignora este mensaje.`,
    ].join('\n\n');

    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to: params.to,
        subject: 'Recuperación de contraseña de MedicAI',
        html,
        text,
      });
    } catch (error) {
      this.logger.error('Failed to send password reset email', error as Error);
      throw error;
    }
  }
}
