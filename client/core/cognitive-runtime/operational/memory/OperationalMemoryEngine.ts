import { logger } from '@core/logger/Logger';
import { MemoryEvent, MemoryQuery, OperationalContextSnapshot } from './types';

// FREEZE_PHASE_09_OPERATIONAL_MEMORY
/**
 * OPERATIONAL MEMORY ENGINE
 * 
 * Records recent operational events and provides contextual queries.
 * Maintains a sliding window of history (default 15 minutes).
 */
class OperationalMemoryEngine {
  private static instance: OperationalMemoryEngine;
  private events: MemoryEvent[] = [];
  private readonly HISTORY_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    this.startCleanupTask();
  }

  public static getInstance(): OperationalMemoryEngine {
    if (!OperationalMemoryEngine.instance) {
      OperationalMemoryEngine.instance = new OperationalMemoryEngine();
    }
    return OperationalMemoryEngine.instance;
  }

  public record(type: string, source: string, payload: any): void {
    const event: MemoryEvent = {
      id: `evt_${Math.random().toString(36).slice(2)}_${Date.now()}`,
      type,
      source,
      payload,
      timestamp: Date.now()
    };

    this.events.push(event);
    logger.info('OPERATIONAL_MEMORY', `event_recorded type=${type} source=${source}`);
  }

  public query(params: MemoryQuery): MemoryEvent[] {
    const now = Date.now();
    const since = params.since || (now - this.HISTORY_WINDOW_MS);

    return this.events.filter(event => {
      if (event.timestamp < since) return false;
      if (params.type && event.type !== params.type) return false;
      if (params.source && event.source !== params.source) return false;
      return true;
    });
  }

  public getContextSnapshot(): OperationalContextSnapshot {
    return {
      batteryTrend: this.calculateTrend('battery', 'level'),
      temperatureTrend: this.calculateTrend('battery', 'temperature'),
      lastModeChangeAt: this.getLastEventTimestamp('mode_change', 'cognitive_modes'),
      recentSituationsCount: this.query({ type: 'situation' }).length
    };
  }

  private calculateTrend(source: string, field: string): 'rising' | 'falling' | 'stable' {
    const recentEvents = this.query({ source }).sort((a, b) => a.timestamp - b.timestamp);
    if (recentEvents.length < 2) return 'stable';

    const values = recentEvents.map(e => e.payload[field]).filter(v => typeof v === 'number');
    if (values.length < 2) return 'stable';

    const first = values[0];
    const last = values[values.length - 1];
    const diff = last - first;

    if (Math.abs(diff) < 0.001) return 'stable';
    return diff > 0 ? 'rising' : 'falling';
  }

  private getLastEventTimestamp(type: string, source: string): number | null {
    const events = this.query({ type, source }).sort((a, b) => b.timestamp - a.timestamp);
    return events.length > 0 ? events[0].timestamp : null;
  }

  private startCleanupTask(): void {
    this.cleanupTimer = setInterval(() => {
      const expirationTime = Date.now() - this.HISTORY_WINDOW_MS;
      const initialCount = this.events.length;
      this.events = this.events.filter(e => e.timestamp > expirationTime);
      
      if (initialCount !== this.events.length) {
        logger.info('OPERATIONAL_MEMORY', `cleanup_performed removed=${initialCount - this.events.length}`);
      }
    }, 60000); // Clean up every minute
  }

  public shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

export const operationalMemoryEngine = OperationalMemoryEngine.getInstance();
