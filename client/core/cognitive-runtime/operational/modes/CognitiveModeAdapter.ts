import { 
  OperationalSituation, 
  OperationalDecision, 
  OperationalDecisionType, 
  OperationalImportance 
} from '../types';
import { CognitiveModeType } from './types';
import { logger } from '@core/logger/Logger';

// STABILITY FREEZE
// DO NOT MODIFY WITHOUT ARCHITECTURAL REVIEW.

/**
 * COGNITIVE MODE ADAPTER
 * 
 * Adjusts operational decisions based on the active cognitive mode.
 */
export class CognitiveModeAdapter {
  public static adapt(
    situation: OperationalSituation, 
    mode: CognitiveModeType
  ): OperationalDecisionType {
    logger.info('COGNITIVE_MODES', `adapting_decision situation=${situation.source} importance=${situation.importance} mode=${mode}`);

    switch (mode) {
      case CognitiveModeType.FOCUS:
        return this.adaptForFocus(situation);
      case CognitiveModeType.PROFESSIONAL:
        return this.adaptForProfessional(situation);
      case CognitiveModeType.SILENT:
        return this.adaptForSilent(situation);
      case CognitiveModeType.CASUAL:
        return this.adaptForCasual(situation);
      case CognitiveModeType.BALANCED:
      default:
        return this.adaptForBalanced(situation);
    }
  }

  private static adaptForBalanced(situation: OperationalSituation): OperationalDecisionType {
    if (situation.importance === OperationalImportance.CRITICAL) {
      return OperationalDecisionType.REDUCE_BACKGROUND_ACTIVITY;
    }
    if (situation.importance === OperationalImportance.HIGH) {
      return OperationalDecisionType.ENTER_POWER_SAVE_MODE;
    }
    if (situation.importance === OperationalImportance.MEDIUM) {
      return OperationalDecisionType.PRESERVE_NETWORK_USAGE;
    }
    return OperationalDecisionType.NO_ACTION;
  }

  private static adaptForFocus(situation: OperationalSituation): OperationalDecisionType {
    // Focus is aggressive on saving resources and reducing noise
    if (situation.importance === OperationalImportance.CRITICAL || situation.importance === OperationalImportance.HIGH) {
      return OperationalDecisionType.REDUCE_BACKGROUND_ACTIVITY;
    }
    if (situation.source === 'battery' || situation.source === 'network') {
      return OperationalDecisionType.ENTER_POWER_SAVE_MODE;
    }
    return OperationalDecisionType.REDUCE_BACKGROUND_ACTIVITY;
  }

  private static adaptForProfessional(situation: OperationalSituation): OperationalDecisionType {
    // Professional prioritizes stability, avoids aggressive changes unless critical
    if (situation.importance === OperationalImportance.CRITICAL) {
      return OperationalDecisionType.REDUCE_BACKGROUND_ACTIVITY;
    }
    // Don't auto-enter power save in professional mode if it might interrupt tasks
    return OperationalDecisionType.NO_ACTION;
  }

  private static adaptForSilent(situation: OperationalSituation): OperationalDecisionType {
    // Silent reduces activity to keep the device quiet and cool
    if (situation.importance === OperationalImportance.LOW) {
      return OperationalDecisionType.NO_ACTION;
    }
    return OperationalDecisionType.REDUCE_BACKGROUND_ACTIVITY;
  }

  private static adaptForCasual(situation: OperationalSituation): OperationalDecisionType {
    // Casual is permissive, only acts on CRITICAL or HIGH battery
    if (situation.importance === OperationalImportance.CRITICAL) {
      return OperationalDecisionType.REDUCE_BACKGROUND_ACTIVITY;
    }
    if (situation.source === 'battery' && situation.importance === OperationalImportance.HIGH) {
      return OperationalDecisionType.ENTER_POWER_SAVE_MODE;
    }
    return OperationalDecisionType.NO_ACTION;
  }
}
