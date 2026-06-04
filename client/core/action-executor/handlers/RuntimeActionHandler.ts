import { logger } from '@core/logger/Logger';
import { useRuntimeStore } from '@core/state/stores/useRuntimeStore';
import { ActionHandler, ActionPayload, ExecutionResult, RuntimeAction } from '../types';

export class RuntimeActionHandler implements ActionHandler {
  public canHandle(action: ActionPayload): boolean {
    return action.category === 'runtime';
  }

  public async execute(action: ActionPayload): Promise<ExecutionResult> {
    const runtimeAction = action as RuntimeAction;
    const actionId = runtimeAction.id || `action_${Date.now()}`;

    logger.info('ACTION_EXECUTOR', `Executing Runtime Action: ${runtimeAction.type}`);

    try {
      if (runtimeAction.type === 'set_calm_mode') {
        // Interagir com o store ou manager local
        // Isso é um mock seguro da fundação
        const enabled = runtimeAction.payload?.enabled ?? true;
        logger.info('ACTION_EXECUTOR', `Setting calm mode to ${enabled}`);
        // Exemplo: useRuntimeStore.getState().setCalmMode(enabled);
      } else if (runtimeAction.type === 'set_power_saving') {
        const enabled = runtimeAction.payload?.enabled ?? true;
        logger.info('ACTION_EXECUTOR', `Setting power saving mode to ${enabled}`);
      } else {
        logger.warn('ACTION_EXECUTOR', `Unsupported Runtime Action type: ${runtimeAction.type}`);
        return {
          success: false,
          actionId,
          error: 'unsupported_action_type',
          timestamp: Date.now(),
        };
      }

      return {
        success: true,
        actionId,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      logger.error('ACTION_EXECUTOR', `Failed to execute Runtime Action: ${error?.message || error}`);
      return {
        success: false,
        actionId,
        error: error?.message || 'unknown_error',
        timestamp: Date.now(),
      };
    }
  }
}
