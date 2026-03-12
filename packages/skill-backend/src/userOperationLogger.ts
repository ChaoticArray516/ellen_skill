/**
 * User Operation Logger Module for Ellen Skill
 *
 * Records user interactions, messages, and system responses to file logs
 * for audit, debugging, and analytics purposes.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * User operation types
 */
export type OperationType =
  | 'user_message'
  | 'llm_response'
  | 'tts_synthesis'
  | 'status_change'
  | 'error'
  | 'client_connect'
  | 'client_disconnect'
  | 'system_startup'
  | 'system_shutdown';

/**
 * User operation log entry
 */
export interface UserOperationEntry {
  /** ISO timestamp */
  timestamp: string;
  /** Operation type */
  type: OperationType;
  /** Client ID if applicable */
  clientId?: string;
  /** User message or system response */
  content?: string;
  /** Response preview (first 100 chars) */
  responsePreview?: string;
  /** Emotion/motion state */
  emotion?: string;
  /** Duration in ms (for TTS) */
  duration?: number;
  /** Error message if applicable */
  error?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * User operation logger configuration
 */
export interface UserOperationLoggerOptions {
  /** Log file directory (relative to project root) */
  logDir?: string;
  /** Main log filename */
  logFile?: string;
  /** Maximum log file size in bytes (default: 10MB) */
  maxFileSize?: number;
  /** Maximum number of backup files (default: 5) */
  maxBackups?: number;
  /** Whether to log to console as well */
  consoleOutput?: boolean;
}

/**
 * User Operation Logger
 *
 * Records all user interactions to persistent log files in the logs directory.
 * Supports log rotation when files exceed size limits.
 */
export class UserOperationLogger {
  private logDir: string;
  private logFile: string;
  private maxFileSize: number;
  private maxBackups: number;
  private consoleOutput: boolean;
  private initialized = false;

  /**
   * Creates a new user operation logger
   *
   * @param {UserOperationLoggerOptions} [options] - Logger configuration
   */
  constructor(options: UserOperationLoggerOptions = {}) {
    // Resolve log directory relative to Skill root
    // Current: packages/skill-backend/src/userOperationLogger.ts
    // Target:  ellen_skill/logs/
    const skillRoot = path.resolve(__dirname, '..', '..', '..');
    this.logDir = path.resolve(skillRoot, options.logDir ?? 'logs');
    this.logFile = path.resolve(this.logDir, options.logFile ?? 'user_operations.log');
    this.maxFileSize = options.maxFileSize ?? 10 * 1024 * 1024; // 10MB default
    this.maxBackups = options.maxBackups ?? 5;
    this.consoleOutput = options.consoleOutput ?? false;

    this.initialize();
  }

  /**
   * Initializes the logger by creating log directory if needed
   */
  private initialize(): void {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
      this.initialized = true;

      // Log system startup
      this.log({
        timestamp: new Date().toISOString(),
        type: 'system_startup',
        content: 'User operation logger initialized',
        metadata: { logDir: this.logDir },
      });
    } catch (error) {
      console.error('[UserOperationLogger] Failed to initialize:', error);
      this.initialized = false;
    }
  }

  /**
   * Logs a user operation
   *
   * @param {UserOperationEntry} entry - Operation entry to log
   */
  log(entry: UserOperationEntry): void {
    if (!this.initialized) {
      return;
    }

    try {
      // Check if log rotation is needed
      this.rotateIfNeeded();

      // Format log entry as JSON line
      const logLine = JSON.stringify(entry) + '\n';

      // Append to log file
      fs.appendFileSync(this.logFile, logLine, 'utf8');

      // Optional console output
      if (this.consoleOutput) {
        this.outputToConsole(entry);
      }
    } catch (error) {
      console.error('[UserOperationLogger] Failed to write log:', error);
    }
  }

