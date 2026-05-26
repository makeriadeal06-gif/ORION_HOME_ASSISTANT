import { LogLevel, LogEntry } from './LogLevels';

class Logger {
  private static instance: Logger;
  private currentLevel: LogLevel = LogLevel.INFO;
  private lastLogs: Map<string, { message: string, count: number, timestamp: number }> = new Map();
  // Simple in-memory ring buffer for recent logs to support exports/diagnostics
  private logBuffer: { timestamp: number; level: LogLevel; category: string; message: string; data?: any }[] = [];
  private readonly MAX_BUFFER = 5000;
  private readonly THROTTLE_THRESHOLD = 5000; // 5 seconds for duplicate suppression

  private constructor() {
    // In development we might want DEBUG
    if (import.meta.env.DEV) {
      this.currentLevel = LogLevel.DEBUG;
    }
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public setLevel(level: LogLevel) {
    this.currentLevel = level;
  }

  private shouldLog(level: LogLevel, category: string, message: string): boolean {
    if (level < this.currentLevel) return false;

    // Duplicate suppression
    const key = `${category}:${message}`;
    const last = this.lastLogs.get(key);
    const now = Date.now();

    if (last && now - last.timestamp < this.THROTTLE_THRESHOLD) {
      last.count++;
      return false;
    }

    if (last && last.count > 0) {
      console.log(`[${category}] (Suppressed ${last.count} duplicate messages)`);
    }

    this.lastLogs.set(key, { message, count: 0, timestamp: now });
    return true;
  }

  private formatMessage(level: LogLevel, category: string, message: string): string {
    const levelStr = LogLevel[level];
    return `[${category}] ${message}`;
  }

  private pushToBuffer(level: LogLevel, category: string, message: string, data?: any) {
    try {
      const entry = { timestamp: Date.now(), level, category, message, data };
      this.logBuffer.push(entry);
      if (this.logBuffer.length > this.MAX_BUFFER) {
        // maintain ring buffer size
        this.logBuffer.splice(0, this.logBuffer.length - this.MAX_BUFFER);
      }
    } catch (e) {
      // Best-effort logging buffer; swallow errors to avoid impacting runtime
    }
  }

  // Retrieve a copy of buffered logs. Optional filter by category or since timestamp.
  public getBufferedLogs(options?: { category?: string; since?: number; limit?: number }) {
    const { category, since, limit } = options || {};
    let items = this.logBuffer.slice();
    if (category) {
      items = items.filter((i) => i.category && i.category.includes(category));
    }
    if (typeof since === 'number') {
      items = items.filter((i) => i.timestamp >= since);
    }
    if (typeof limit === 'number') {
      items = items.slice(-limit);
    }
    return items.map((i) => ({ ...i }));
  }

  public trace(category: string, message: string, data?: any) {
    this.pushToBuffer(LogLevel.TRACE, category, message, data);
    if (this.shouldLog(LogLevel.TRACE, category, message)) {
      console.trace(this.formatMessage(LogLevel.TRACE, category, message), data || '');
    }
  }

  public debug(category: string, message: string, data?: any) {
    this.pushToBuffer(LogLevel.DEBUG, category, message, data);
    if (this.shouldLog(LogLevel.DEBUG, category, message)) {
      console.debug(this.formatMessage(LogLevel.DEBUG, category, message), data || '');
    }
  }

  public info(category: string, message: string, data?: any) {
    this.pushToBuffer(LogLevel.INFO, category, message, data);
    if (this.shouldLog(LogLevel.INFO, category, message)) {
      console.info(this.formatMessage(LogLevel.INFO, category, message), data || '');
    }
  }

  public warn(category: string, message: string, data?: any) {
    this.pushToBuffer(LogLevel.WARN, category, message, data);
    if (this.shouldLog(LogLevel.WARN, category, message)) {
      console.warn(this.formatMessage(LogLevel.WARN, category, message), data || '');
    }
  }

  public error(category: string, message: string, data?: any) {
    this.pushToBuffer(LogLevel.ERROR, category, message, data);
    if (this.shouldLog(LogLevel.ERROR, category, message)) {
      console.error(this.formatMessage(LogLevel.ERROR, category, message), data || '');
    }
  }
}

export const logger = Logger.getInstance();
