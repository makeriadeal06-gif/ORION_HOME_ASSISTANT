import { CognitiveMemory, CognitiveContext } from '../types';
import { logger } from '../../logger/Logger';
import { runtimeIdentity } from '@core/runtime/RuntimeIdentity';

export class CognitiveMemoryLayer {
  private static instance: CognitiveMemoryLayer;
  
  private memory: CognitiveMemory = {
    lastDeviceId: null,
    lastTriggerId: null,
    shortHistory: [],
    recentContextSnapshot: null,
    lastIntentId: null
  };

  private readonly MAX_HISTORY = 15;

  private constructor() {}

  public static getInstance(): CognitiveMemoryLayer {
    if (!CognitiveMemoryLayer.instance) {
      CognitiveMemoryLayer.instance = new CognitiveMemoryLayer();
    }
    return CognitiveMemoryLayer.instance;
  }

  public recordAction(actionType: string, targetId: string) {
    if (actionType === 'DEVICE') this.memory.lastDeviceId = targetId;
    if (actionType === 'TRIGGER') this.memory.lastTriggerId = targetId;

    const entry = `[${new Date().toISOString()}] ${actionType}:${targetId}`;
    this.memory.shortHistory.unshift(entry);
    
    if (this.memory.shortHistory.length > this.MAX_HISTORY) {
      this.memory.shortHistory.pop();
    }
  }

  public recordContextSnapshot(snapshot: CognitiveContext) {
    this.memory.recentContextSnapshot = snapshot;
  }

  public recordIntent(intentId: string) {
    this.memory.lastIntentId = intentId;
  }

  public getMemorySnapshot(): Readonly<CognitiveMemory> {
    return this.memory;
  }
  
  public clear() {
    logger.trace('COGNITIVE_MEMORY', 'Clearing short-term memory');
    this.memory = {
      lastDeviceId: null,
      lastTriggerId: null,
      shortHistory: [],
      recentContextSnapshot: null,
      lastIntentId: null
    };
  }
}

export const cognitiveMemory = CognitiveMemoryLayer.getInstance();

runtimeIdentity.subscribe((snapshot, previousSnapshot) => {
  if (snapshot.runtimeSessionId === previousSnapshot.runtimeSessionId) {
    return;
  }

  cognitiveMemory.clear();
  logger.info('SCOPED_MEMORY', `cognitive_memory_reset owner=${snapshot.ownerId || 'preview'} session=${snapshot.runtimeSessionId}`);
});
