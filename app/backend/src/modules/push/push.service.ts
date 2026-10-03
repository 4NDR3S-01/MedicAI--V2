import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;

/** Canal Android para los avisos del Círculo (lo crea la app). */
export const CIRCLE_CHANNEL = 'medicai_circle';

export type PushMessage = {
  title: string;
  body: string;
  /** Datos para la app (p. ej. a qué pantalla ir al tocarla). */
  data?: Record<string, unknown>;
  channelId?: string;
};

type ExpoTicket = { status: 'ok' | 'error'; details?: { error?: string } };

/**
 * Envío de notificaciones push a través de Expo (que usa FCM en Android y APNs
 * en iOS con las credenciales del proyecto). Nunca lanza: un aviso que no se
 * puede enviar no debe hacer fallar la operación que lo originó.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async registerToken(userId: string, sessionId: string | undefined, token: string, platform?: string) {
    // El mismo teléfono puede cambiar de cuenta: el token pasa al usuario actual.
    await this.prisma.pushToken.upsert({
      where: { token },
      create: { token, userId, sessionId: sessionId ?? null, platform: platform ?? null },
      update: { userId, sessionId: sessionId ?? null, platform: platform ?? null, lastSeenAt: new Date() },
    });
    return { registered: true };
  }

  async unregisterToken(userId: string, token: string) {
    await this.prisma.pushToken.deleteMany({ where: { token, userId } });
    return { registered: false };
  }

  /** Aviso visible a una o varias personas. */
  notify(userIds: string[], message: PushMessage): Promise<void> {
    return this.sendToUsers(userIds, (to) => ({
      to,
      title: message.title,
      body: message.body,
      data: message.data ?? {},
      sound: 'default',
      priority: 'high',
      channelId: message.channelId ?? CIRCLE_CHANNEL,
    }));
  }

  /**
   * Aviso silencioso: la app, aunque esté cerrada, vuelve a sincronizar sus
   * alarmas y recordatorios (alguien cambió medicamentos o citas).
   */
  requestSync(userIds: string[], reason: string): Promise<void> {
    return this.sendToUsers(userIds, (to) => ({
      to,
      data: { type: 'SYNC', reason },
      priority: 'high',
      _contentAvailable: true,
    }));
  }

  private async sendToUsers(userIds: string[], build: (token: string) => Record<string, unknown>): Promise<void> {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return;
    try {
      const tokens = await this.prisma.pushToken.findMany({ where: { userId: { in: ids } }, select: { token: true } });
      for (let index = 0; index < tokens.length; index += BATCH_SIZE) {
        const batch = tokens.slice(index, index + BATCH_SIZE).map((item) => item.token);
        await this.sendBatch(batch, batch.map(build));
      }
    } catch (error) {
      this.logger.error('Push send failed', error as Error);
    }
  }

  private async sendBatch(tokens: string[], messages: Record<string, unknown>[]) {
    const accessToken = this.config.get<string>('EXPO_ACCESS_TOKEN');
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(messages),
    });
    if (!response.ok) {
      this.logger.warn('Expo push rejected batch', { status: response.status });
      return;
    }
    const { data } = (await response.json()) as { data?: ExpoTicket[] };
    // Teléfonos donde se desinstaló la app o se revocó el permiso: fuera.
    const stale = (data ?? [])
      .map((ticket, index) => (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered' ? tokens[index] : null))
      .filter((token): token is string => Boolean(token));
    if (stale.length) await this.prisma.pushToken.deleteMany({ where: { token: { in: stale } } });
  }
}