  /**
   * Logs a user message
   *
   * @param {string} message - User message content
   * @param {string} [clientId] - Client connection ID
   */
  logUserMessage(message: string, clientId?: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      type: 'user_message',
      clientId,
      content: message,
    });
  }

  /**
   * Logs an LLM response
   *
   * @param {string} userMessage - Original user message
   * @param {string} llmResponse - LLM generated response
   * @param {string} [emotion] - Detected emotion
   * @param {string} [clientId] - Client connection ID
   */
  logLLMResponse(
    userMessage: string,
    llmResponse: string,
    emotion?: string,
    clientId?: string
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      type: 'llm_response',
      clientId,
      content: userMessage,
      responsePreview: llmResponse.substring(0, 200),
      emotion,
      metadata: { responseLength: llmResponse.length },
    });
  }

  /**
   * Logs TTS synthesis completion
   *
   * @param {string} text - Synthesized text
   * @param {number} duration - Audio duration in seconds
   * @param {boolean} success - Whether synthesis succeeded
   * @param {string} [clientId] - Client connection ID
   */
  logTTSSynthesis(
    text: string,
    duration: number,
    success: boolean,
    clientId?: string
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      type: 'tts_synthesis',
      clientId,
      content: text.substring(0, 100),
      duration,
      metadata: { success, textLength: text.length },
    });
  }

  /**
   * Logs a status change
   *
   * @param {string} status - New status
   * @param {string} [previousStatus] - Previous status
   * @param {string} [clientId] - Client connection ID
   */
  logStatusChange(
    status: string,
    previousStatus?: string,
    clientId?: string
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      type: 'status_change',
      clientId,
      content: status,
      metadata: { previousStatus },
    });
  }

  /**
   * Logs a client connection
   *
   * @param {string} clientId - Client connection ID
   * @param {number} [totalClients] - Total connected clients
   */
  logClientConnect(clientId: string, totalClients?: number): void {
    this.log({
      timestamp: new Date().toISOString(),
      type: 'client_connect',
      clientId,
      metadata: { totalClients },
    });
  }

  /**
   * Logs a client disconnection
   *
   * @param {string} clientId - Client connection ID
   * @param {number} [totalClients] - Remaining connected clients
   */
  logClientDisconnect(clientId: string, totalClients?: number): void {
    this.log({
      timestamp: new Date().toISOString(),
      type: 'client_disconnect',
      clientId,
      metadata: { totalClients },
    });
  }

  /**
   * Logs an error
   *
   * @param {string} context - Error context
   * @param {Error} error - Error object
   * @param {string} [clientId] - Client connection ID
   */
  logError(context: string, error: Error, clientId?: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      type: 'error',
      clientId,
      content: context,
      error: error.message,
      metadata: { stack: error.stack },
    });
  }

  /**
   * Logs system shutdown
   */
  logSystemShutdown(): void {
    this.log({
      timestamp: new Date().toISOString(),
      type: 'system_shutdown',
      content: 'System shutting down gracefully',
    });
  }

  /**
   * Performs log rotation if current file exceeds max size
   */
  private rotateIfNeeded(): void {
    try {
      if (!fs.existsSync(this.logFile)) {
        return;
      }

      const stats = fs.statSync(this.logFile);
      if (stats.size < this.maxFileSize) {
        return;
      }

      // Rotate existing backup files
      for (let i = this.maxBackups - 1; i >= 1; i--) {
        const oldFile = `${this.logFile}.${i}`;
        const newFile = `${this.logFile}.${i + 1}`;

        if (fs.existsSync(oldFile)) {
          if (i === this.maxBackups - 1) {
            fs.unlinkSync(oldFile); // Delete oldest
          } else {
            fs.renameSync(oldFile, newFile);
          }
        }
      }

      // Rotate current file to .1
      fs.renameSync(this.logFile, `${this.logFile}.1`);

      // Write rotation marker
      const marker = JSON.stringify({
        timestamp: new Date().toISOString(),
        type: 'system',
        content: `Log rotated from ${this.logFile}.1`,
      }) + '\n';
      fs.writeFileSync(this.logFile, marker, 'utf8');
    } catch (error) {
      console.error('[UserOperationLogger] Log rotation failed:', error);
    }
  }

  /**
   * Outputs log entry to console
   */
  private outputToConsole(entry: UserOperationEntry): void {
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();
    const prefix = `[${timestamp}] [USER]`;

    switch (entry.type) {
      case 'user_message':
        console.log(`${prefix} 👤 User: ${entry.content?.substring(0, 50)}`);
        break;
      case 'llm_response':
        console.log(`${prefix} 🤖 LLM: ${entry.responsePreview?.substring(0, 50)}...`);
        break;
      case 'tts_synthesis':
        console.log(`${prefix} 🔊 TTS: ${entry.duration?.toFixed(1)}s`);
        break;
      case 'client_connect':
        console.log(`${prefix} ✅ Client connected: ${entry.clientId}`);
        break;
      case 'client_disconnect':
        console.log(`${prefix} ❌ Client disconnected: ${entry.clientId}`);
        break;
      case 'error':
        console.error(`${prefix} 💥 Error: ${entry.error}`);
        break;
      default:
        console.log(`${prefix} ${entry.type}: ${entry.content}`);
    }
  }

  /**
   * Gets log file statistics
   *
   * @returns {object} Log statistics
   */
  getStats(): { logDir: string; logFile: string; exists: boolean; size?: number } {
    const exists = fs.existsSync(this.logFile);
    return {
      logDir: this.logDir,
      logFile: this.logFile,
      exists,
      size: exists ? fs.statSync(this.logFile).size : undefined,
    };
  }

  /**
   * Reads recent log entries
   *
   * @param {number} [lines=100] - Number of lines to read
   * @returns {UserOperationEntry[]} Log entries
   */
  readRecent(lines: number = 100): UserOperationEntry[] {
    try {
      if (!fs.existsSync(this.logFile)) {
        return [];
      }

      const content = fs.readFileSync(this.logFile, 'utf8');
      const allLines = content.trim().split('\n');
      const recentLines = allLines.slice(-lines);

      return recentLines
        .map((line) => {
          try {
            return JSON.parse(line) as UserOperationEntry;
          } catch {
            return null;
          }
        })
        .filter((entry): entry is UserOperationEntry => entry !== null);
    } catch (error) {
      console.error('[UserOperationLogger] Failed to read logs:', error);
      return [];
    }
  }
}

/**
 * Singleton instance for global access
 */
let globalUserLogger: UserOperationLogger | null = null;

/**
 * Gets or creates the global user operation logger
 *
 * @param {UserOperationLoggerOptions} [options] - Logger options
 * @returns {UserOperationLogger} Logger instance
 */
export function getUserOperationLogger(
  options?: UserOperationLoggerOptions
): UserOperationLogger {
  if (!globalUserLogger) {
    globalUserLogger = new UserOperationLogger(options);
  }
  return globalUserLogger;
}

/**
 * Resets the global logger instance (useful for testing)
 */
export function resetUserOperationLogger(): void {
  globalUserLogger = null;
}
