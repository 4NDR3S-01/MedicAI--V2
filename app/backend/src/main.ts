import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app/app.module';
import { AppLogger } from './infrastructure/logging/app.logger';
import { GlobalExceptionFilter } from './infrastructure/logging/global-exception.filter';
import { HttpRequestLoggerMiddleware } from './infrastructure/logging/http-request-logger.middleware';

async function bootstrap() {
  const logger = new AppLogger();
  registerProcessErrorHandlers(logger);

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger,
  });

  app.useLogger(logger);
  app.enableShutdownHooks();

  if (isEnabled(process.env.TRUST_PROXY)) {
    const expressInstance = app.getHttpAdapter().getInstance();
    if (typeof expressInstance.set === 'function') {
      expressInstance.set('trust proxy', 1);
      logger.log('Trust proxy enabled', { hops: 1 }, 'Bootstrap');
    }
  }

  const requestLogger = new HttpRequestLoggerMiddleware(logger);
  app.use(requestLogger.use.bind(requestLogger));

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:8081')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 3600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter(logger));

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);

  logger.log(
    'MedicAI backend listening',
    {
      port,
      nodeEnv: process.env.NODE_ENV || 'development',
      logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
      allowedOrigins,
    },
    'Bootstrap',
  );

  if (typeof process.send === 'function') {
    process.send('ready');
  }
}

function registerProcessErrorHandlers(logger: AppLogger) {
  process.on('unhandledRejection', (reason) => {
    if (reason instanceof Error) {
      logger.error('Unhandled promise rejection', reason, 'Process');
      return;
    }

    logger.error('Unhandled promise rejection', { reason }, 'Process');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal('Uncaught exception', error, 'Process');
    process.exit(1);
  });
}

function isEnabled(value?: string) {
  return ['1', 'true', 'yes', 'on'].includes(value?.toLowerCase() || '');
}

void bootstrap().catch((error) => {
  const logger = new AppLogger();
  logger.fatal('Backend bootstrap failed', error, 'Bootstrap');
  process.exit(1);
});
