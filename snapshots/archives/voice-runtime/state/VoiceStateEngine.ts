import { useVoiceStore } from './useVoiceStore';
import { VoiceState } from '../types';
import { logger } from '../../logger/Logger';

export class VoiceStateEngine {
  private static instance: VoiceStateEngine;
  private stateTimeout: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): VoiceStateEngine {
    if (!VoiceStateEngine.instance) {
      VoiceStateEngine.instance = new VoiceStateEngine();
    }
    return VoiceStateEngine.instance;
  }

  public getState(): VoiceState {
    return useVoiceStore.getState().state;
  }

  public transitionTo(newState: VoiceState, timeoutMs: number = 0) {
    const currentState = this.getState();
    
    // Prevent overlapping states unnecessarily
    if (currentState === newState) return;

    logger.trace('VOICE_STATE', `Transitioning: ${currentState} -> ${newState}`);
    useVoiceStore.getState().setState(newState);

    if (this.stateTimeout) {
      clearTimeout(this.stateTimeout);
      this.stateTimeout = null;
    }

    // Auto-fallback to IDLE if the operation gets stuck
    if (timeoutMs > 0 && newState !== VoiceState.IDLE) {
      this.stateTimeout = setTimeout(() => {
        logger.warn('VOICE_STATE', `Timeout reached for state ${newState}. Forcing IDLE fallback.`);
        this.resetToIdle();
      }, timeoutMs);
    }
  }

  public resetToIdle() {
    if (this.stateTimeout) {
      clearTimeout(this.stateTimeout);
      this.stateTimeout = null;
    }
    useVoiceStore.getState().setState(VoiceState.IDLE);
    logger.trace('VOICE_STATE', 'State reset to IDLE.');
  }
}

export const voiceStateEngine = VoiceStateEngine.getInstance();
