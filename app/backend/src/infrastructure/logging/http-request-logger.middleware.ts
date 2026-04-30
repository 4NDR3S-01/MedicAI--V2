import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

import { AppLogger } from './app.logger';

type RequestWithRequestId = Request & {
  requestId?: string;
};

export class HttpRequestLoggerMiddleware {
  constructor(private readonly logger: AppLogger) {}

  use(req: RequestWithRequestId, res: Response, next: NextFunction) {
    const startedAt = process.hrtime.bigint();
    const requestId = this.resolveRequestId(req);
    const path = this.resolvePath(req);

    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const statusCode = res.statusCode;
      const metadata = {
        requestId,
        method: req.method,
        path,
        statusCode,
        durationMs: Number(durationMs.toFixed(2)),
        ip: req.ip || req.socket.remoteAddress,
        userAgent: this.truncateHeader(req.headers['user-agent']),
        contentLength: this.resolveContentLength(res),
      };

      if (this.shouldSkipSuccessfulHealthLog(path, statusCode)) {
        return;
      }

      if (statusCode >= 500) {
        this.logger.error('HTTP request failed', metadata, 'HTTP');
        return;
      }

      if (statusCode >= 400) {
        this.logger.warn('HTTP request rejected', metadata, 'HTTP');
        return;
      }

      this.logger.log('HTTP request completed', metadata, 'HTTP');
    });

    next();
  }

  private resolveRequestId(req: Request) {
    const header = req.headers['x-request-id'];
    if (typeof header === 'string' && header.trim()) {
      return header.trim().slice(0, 96);
    }

    return randomUUID();
  }

  private resolvePath(req: Request) {
    return req.originalUrl?.split('?')[0] || req.path || req.url.split('?')[0] || '/';
  }

  private resolveContentLength(res: Response) {
    const value = res.getHeader('content-length');

    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
  }

  private truncateHeader(value: string | string[] | undefined) {
    const header = Array.isArray(value) ? value.join(', ') : value;
    return header ? header.slice(0, 180) : undefined;
  }

  private shouldSkipSuccessfulHealthLog(path: string, statusCode: number) {
    return statusCode < 400 && ['/health', '/healthz', '/ready'].includes(path);
  }
}
