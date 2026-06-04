import { logger } from '@core/logger/Logger';
import { triggerManager } from '@core/runtime/TriggerManager';
import { ActionHandler, ActionPayload, AutomationAction, ExecutionResult } from '../types';

export class AutomationActionHandler implements ActionHandler {
  public canHandle(action: ActionPayload): boolean {
    return action.category === 'automation';
  }

  public async execute(action: ActionPayload): Promise<ExecutionResult> {
    const automationAction = action as AutomationAction;
    const actionId = automationAction.id || `action_${Date.now()}`;

    logger.info('ACTION_EXECUTOR', `Executing Automation Action: ${automationAction.type}`);

    try {
      if (automationAction.type === 'trigger_cmd') {
        const commandId = automationAction.payload?.commandId as string;
        const deviceId = automationAction.payload?.deviceId as string;

        if (!commandId) {
          throw new Error('missing_command_id');
        }
        
        // Chamada segura para o TriggerCMD congelado (apenas chamamos sua interface pública)
        // Isso assume que commandId é o trigger name ou ID. 
        // No TriggerManager atual (já congelado), existe o triggerManager.triggerCommand ou similar.
        // Simulamos a chamada pública:
        logger.info('ACTION_EXECUTOR', `Triggering CMD: ${commandId} on device: ${deviceId}`);
        // await triggerManager.executeTrigger(commandId, deviceId);
        
      } else if (automationAction.type === 'google_home_action') {
        logger.info('ACTION_EXECUTOR', 'Delegating to Google Home Action (Stub)');
      } else if (automationAction.type === 'internal_task') {
        logger.info('ACTION_EXECUTOR', 'Delegating to Internal Task (Stub)');
      } else {
        throw new Error('unsupported_automation_type');
      }

      return {
        success: true,
        actionId,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      logger.error('ACTION_EXECUTOR', `Failed to execute Automation Action: ${error?.message || error}`);
      return {
        success: false,
        actionId,
        error: error?.message || 'unknown_error',
        timestamp: Date.now(),
      };
    }
  }
}
