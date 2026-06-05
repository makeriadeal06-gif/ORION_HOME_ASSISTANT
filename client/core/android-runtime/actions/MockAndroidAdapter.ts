import { logger } from '../../logger/Logger';
import { ExecutionResult } from '../../action-executor/types';
import { AndroidActionDefinition, AndroidAdapter } from './types';

/**
 * MOCK ANDROID ADAPTER
 * 
 * Simulates Android system actions via logs.
 */
export class MockAndroidAdapter implements AndroidAdapter {
  public async execute(action: AndroidActionDefinition): Promise<ExecutionResult> {
    const actionId = `mock_${Date.now()}`;
    
    logger.info('ANDROID_ACTION_MOCK', `SIMULATING_ACTION: ${action.type}`);
    
    if (action.params) {
      logger.info('ANDROID_ACTION_MOCK', `Parameters: ${JSON.stringify(action.params)}`);
    }

    // Simulate async system latency
    await new Promise(resolve => setTimeout(resolve, 500));

    logger.info('ANDROID_ACTION_COMPLETE', `Action ${action.type} finished simulation.`);

    return {
      success: true,
      actionId,
      timestamp: Date.now()
    };
  }
}
