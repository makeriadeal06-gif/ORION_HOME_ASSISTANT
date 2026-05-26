import { logger } from '../../logger/Logger';

export enum HealthEvent {
  PING = 'HEALTH:PING',
  DEGRADED = 'HEALTH:DEGRADED',
  CRITICAL = 'HEALTH:CRITICAL',
  RECOVERED = 'HEALTH:RECOVERED'
}

type HealthHandler = (payload: { subsystemId: string, message?: string }) => void;

class RuntimeHealthBus {
  private static instance: RuntimeHealthBus;
  private listeners: Map<HealthEvent, Set<HealthHandler>> = new Map();

  private constructor() {
    Object.values(HealthEvent).forEach(event => {
      this.listeners.set(event, new Set());
    });
  }

  public static getInstance(): RuntimeHealthBus {
    if (!RuntimeHealthBus.instance) {
      RuntimeHealthBus.instance = new RuntimeHealthBus();
    }
    return RuntimeHealthBus.instance;
  }

  public subscribe(event: HealthEvent, handler: HealthHandler) {
    this.listeners.get(event)?.add(handler);
    return () => this.listeners.get(event)?.delete(handler);
  }

  public emit(event: HealthEvent, subsystemId: string, message?: string) {
    // Throttling or silent logging can be added here
    this.listeners.get(event)?.forEach(handler => handler({ subsystemId, message }));
  }

  public ping(subsystemId: string) {
    this.emit(HealthEvent.PING, subsystemId, 'Operational');
  }
}

export const healthBus = RuntimeHealthBus.getInstance();
