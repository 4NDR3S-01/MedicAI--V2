import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

type ActionEmailTemplateParams = {
  preview: string;
  eyebrow: string;
  title: string;
  greeting: string;
  intro: string;
  actionLabel: string;
  actionUrl: string;
  securityNote: string;
  expiresIn: string;
  helpText: string;
  ignoreText: string;
};

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
    const greeting = params.fullName?.trim() || 'Hola';
    const template = this.buildActionEmailTemplate({
      preview: 'Confirma tu correo para activar tu cuenta de MedicAI.',
      eyebrow: 'Verificación de cuenta',
      title: 'Confirma tu correo y activa tu cuenta',
      greeting,
      intro: 'Gracias por registrarte en MedicAI. Para proteger tu cuenta, necesitamos confirmar que este correo realmente te pertenece.',
      actionLabel: 'Confirmar correo en MedicAI',
      actionUrl: params.verificationUrl,
      securityNote: 'El enlace abrirá una página segura que intentará llevarte directamente a la app. Si no se abre automáticamente, verás una pantalla intermedia con instrucciones.',
      expiresIn: 'Este enlace de verificación estará disponible durante 24 horas.',
      helpText: 'Si no ves este correo en tu bandeja principal, revisa spam o correo no deseado.',
      ignoreText: 'Si no creaste esta cuenta, puedes ignorar este mensaje sin realizar ninguna acción.',
    });

    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to: params.to,
        subject: 'Verifica tu correo de MedicAI',
        html: template.html,
        text: template.text,
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
    const greeting = params.fullName?.trim() || 'Hola';
    const template = this.buildActionEmailTemplate({
      preview: 'Usa este enlace para crear una nueva contraseña en MedicAI.',
      eyebrow: 'Seguridad de cuenta',
      title: 'Restablece tu contraseña',
      greeting,
      intro: 'Recibimos una solicitud para cambiar la contraseña de tu cuenta. Si fuiste tú, continúa desde el siguiente enlace seguro.',
      actionLabel: 'Crear nueva contraseña',
      actionUrl: params.resetUrl,
      securityNote: 'Por seguridad, te llevaremos primero a una pantalla segura que intentará abrir la app. Desde allí podrás continuar con el cambio de contraseña.',
      expiresIn: 'Este enlace de recuperación estará disponible durante 30 minutos.',
      helpText: 'Si no solicitaste este cambio, te recomendamos ignorar este mensaje y conservar tu contraseña actual.',
      ignoreText: 'Nadie podrá cambiar tu contraseña si no abre este enlace y completa el proceso desde la app.',
    });

    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to: params.to,
        subject: 'Recuperación de contraseña de MedicAI',
        html: template.html,
        text: template.text,
      });
    } catch (error) {
      this.logger.error('Failed to send password reset email', error as Error);
      throw error;
    }
  }

  private buildActionEmailTemplate(params: ActionEmailTemplateParams) {
    const brandColor = '#12A594';
    const brandDark = '#10243A';
    const mutedText = '#58728B';
    const surfaceBorder = '#D6E3EF';
    const surfaceSoft = '#F3F8FC';
    const linkText = '#1B86E3';

    const html = `
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${this.escapeHtml(params.title)}</title>
        </head>
        <body style="margin:0;padding:0;background:#EDF4F8;font-family:Arial,sans-serif;color:${brandDark};">
          <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
            ${this.escapeHtml(params.preview)}
          </div>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EDF4F8;padding:28px 14px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border:1px solid ${surfaceBorder};border-radius:24px;overflow:hidden;">
                  <tr>
                    <td style="padding:30px 30px 18px;background:linear-gradient(135deg,#0E2238 0%,#173D58 100%);">
                      <div style="display:inline-block;padding:7px 12px;border-radius:999px;background:rgba(255,255,255,0.14);color:#E7F8F6;font-size:12px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;">
                        ${this.escapeHtml(params.eyebrow)}
                      </div>
                      <div style="margin-top:18px;font-size:30px;font-weight:800;line-height:1.15;color:#FFFFFF;">
                        MedicAI
                      </div>
                      <div style="margin-top:12px;font-size:25px;font-weight:800;line-height:1.25;color:#FFFFFF;">
                        ${this.escapeHtml(params.title)}
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:28px 30px 32px;">
                      <p style="margin:0 0 14px;font-size:16px;line-height:1.7;color:${brandDark};">
                        Hola ${this.escapeHtml(params.greeting)},
                      </p>
                      <p style="margin:0 0 18px;font-size:15px;line-height:1.75;color:${brandDark};">
                        ${this.escapeHtml(params.intro)}
                      </p>

                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:${surfaceSoft};border:1px solid ${surfaceBorder};border-radius:18px;">
                        <tr>
                          <td style="padding:18px 18px 12px;">
                            <div style="font-size:13px;font-weight:700;color:${brandDark};text-transform:uppercase;letter-spacing:0.3px;">
                              Acción segura
                            </div>
                            <p style="margin:10px 0 0;font-size:14px;line-height:1.7;color:${mutedText};">
                              ${this.escapeHtml(params.securityNote)}
                            </p>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:8px 18px 20px;">
                            <a href="${this.escapeHtml(params.actionUrl)}" style="display:inline-block;background:${brandColor};color:#073730;text-decoration:none;padding:14px 22px;border-radius:14px;font-size:15px;font-weight:800;">
                              ${this.escapeHtml(params.actionLabel)}
                            </a>
                          </td>
                        </tr>
                      </table>

                      <p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:${mutedText};">
                        ${this.escapeHtml(params.expiresIn)}
                      </p>
                      <p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:${mutedText};">
                        ${this.escapeHtml(params.helpText)}
                      </p>
                      <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:${mutedText};">
                        ${this.escapeHtml(params.ignoreText)}
                      </p>

                      <div style="padding:16px 16px 0;border-top:1px solid ${surfaceBorder};">
                        <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:${brandDark};">
                          Si el botón no funciona, usa este enlace:
                        </p>
                        <a href="${this.escapeHtml(params.actionUrl)}" style="font-size:13px;line-height:1.7;color:${linkText};word-break:break-word;text-decoration:none;">
                          ${this.escapeHtml(params.actionUrl)}
                        </a>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;

    const text = [
      `MedicAI`,
      `${params.title}`,
      `Hola ${params.greeting},`,
      params.intro,
      `${params.actionLabel}: ${params.actionUrl}`,
      params.securityNote,
      params.expiresIn,
      params.helpText,
      params.ignoreText,
    ].join('\n\n');

    return { html, text };
  }

  private escapeHtml(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}
