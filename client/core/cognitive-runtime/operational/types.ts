export enum OperationalImportance {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum OperationalDecisionType {
  ENTER_POWER_SAVE_MODE = 'ENTER_POWER_SAVE_MODE',
  REDUCE_BACKGROUND_ACTIVITY = 'REDUCE_BACKGROUND_ACTIVITY',
  PRESERVE_NETWORK_USAGE = 'PRESERVE_NETWORK_USAGE',
  NO_ACTION = 'NO_ACTION'
}

export interface OperationalSituation {
  id: string;
  importance: OperationalImportance;
  description: string;
  source: string;
  timestamp: number;
}

export interface OperationalDecision {
  id: string;
  type: OperationalDecisionType;
  situationId: string;
  reason: string;
  timestamp: number;
}
