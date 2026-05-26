import { CognitiveIntent } from '../types';
import { cognitiveMemory } from '../memory/CognitiveMemoryLayer';
import { cognitiveEventBus } from '../bus/CognitiveEventBus';
import { logger } from '../../logger/Logger';

export class ActionArbitration {
  private static instance: ActionArbitration;
  private lastIntentTimestamps: Map<string, number> = new Map();

  private constructor() {}

  public static getInstance(): ActionArbitration {
    if (!ActionArbitration.instance) {
      ActionArbitration.instance = new ActionArbitration();
    }
    return ActionArbitration.instance;
  }

  public validateIntent(intent: CognitiveIntent): boolean {
    const memory = cognitiveMemory.getMemorySnapshot();
    const now = Date.now();

    // 1. Prevent duplicate intent submissions within 2 seconds
    const lastTime = this.lastIntentTimestamps.get(intent.id) || 0;
    if (now - lastTime < 2000) {
      logger.warn('COGNITIVE_ARBITRATION', `Intent ${intent.id} rejected: Duplicate submission within timeout.`);
      cognitiveEventBus.emit('cognition:arbitration_blocked', { intentId: intent.id, reason: 'duplicate' });
      return false;
    }
    this.lastIntentTimestamps.set(intent.id, now);

    // 2. Prevent loops (same command executed repeatedly too fast)
    if (intent.type === 'COMMAND' && intent.payload?.deviceId) {
      if (memory.lastDeviceId === intent.payload.deviceId) {
        // If the same device was targeted recently, check history
        const recentCommands = memory.shortHistory.filter(h => h.includes(`DEVICE:${intent.payload.deviceId}`));
        if (recentCommands.length > 3) {
           logger.warn('COGNITIVE_ARBITRATION', `Intent ${intent.id} rejected: Possible loop detected for device ${intent.payload.deviceId}.`);
           cognitiveEventBus.emit('cognition:arbitration_blocked', { intentId: intent.id, reason: 'loop_protection' });
           return false;
        }
      }
    }

    return true;
  }

  public clearCaches() {
    this.lastIntentTimestamps.clear();
  }
}

export const actionArbitration = ActionArbitration.getInstance();
