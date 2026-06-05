import { logger } from '../../logger/Logger';
import { ExecutionResult } from '../../action-executor/types';
import { AndroidActionDefinition, AndroidAdapter } from './types';
import { MockAndroidAdapter } from './MockAndroidAdapter';

/**
 * ANDROID ACTION BRIDGE
 * 
 * Orchestrates the dispatching of actions to the appropriate Android adapter.
 * Currently defaults to MockAndroidAdapter as per Phase 13 requirements.
 */
// FREEZE_PHASE_14_CONTROLLED_AUTONOMY
class AndroidActionBridge {
  private static instance: AndroidActionBridge;
  private adapter: AndroidAdapter;

  private constructor() {
    // Default to mock for simulation as per Phase 13 requirements
    this.adapter = new MockAndroidAdapter();
    logger.info('ANDROID_ACTION_BRIDGE', 'initialized with MockAndroidAdapter');
  }

  public static getInstance(): AndroidActionBridge {
    if (!AndroidActionBridge.instance) {
      AndroidActionBridge.instance = new AndroidActionBridge();
    }
    return AndroidActionBridge.instance;
  }

  /**
   * Sets a new adapter (e.g., when switching from mock to real)
   */
  public setAdapter(adapter: AndroidAdapter): void {
    this.adapter = adapter;
    logger.info('ANDROID_ACTION_BRIDGE', 'adapter updated');
  }

  /**
   * Dispatches an action to the active adapter.
   */
  public async dispatch(action: AndroidActionDefinition): Promise<ExecutionResult> {
    // FREEZE_PHASE_14_CONTROLLED_AUTONOMY
    logger.info('ANDROID_ACTION_DISPATCH', `Dispatching ${action.type}...`);
    
    try {
      const result = await this.adapter.execute(action);
      return result;
    } catch (error: any) {
      logger.error('ANDROID_ACTION_BRIDGE', `Dispatch failed: ${error?.message || error}`);
      return {
        success: false,
        actionId: `err_${Date.now()}`,
        error: error?.message || 'dispatch_error',
        timestamp: Date.now()
      };
    }
  }
}

export const androidActionBridge = AndroidActionBridge.getInstance();
