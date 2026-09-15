import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '../infrastructure/prisma/prisma.service';

@Controller()
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  async health() {
    let databaseStatus: 'ok' | 'error' = 'ok';
    try {
      // Consulta ligera para verificar conectividad con PostgreSQL.
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      databaseStatus = 'error';
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'medicai-backend',
        databaseStatus,
        uptimeSeconds: Math.round(process.uptime()),
        startedAt: new Date(this.startedAt).toISOString(),
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: 'ok',
      service: 'medicai-backend',
      databaseStatus,
      uptimeSeconds: Math.round(process.uptime()),
      startedAt: new Date(this.startedAt).toISOString(),
      timestamp: new Date().toISOString(),
    };
  }
}
