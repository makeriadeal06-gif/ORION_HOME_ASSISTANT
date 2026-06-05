import { logger } from '@core/logger/Logger';
import { ActionHandler, ActionPayload, ExecutionResult } from './types';
import { AndroidActionHandler } from './handlers/AndroidActionHandler';
import { RuntimeActionHandler } from './handlers/RuntimeActionHandler';
import { AutomationActionHandler } from './handlers/AutomationActionHandler';

// STABILITY FREEZE
// DO NOT MODIFY WITHOUT ARCHITECTURAL REVIEW.

// STABILITY FREEZE
// DO NOT MODIFY WITHOUT ARCHITECTURAL REVIEW.
// FREEZE_PHASE_14_CONTROLLED_AUTONOMY

class ActionExecutorEngine {
  private static instance: ActionExecutorEngine;
  private handlers: ActionHandler[] = [];

  private constructor() {
    this.registerDefaultHandlers();
  }

  public static getInstance(): ActionExecutorEngine {
    if (!ActionExecutorEngine.instance) {
      ActionExecutorEngine.instance = new ActionExecutorEngine();
    }
    return ActionExecutorEngine.instance;
  }

  private registerDefaultHandlers(): void {
    this.handlers.push(
      new AndroidActionHandler(),
      new RuntimeActionHandler(),
      new AutomationActionHandler()
    );
  }

  public registerHandler(handler: ActionHandler): void {
    this.handlers.push(handler);
  }

  public async execute(action: ActionPayload): Promise<ExecutionResult> {
    // FREEZE_PHASE_14_CONTROLLED_AUTONOMY
    const handler = this.handlers.find((h) => h.canHandle(action));

    if (!handler) {
      logger.error('ACTION_EXECUTOR', `No handler found for category: ${action.category}`);
      return {
        success: false,
        actionId: action.id || `action_${Date.now()}`,
        error: 'no_handler_found',
        timestamp: Date.now(),
      };
    }

    logger.info('ACTION_EXECUTOR', `Routing action to handler...`);
    return await handler.execute(action);
  }
}

export const actionExecutorEngine = ActionExecutorEngine.getInstance();
