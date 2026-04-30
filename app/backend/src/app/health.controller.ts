import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  private readonly startedAt = Date.now();

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'medicai-backend',
      uptimeSeconds: Math.round(process.uptime()),
      startedAt: new Date(this.startedAt).toISOString(),
      timestamp: new Date().toISOString(),
    };
  }
}
