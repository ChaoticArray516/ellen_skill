/**
 * Structured Logger Module for Ellen Skill
 *
 * Provides consistent logging format with timestamps, log levels,
 * and structured data output. No external dependencies.
 */

/**
 * Log levels in order of severity
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Logger configuration options
 */
export interface LoggerOptions {
  /** Minimum log level to output */
  level?: LogLevel;
  /** Whether to include timestamps */
  includeTimestamp?: boolean;
  /** Whether to output as JSON */
  jsonFormat?: boolean;
}

/**
 * Structured logger with consistent formatting
 *
 * Log format: [ISO_TIMESTAMP] [LEVEL] [MODULE] Message {data}
 */
export class Logger {
  private module: string;
  private level: LogLevel;
  private includeTimestamp: boolean;
  private jsonFormat: boolean;

  /**
   * Creates a new logger instance
   *
   * @param {string} module - Module name for log prefix
   * @param {LoggerOptions} [options] - Logger configuration
   */
  constructor(module: string, options: LoggerOptions = {}) {
    this.module = module;
    this.level = options.level ?? LogLevel.INFO;
    this.includeTimestamp = options.includeTimestamp ?? true;
    this.jsonFormat = options.jsonFormat ?? false;
  }

  /**
   * Logs a debug message
   *
   * @param {string} message - Log message
   * @param {object} [data] - Additional data to log
   */
  debug(message: string, data?: object): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * Logs an info message
   *
   * @param {string} message - Log message
   * @param {object} [data] - Additional data to log
   */
  info(message: string, data?: object): void {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * Logs a warning message
   *
   * @param {string} message - Log message
   * @param {object} [data] - Additional data to log
   */
  warn(message: string, data?: object): void {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * Logs an error message
   *
   * @param {string} message - Log message
   * @param {Error} [error] - Error object
   * @param {object} [data] - Additional data to log
   */
  error(message: string, error?: Error, data?: object): void {
    const errorData = error
      ? { ...data, error: error.message, stack: error.stack }
      : data;
    this.log(LogLevel.ERROR, message, errorData);
  }

  /**
   * Core logging function
   *
   * @param {LogLevel} level - Log level
   * @param {string} message - Log message
   * @param {object} [data] - Additional data
   */
  private log(level: LogLevel, message: string, data?: object): void {
    if (level < this.level) {
      return;
    }

    if (this.jsonFormat) {
      this.logJson(level, message, data);
    } else {
      this.logText(level, message, data);
    }
  }

  /**
   * Logs in text format
   */
  private logText(level: LogLevel, message: string, data?: object): void {
    const parts: string[] = [];

    if (this.includeTimestamp) {
      parts.push(`[${new Date().toISOString()}]`);
    }

    parts.push(`[${LogLevel[level]}]`);
    parts.push(`[${this.module}]`);
    parts.push(message);

    if (data && Object.keys(data).length > 0) {
      parts.push(JSON.stringify(data));
    }

    const output = parts.join(' ');

    switch (level) {
      case LogLevel.ERROR:
        console.error(output);
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }

  /**
   * Logs in JSON format
   */
  private logJson(level: LogLevel, message: string, data?: object): void {
    const logEntry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      module: this.module,
      message,
    };

    if (data) {
      Object.assign(logEntry, data);
    }

    const output = JSON.stringify(logEntry);

    switch (level) {
      case LogLevel.ERROR:
        console.error(output);
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }

  /**
   * Sets the minimum log level
   *
   * @param {LogLevel} level - New minimum level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Gets current log level
   *
   * @returns {LogLevel} Current level
   */
  getLevel(): LogLevel {
    return this.level;
  }
}

/**
 * Global logger registry for managing multiple loggers
 */
export class LoggerRegistry {
  private static loggers = new Map<string, Logger>();
  private static defaultLevel = LogLevel.INFO;

  /**
   * Gets or creates a logger for a module
   *
   * @param {string} module - Module name
   * @returns {Logger} Logger instance
   */
  static getLogger(module: string): Logger {
    if (!this.loggers.has(module)) {
      this.loggers.set(
        module,
        new Logger(module, { level: this.defaultLevel })
      );
    }
    return this.loggers.get(module)!;
  }

  /**
   * Sets the default log level for all loggers
   *
   * @param {LogLevel} level - New default level
   */
  static setDefaultLevel(level: LogLevel): void {
    this.defaultLevel = level;
    this.loggers.forEach((logger) => logger.setLevel(level));
  }

  /**
   * Clears all loggers
   */
  static clear(): void {
    this.loggers.clear();
  }
}

/**
 * Convenience function to get a logger
 *
 * @param {string} module - Module name
 * @returns {Logger} Logger instance
 */
export function getLogger(module: string): Logger {
  return LoggerRegistry.getLogger(module);
}
