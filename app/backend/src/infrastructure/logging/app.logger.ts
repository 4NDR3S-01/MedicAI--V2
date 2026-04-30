import { LoggerService } from '@nestjs/common';
import { inspect } from 'node:util';

type StructuredLogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'verbose';
type LogMetadata = Record<string, unknown>;

const LEVEL_WEIGHT: Record<StructuredLogLevel, number> = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  verbose: 5,
};

const DEFAULT_SERVICE_NAME = 'medicai-backend';

export class AppLogger implements LoggerService {
  private readonly serviceName = process.env.SERVICE_NAME || DEFAULT_SERVICE_NAME;
  private readonly environment = process.env.NODE_ENV || 'development';
  private readonly minLevel = this.resolveMinLevel(process.env.LOG_LEVEL);

  log(message: unknown, ...optionalParams: unknown[]) {
    this.write('info', message, this.parseParams(optionalParams));
  }

  error(message: unknown, ...optionalParams: unknown[]) {
    this.write('error', message, this.parseParams(optionalParams));
  }

  warn(message: unknown, ...optionalParams: unknown[]) {
    this.write('warn', message, this.parseParams(optionalParams));
  }

  debug(message: unknown, ...optionalParams: unknown[]) {
    this.write('debug', message, this.parseParams(optionalParams));
  }

  verbose(message: unknown, ...optionalParams: unknown[]) {
    this.write('verbose', message, this.parseParams(optionalParams));
  }

  fatal(message: unknown, ...optionalParams: unknown[]) {
    this.write('fatal', message, this.parseParams(optionalParams));
  }

  private write(
    level: StructuredLogLevel,
    message: unknown,
    parsed: { context?: string; metadata: LogMetadata },
  ) {
    if (LEVEL_WEIGHT[level] > LEVEL_WEIGHT[this.minLevel]) {
      return;
    }

    const entry = {
      ts: new Date().toISOString(),
      level,
      service: this.serviceName,
      env: this.environment,
      pid: process.pid,
      pm_id: process.env.pm_id,
      context: parsed.context,
      msg: this.formatMessage(message),
      ...parsed.metadata,
    };

    const line = this.stringify(entry);
    if (level === 'error' || level === 'fatal') {
      process.stderr.write(`${line}\n`);
      return;
    }

    process.stdout.write(`${line}\n`);
  }

  private parseParams(optionalParams: unknown[]) {
    const metadata: LogMetadata = {};
    let context: string | undefined;

    optionalParams.forEach((param, index) => {
      if (param === undefined || param === null) {
        return;
      }

      if (typeof param === 'string') {
        const isLast = index === optionalParams.length - 1;
        const looksLikeStack = param.includes('\n') || param.trim().startsWith('at ');

        if (looksLikeStack && !metadata.stack) {
          metadata.stack = param;
          return;
        }

        if (isLast || !context) {
          context = param;
          return;
        }

        metadata.detail = param;
        return;
      }

      if (param instanceof Error) {
        metadata.error = {
          name: param.name,
          message: param.message,
        };
        metadata.stack = param.stack;
        return;
      }

      if (this.isPlainObject(param)) {
        Object.assign(metadata, param);
        return;
      }

      metadata.detail = this.formatMessage(param);
    });

    return { context, metadata };
  }

  private resolveMinLevel(value?: string): StructuredLogLevel {
    const normalized = value?.toLowerCase();

    if (normalized && normalized in LEVEL_WEIGHT) {
      return normalized as StructuredLogLevel;
    }

    return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
  }

  private formatMessage(message: unknown) {
    if (message instanceof Error) {
      return message.message;
    }

    if (typeof message === 'string') {
      return message;
    }

    return inspect(message, {
      depth: 4,
      breakLength: Number.POSITIVE_INFINITY,
      compact: true,
    });
  }

  private stringify(entry: LogMetadata) {
    const seen = new WeakSet<object>();

    return JSON.stringify(entry, (_key, value: unknown) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }

      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
        };
      }

      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }

      return value;
    });
  }

  private isPlainObject(value: unknown): value is LogMetadata {
    return (
      typeof value === 'object'
      && value !== null
      && !Array.isArray(value)
      && !(value instanceof Date)
      && !(value instanceof Error)
    );
  }
}
