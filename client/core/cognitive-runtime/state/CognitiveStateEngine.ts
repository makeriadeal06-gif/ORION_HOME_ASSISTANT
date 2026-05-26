import { useCognitiveStore } from './useCognitiveStore';
import { CognitiveState, CognitiveToken } from '../types';
import { cognitiveEventBus } from '../bus/CognitiveEventBus';
import { logger } from '../../logger/Logger';

export class CognitiveStateEngine {
  private static instance: CognitiveStateEngine;
  private currentTimeout: NodeJS.Timeout | null = null;
  private currentToken: CognitiveToken | null = null;

  private constructor() {}

  public static getInstance(): CognitiveStateEngine {
    if (!CognitiveStateEngine.instance) {
      CognitiveStateEngine.instance = new CognitiveStateEngine();
    }
    return CognitiveStateEngine.instance;
  }

  public getState(): CognitiveState {
    return useCognitiveStore.getState().state;
  }

  /**
   * Translates into a new state, enforcing constraints.
   * Provides a token that can be used to cancel the ongoing operation and revert to IDLE.
   */
  public transitionTo(newState: CognitiveState, timeoutMs: number = 30000): CognitiveToken | null {
    const currentState = this.getState();
    
    // Prevent overlapping Executing/Recovering states
    if ((currentState === CognitiveState.EXECUTING || currentState === CognitiveState.RECOVERING) 
         && newState !== CognitiveState.IDLE) {
      logger.warn('COGNITIVE_STATE', `Blocked transition to ${newState} while in ${currentState}`);
      return null;
    }

    // Cancel any previous operation if transitioning aggressively (starting a new thinking/command loop)
    if (newState === CognitiveState.THINKING && this.currentToken && !this.currentToken.isCancelled) {
      this.cancelCurrentOperation('New transition initiated');
    }

    logger.info('COGNITIVE_STATE', `Transitioning: ${currentState} -> ${newState}`);
    useCognitiveStore.getState().setState(newState);
    cognitiveEventBus.emit('cognition:state_changed', newState);

    if (newState === CognitiveState.IDLE) {
      if (this.currentTimeout) {
        clearTimeout(this.currentTimeout);
        this.currentTimeout = null;
      }
      this.currentToken = null;
      return null;
    }

    const tokenId = Math.random().toString(36).substring(7);
    const token: CognitiveToken = {
      id: tokenId,
      isCancelled: false,
      cancel: () => {
        if (token.isCancelled) return;
        token.isCancelled = true;
        this.cancelCurrentOperation(`Token ${tokenId} invoked cancellation`);
      }
    };
    
    this.currentToken = token;

    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
      this.currentTimeout = null;
    }

    // Auto-fallback to IDLE if the operation gets stuck
    if (newState !== CognitiveState.OBSERVING) {
      this.currentTimeout = setTimeout(() => {
        if (this.currentToken === token && !token.isCancelled) {
          logger.warn('COGNITIVE_STATE', `Timeout reached for state ${newState}. Forcing IDLE.`);
          token.cancel();
        }
      }, timeoutMs);
    }

    return token;
  }

  public resetToIdle() {
    this.transitionTo(CognitiveState.IDLE);
  }

  private cancelCurrentOperation(reason: string) {
    logger.trace('COGNITIVE_STATE', `Operation Aborted: ${reason}`);
    if (this.currentToken) {
      this.currentToken.isCancelled = true;
      this.currentToken = null;
    }
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
      this.currentTimeout = null;
    }
    
    if (this.getState() !== CognitiveState.IDLE && this.getState() !== CognitiveState.OBSERVING) {
      logger.info('COGNITIVE_STATE', 'Rolling back to IDLE due to cancellation');
      useCognitiveStore.getState().setState(CognitiveState.IDLE);
      cognitiveEventBus.emit('cognition:state_changed', CognitiveState.IDLE);
      cognitiveEventBus.emit('cognition:aborted', reason);
    }
  }
}

export const cognitiveStateEngine = CognitiveStateEngine.getInstance();
