import { LoggerService } from '@nestjs/common';
import { inspect } from 'node:util';

type StructuredLogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'verbose';
type StructuredLogFormat = 'pretty' | 'json';
type LogMetadata = Record<string, unknown>;

const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
} as const;

const LEVEL_COLOR: Record<StructuredLogLevel, string> = {
  fatal: ANSI.red,
  error: ANSI.red,
  warn: ANSI.yellow,
  info: ANSI.green,
  debug: ANSI.blue,
  verbose: ANSI.gray,
};

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
  private readonly format = this.resolveFormat(process.env.LOG_FORMAT);
  private readonly includeStacks = this.isEnabled(process.env.LOG_STACKS)
    || this.environment !== 'production';
  private readonly useColors = this.resolveColors(process.env.LOG_COLORS);

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

    const ts = new Date().toISOString();

    const entry = {
      ts,
      level,
      service: this.serviceName,
      env: this.environment,
      pid: process.pid,
      pm_id: process.env.pm_id,
      context: parsed.context,
      msg: this.formatMessage(message),
      ...parsed.metadata,
    };

    const line = this.format === 'json'
      ? this.stringify(entry)
      : this.formatPretty(level, message, parsed);

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

  private resolveFormat(value?: string): StructuredLogFormat {
    return value?.toLowerCase() === 'json' ? 'json' : 'pretty';
  }

  private resolveColors(value?: string) {
    if (value !== undefined && value !== '') {
      return this.isEnabled(value);
    }

    // Color por defecto solo en formato pretty; el JSON debe quedar limpio.
    return this.format === 'pretty';
  }

  private formatPretty(
    level: StructuredLogLevel,
    message: unknown,
    parsed: { context?: string; metadata: LogMetadata },
  ) {
    const label = level.toUpperCase().padEnd(5);
    const details = this.formatMetadata(parsed.metadata);

    const parts = [
      this.color(LEVEL_COLOR[level], label),
      parsed.context ? this.color(ANSI.cyan, `[${parsed.context}]`) : '',
      this.formatMessage(message),
      details ? this.color(ANSI.dim, details) : '',
    ].filter(Boolean);

    return parts.join(' ');
  }

  private color(code: string, value: string) {
    if (!this.useColors) {
      return value;
    }

    return `${code}${value}${ANSI.reset}`;
  }

  private formatMetadata(metadata: LogMetadata) {
    const visibleEntries = Object.entries(metadata)
      .filter(([key, value]) => (
        value !== undefined
        && value !== null
        && key !== 'stack'
        && key !== 'service'
        && key !== 'env'
        && key !== 'pid'
        && key !== 'pm_id'
      ));

    if (metadata.stack && this.includeStacks) {
      visibleEntries.push(['stack', this.compactStack(String(metadata.stack))]);
    }

    return visibleEntries
      .map(([key, value]) => `${key}=${this.formatMetadataValue(value)}`)
      .join(' ');
  }

  private formatMetadataValue(value: unknown) {
    if (value instanceof Error) {
      return this.quoteIfNeeded(`${value.name}: ${value.message}`);
    }

    if (this.isPlainObject(value)) {
      const nested = Object.entries(value)
        .filter(([, nestedValue]) => nestedValue !== undefined && nestedValue !== null)
        .map(([nestedKey, nestedValue]) => `${nestedKey}:${String(nestedValue)}`)
        .join(',');

      return this.quoteIfNeeded(nested);
    }

    if (Array.isArray(value)) {
      return this.quoteIfNeeded(value.join(','));
    }

    return this.quoteIfNeeded(String(value));
  }

  private quoteIfNeeded(value: string) {
    return /^[a-zA-Z0-9_.:/@-]+$/.test(value) ? value : JSON.stringify(value);
  }

  private compactStack(stack: string) {
    return stack
      .split('\n')
      .map((line) => line.trim())
      .slice(0, 6)
      .join(' | ');
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

  private isEnabled(value?: string) {
    return ['1', 'true', 'yes', 'on'].includes(value?.toLowerCase() || '');
  }
}
