import { ActionPayload } from '../../action-executor/types';

/**
 * Priority levels for operational decisions.
 */
export enum PriorityLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

/**
 * Represents a potential action to be taken based on an operational situation.
 */
export interface DecisionCandidate {
  id: string;
  priority: PriorityLevel;
  action: ActionPayload;
  source: string;
  reason: string;
  metadata?: Record<string, any>;
  timestamp: number;
}

/**
 * Result of the decision engine's selection process.
 */
export interface DecisionResult {
  selected: DecisionCandidate | null;
  rejected: DecisionCandidate[];
  timestamp: number;
}
