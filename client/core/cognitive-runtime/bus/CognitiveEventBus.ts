import { logger } from '../../logger/Logger';

type CognitiveEvent = 
  | 'cognition:thinking'
  | 'cognition:executing'
  | 'cognition:context_updated'
  | 'cognition:intent_received'
  | 'cognition:state_changed'
  | 'cognition:arbitration_blocked'
  | 'cognition:execution_finished'
  | 'cognition:aborted';

export class CognitiveEventBus {
  private static instance: CognitiveEventBus;
  private listeners: Map<CognitiveEvent, Array<(data: any) => void>> = new Map();

  private constructor() {}

  public static getInstance(): CognitiveEventBus {
    if (!CognitiveEventBus.instance) {
      CognitiveEventBus.instance = new CognitiveEventBus();
    }
    return CognitiveEventBus.instance;
  }

  public on(event: CognitiveEvent, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(callback);
    return () => this.off(event, callback);
  }

  public off(event: CognitiveEvent, callback: (data: any) => void) {
    const arr = this.listeners.get(event);
    if (arr) {
      this.listeners.set(event, arr.filter(cb => cb !== callback));
    }
  }

  public emit(event: CognitiveEvent, data?: any) {
    // Only log specific important events to maintain Calm Mode
    if (event === 'cognition:intent_received' || event === 'cognition:state_changed') {
      logger.trace('COGNITIVE_BUS', `Emitting ${event}`);
    }
    const arr = this.listeners.get(event);
    if (arr) {
      arr.forEach(cb => cb(data));
    }
  }
}

export const cognitiveEventBus = CognitiveEventBus.getInstance();
