import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { AppLogger } from './app.logger';

type RequestWithRequestId = Request & {
  requestId?: string;
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<RequestWithRequestId>();
    const response = ctx.getResponse<Response>();
    const statusCode = this.resolveStatusCode(exception);

    if (statusCode >= 500) {
      this.logger.error(
        'Unhandled HTTP exception',
        exception instanceof Error ? exception : { exception: this.formatUnknown(exception) },
        {
          requestId: request.requestId,
          method: request.method,
          path: request.originalUrl?.split('?')[0] || request.url.split('?')[0],
          statusCode,
        },
        'Exceptions',
      );
    }

    response
      .status(statusCode)
      .json(this.buildResponseBody(exception, statusCode, request));
  }

  private resolveStatusCode(exception: unknown) {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }

    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private buildResponseBody(
    exception: unknown,
    statusCode: number,
    request: RequestWithRequestId,
  ) {
    const base = {
      timestamp: new Date().toISOString(),
      path: request.originalUrl?.split('?')[0] || request.url.split('?')[0],
      requestId: request.requestId,
    };

    if (exception instanceof HttpException) {
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return {
          statusCode,
          message: payload,
          ...base,
        };
      }

      return {
        ...(payload as Record<string, unknown>),
        ...base,
      };
    }

    return {
      statusCode,
      message: 'Internal server error',
      ...base,
    };
  }

  private formatUnknown(value: unknown) {
    if (typeof value === 'string') {
      return value;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
}
