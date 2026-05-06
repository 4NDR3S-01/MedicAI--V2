import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request as ExpressRequest, Response } from 'express';

type AuthBridgePageVariant = 'success' | 'warning' | 'error' | 'info';

import { AuthService } from './auth.service';
import { CheckEmailDto } from './dto/check-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { TokenDto } from './dto/token.dto';
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

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
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

  @Post('verify-email/validate')
  validateVerifyEmailToken(@Body() dto: TokenDto) {
    return this.authService.validateEmailVerificationToken(dto.token);
  }

  @Get('verify-email')
  async verifyEmailFromLink(
    @Query('token') token: string,
    @Req() req: ExpressRequest,
    @Res() res: Response,
  ) {
    if (!token) {
      throw new BadRequestException('Token de verificación requerido.');
    }

    if (this.redirectToPublicAuthPageIfNeeded(req, res, 'verify-email', token)) {
      return;
    }

    const deepLinkBase = (
      this.configService.get<string>('APP_DEEP_LINK_BASE_URL')
      || 'medicai://auth'
    ).replace(/\/$/, '');

    const deepLinkUrl = `${deepLinkBase}/verify-email?token=${encodeURIComponent(token)}`;
    const validation = await this.authService.validateEmailVerificationToken(token);

    res
      .status(200)
      .type('html')
      .send(this.renderAuthBridgePage({
        pageTitle: 'Confirmar correo',
        badge: 'Verificación',
        title: this.getVerificationBridgeTitle(validation.status),
        message: validation.message,
        detail: 'Si tienes la app instalada, intentaremos abrirla automáticamente para completar este proceso de forma segura.',
        actionLabel: 'Abrir MedicAI',
        deepLinkUrl,
        variant: this.mapBridgeVariant(validation.status),
      }));
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

  @Post('reset-password/validate')
  validateResetPasswordToken(@Body() dto: TokenDto) {
    return this.authService.validatePasswordResetToken(dto.token);
  }

  @Get('reset-password')
  async redirectResetPasswordFromLink(
    @Query('token') token: string,
    @Req() req: ExpressRequest,
    @Res() res: Response,
  ) {
    if (!token) {
      throw new BadRequestException('Token de restablecimiento requerido.');
    }

    if (this.redirectToPublicAuthPageIfNeeded(req, res, 'reset-password', token)) {
      return;
    }

    const deepLinkBase = (
      this.configService.get<string>('APP_DEEP_LINK_BASE_URL')
      || 'medicai://auth'
    ).replace(/\/$/, '');

    const deepLinkUrl = `${deepLinkBase}/reset-password?token=${encodeURIComponent(token)}`;
    const validation = await this.authService.validatePasswordResetToken(token);

    res
      .status(200)
      .type('html')
      .send(this.renderAuthBridgePage({
        pageTitle: 'Restablecer contraseña',
        badge: 'Seguridad',
        title: this.getResetBridgeTitle(validation.status),
        message: validation.message,
        detail: 'Si la app está instalada, te abriremos directamente para que continúes con el cambio de contraseña.',
        actionLabel: 'Abrir MedicAI',
        deepLinkUrl,
        variant: this.mapBridgeVariant(validation.status),
      }));
  }

  private getVerificationBridgeTitle(status: string) {
    switch (status) {
      case 'valid':
        return 'Abriendo MedicAI para confirmar tu correo';
      case 'already_verified':
        return 'Tu correo ya está confirmado';
      case 'used':
        return 'Este enlace ya fue utilizado';
      case 'expired':
        return 'Este enlace expiró';
      case 'invalid':
      default:
        return 'No pudimos validar este enlace';
    }
  }

  private getResetBridgeTitle(status: string) {
    switch (status) {
      case 'valid':
        return 'Abriendo MedicAI para restablecer tu contraseña';
      case 'used':
        return 'Este enlace ya fue utilizado';
      case 'expired':
        return 'Este enlace expiró';
      case 'invalid':
      default:
        return 'No pudimos validar este enlace';
    }
  }

  private mapBridgeVariant(status: string): AuthBridgePageVariant {
    switch (status) {
      case 'valid':
        return 'success';
      case 'already_verified':
        return 'info';
      case 'used':
      case 'expired':
        return 'warning';
      case 'invalid':
      default:
        return 'error';
    }
  }

  private redirectToPublicAuthPageIfNeeded(
    req: ExpressRequest,
    res: Response,
    route: 'verify-email' | 'reset-password',
    token: string,
  ) {
    const appBaseUrl = this.configService.getOrThrow<string>('APP_BASE_URL').replace(/\/$/, '');
    const publicAuthUrl = `${appBaseUrl}/auth/${route}?token=${encodeURIComponent(token)}`;
    const requestHost = req.get('host')?.toLowerCase();

    try {
      const publicHost = new URL(appBaseUrl).host.toLowerCase();

      if (requestHost && requestHost !== publicHost) {
        res.redirect(302, publicAuthUrl);
        return true;
      }
    } catch {
      return false;
    }

    return false;
  }

  private renderAuthBridgePage(params: {
    pageTitle: string;
    badge: string;
    title: string;
    message: string;
    detail: string;
    actionLabel: string;
    deepLinkUrl: string;
    variant: AuthBridgePageVariant;
  }) {
    const accentColor = this.getBridgeAccentColor(params.variant);
    const escapedTitle = this.escapeHtml(params.title);
    const escapedMessage = this.escapeHtml(params.message);
    const escapedDetail = this.escapeHtml(params.detail);
    const escapedBadge = this.escapeHtml(params.badge);
    const escapedActionLabel = this.escapeHtml(params.actionLabel);
    const deepLinkJson = JSON.stringify(params.deepLinkUrl);

    return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${this.escapeHtml(params.pageTitle)} | MedicAI</title>
    <meta name="theme-color" content="#10243A" />
    <style>
      :root {
        color-scheme: light;
        --bg-a: #0d2137;
        --bg-b: #173d58;
        --surface: rgba(255,255,255,0.96);
        --surface-border: rgba(188,208,225,0.7);
        --text: #10243a;
        --muted: #607b95;
        --accent: ${accentColor};
        --button-text: #062c28;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: Arial, sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(18,165,148,0.26), transparent 30%),
          radial-gradient(circle at bottom right, rgba(27,134,227,0.24), transparent 32%),
          linear-gradient(135deg, var(--bg-a), var(--bg-b));
      }
      .shell {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px 16px;
      }
      .card {
        width: 100%;
        max-width: 640px;
        background: var(--surface);
        border: 1px solid var(--surface-border);
        border-radius: 28px;
        padding: 28px;
        box-shadow: 0 24px 90px rgba(0,0,0,0.24);
        backdrop-filter: blur(14px);
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        border-radius: 999px;
        background: rgba(16,36,58,0.08);
        color: #244564;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .brand {
        margin-top: 22px;
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .logo {
        width: 56px;
        height: 56px;
        border-radius: 18px;
        display: grid;
        place-items: center;
        background: linear-gradient(135deg, #12A594, #1B86E3);
        color: white;
        font-size: 22px;
        font-weight: 800;
      }
      .brand-copy { display: flex; flex-direction: column; gap: 4px; }
      .brand-copy strong {
        font-size: 20px;
        font-weight: 800;
      }
      .brand-copy span {
        color: var(--muted);
        font-size: 14px;
      }
      h1 {
        margin: 24px 0 12px;
        font-size: 32px;
        line-height: 1.08;
      }
      p {
        margin: 0;
        font-size: 16px;
        line-height: 1.72;
      }
      .lead { color: var(--text); }
      .detail {
        margin-top: 12px;
        color: var(--muted);
      }
      .status {
        margin-top: 22px;
        padding: 16px 18px;
        border-radius: 18px;
        background: rgba(16,36,58,0.04);
        border: 1px solid rgba(16,36,58,0.08);
      }
      .status strong {
        display: block;
        margin-bottom: 8px;
        color: var(--text);
        font-size: 14px;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 24px;
      }
      .button {
        display: inline-flex;
        justify-content: center;
        align-items: center;
        min-width: 220px;
        padding: 15px 18px;
        border-radius: 16px;
        text-decoration: none;
        font-weight: 800;
        font-size: 15px;
      }
      .button-primary {
        background: var(--accent);
        color: var(--button-text);
      }
      .button-secondary {
        background: transparent;
        color: #1B86E3;
        border: 1px solid rgba(27,134,227,0.24);
      }
      .footer {
        margin-top: 26px;
        color: var(--muted);
        font-size: 14px;
      }
      .footer ul {
        margin: 10px 0 0;
        padding-left: 18px;
      }
      .footer li { margin: 8px 0; }
      @media (max-width: 640px) {
        .card { padding: 22px; border-radius: 24px; }
        h1 { font-size: 28px; }
        .button { width: 100%; }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="card">
        <div class="badge">${escapedBadge}</div>
        <div class="brand">
          <div class="logo">M</div>
          <div class="brand-copy">
            <strong>MedicAI</strong>
            <span>Asistencia médica y seguimiento de salud</span>
          </div>
        </div>

        <h1>${escapedTitle}</h1>
        <p class="lead">${escapedMessage}</p>
        <p class="detail">${escapedDetail}</p>

        <div class="status">
          <strong>¿Qué pasará ahora?</strong>
          <p>Si la app está instalada, este navegador intentará abrirla automáticamente. Si no ocurre, usa el botón manual de abajo.</p>
        </div>

        <div class="actions">
          <a class="button button-primary" id="open-app" href="${this.escapeHtml(params.deepLinkUrl)}">${escapedActionLabel}</a>
          <button class="button button-secondary" id="copy-link" type="button">Copiar enlace actual</button>
        </div>

        <div class="footer">
          <p>Si estás en una computadora, abre este mismo correo desde tu teléfono donde tengas instalada la app.</p>
          <ul>
            <li>La validación final del enlace se completa dentro de la app.</li>
            <li>Si el enlace ya fue usado o expiró, la app te mostrará el mensaje correspondiente.</li>
          </ul>
        </div>
      </section>
    </main>

    <script>
      const deepLinkUrl = ${deepLinkJson};
      const browserUrl = window.location.href;
      const openAppButton = document.getElementById('open-app');
      const copyLinkButton = document.getElementById('copy-link');

      function openApp() {
        window.location.href = deepLinkUrl;
      }

      openAppButton.addEventListener('click', function () {
        openApp();
      });

      copyLinkButton.addEventListener('click', async function () {
        if (!navigator.clipboard) {
          copyLinkButton.textContent = 'No se pudo copiar';
          return;
        }

        try {
          await navigator.clipboard.writeText(browserUrl);
          copyLinkButton.textContent = 'Enlace copiado';
          setTimeout(function () {
            copyLinkButton.textContent = 'Copiar enlace actual';
          }, 2200);
        } catch (error) {
          copyLinkButton.textContent = 'No se pudo copiar';
        }
      });

      window.setTimeout(openApp, 350);
    </script>
  </body>
</html>`;
  }

  private getBridgeAccentColor(variant: AuthBridgePageVariant) {
    switch (variant) {
      case 'success':
        return '#12A594';
      case 'info':
        return '#1B86E3';
      case 'warning':
        return '#F59A2E';
      case 'error':
      default:
        return '#E15B64';
    }
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
