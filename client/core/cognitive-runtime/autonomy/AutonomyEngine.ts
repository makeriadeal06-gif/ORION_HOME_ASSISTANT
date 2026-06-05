import { logger } from '../../logger/Logger';
import { actionExecutorEngine } from '../../action-executor/ActionExecutorEngine';
import { useCognitiveModeStore } from '../operational/modes/useCognitiveModeStore';
import { DecisionCandidate } from '../decision/types';
import { AutonomyLevel, AutonomyEvaluation } from './types';
import { AutonomyPolicyRegistry } from './AutonomyPolicyRegistry';

/**
 * AUTONOMY ENGINE
 * 
 * Determines whether a decision should be executed automatically,
 * confirmed with the user, or just suggested.
 */
// FREEZE_PHASE_14_CONTROLLED_AUTONOMY
class AutonomyEngine {
  private static instance: AutonomyEngine;

  private constructor() {}

  public static getInstance(): AutonomyEngine {
    if (!AutonomyEngine.instance) {
      AutonomyEngine.instance = new AutonomyEngine();
    }
    return AutonomyEngine.instance;
  }

  /**
   * Processes a decision from the Decision Engine and applies autonomy policies.
   */
  public async process(decision: DecisionCandidate): Promise<AutonomyEvaluation> {
    // FREEZE_PHASE_14_CONTROLLED_AUTONOMY
    const activeMode = useCognitiveModeStore.getState().activeMode;
    const level = AutonomyPolicyRegistry[activeMode] || AutonomyLevel.SUGGEST;

    logger.info('AUTONOMY_ENGINE', `Evaluating decision ${decision.id} with policy ${level} (Mode: ${activeMode})`);
    logger.info('AUTONOMY_POLICY', `Active Policy: ${level} for Mode: ${activeMode}`);

    let executed = false;

    switch (level) {
      case AutonomyLevel.AUTONOMOUS:
        logger.info('AUTONOMY_EXECUTION', `Executing action ${decision.action.type} autonomously.`);
        void actionExecutorEngine.execute(decision.action);
        executed = true;
        break;

      case AutonomyLevel.CONFIRM:
        logger.info('AUTONOMY_CONFIRMATION', `Pending user confirmation for action: ${decision.action.type}. Reason: ${decision.reason}`);
        // In a real scenario, this would trigger a UI notification/dialog
        // For Phase 14, we just log the requirement.
        break;

      case AutonomyLevel.SUGGEST:
        logger.info('AUTONOMY_DECISION', `Suggestion only: Orion recommends ${decision.action.type}. Reason: ${decision.reason}`);
        break;
    }

    return {
      decision,
      level,
      executed,
      timestamp: Date.now()
    };
  }
}

export const autonomyEngine = AutonomyEngine.getInstance();
