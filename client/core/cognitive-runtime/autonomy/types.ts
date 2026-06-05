import { ActionPayload } from '../../action-executor/types';
import { DecisionCandidate } from '../decision/types';

/**
 * Autonomy levels for Orion's decision making.
 */
// FREEZE_PHASE_14_CONTROLLED_AUTONOMY
export enum AutonomyLevel {
  /** Just recommend the action in logs/UI without executing. */
  SUGGEST = 'SUGGEST',
  /** Request user confirmation before executing. */
  CONFIRM = 'CONFIRM',
  /** Execute the action automatically. */
  AUTONOMOUS = 'AUTONOMOUS'
}

/**
 * Result of the autonomy engine's evaluation.
 */
export interface AutonomyEvaluation {
  decision: DecisionCandidate;
  level: AutonomyLevel;
  executed: boolean;
  timestamp: number;
}
