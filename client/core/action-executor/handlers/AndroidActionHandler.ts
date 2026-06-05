import { logger } from '@core/logger/Logger';
import { ActionHandler, ActionPayload, AndroidAction, ExecutionResult } from '../types';
import { androidActionBridge } from '@core/android-runtime/actions/AndroidActionBridge';
import { AndroidActionType } from '@core/android-runtime/actions/types';

export class AndroidActionHandler implements ActionHandler {
  public canHandle(action: ActionPayload): boolean {
    return action.category === 'android';
  }

  public async execute(action: ActionPayload): Promise<ExecutionResult> {
    const androidAction = action as AndroidAction;
    const actionId = androidAction.id || `action_${Date.now()}`;

    logger.info('ACTION_EXECUTOR', `Routing Android Action: ${androidAction.type}`);

    // Map the ActionPayload to the AndroidActionBridge format
    // For now, we use a simple mapping or cast if types align
    try {
      const result = await androidActionBridge.dispatch({
        type: androidAction.type as unknown as AndroidActionType,
        params: androidAction.payload,
        timestamp: Date.now()
      });
      
      return result;
    } catch (error: any) {
      logger.error('ACTION_EXECUTOR', `Failed to route Android Action: ${error?.message || error}`);
      return {
        success: false,
        actionId,
        error: error?.message || 'routing_error',
        timestamp: Date.now(),
      };
    }
  }
}
