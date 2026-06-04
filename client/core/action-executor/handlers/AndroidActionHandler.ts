import { logger } from '@core/logger/Logger';
import { ActionHandler, ActionPayload, AndroidAction, ExecutionResult } from '../types';

export class AndroidActionHandler implements ActionHandler {
  public canHandle(action: ActionPayload): boolean {
    return action.category === 'android';
  }

  public async execute(action: ActionPayload): Promise<ExecutionResult> {
    const androidAction = action as AndroidAction;
    const actionId = androidAction.id || `action_${Date.now()}`;
    const bridge = window.AndroidOrionBridge;

    logger.info('ACTION_EXECUTOR', `Executing Android Action: ${androidAction.type}`);

    if (!bridge || !bridge.executeAndroidAction) {
      logger.warn('ACTION_EXECUTOR', 'Native bridge or executeAndroidAction not available');
      return {
        success: false,
        actionId,
        error: 'native_bridge_unavailable',
        timestamp: Date.now(),
      };
    }

    try {
      await bridge.executeAndroidAction(androidAction);
      return {
        success: true,
        actionId,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      logger.error('ACTION_EXECUTOR', `Failed to execute Android Action: ${error?.message || error}`);
      return {
        success: false,
        actionId,
        error: error?.message || 'unknown_error',
        timestamp: Date.now(),
      };
    }
  }
}
