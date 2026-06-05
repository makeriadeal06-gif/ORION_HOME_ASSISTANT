import { ExecutionResult } from '../../action-executor/types';

/**
 * Supported Android Action Types
 */
export enum AndroidActionType {
  ENABLE_POWER_SAVE = 'ENABLE_POWER_SAVE',
  DISABLE_POWER_SAVE = 'DISABLE_POWER_SAVE',
  REDUCE_BRIGHTNESS = 'REDUCE_BRIGHTNESS',
  RESTORE_BRIGHTNESS = 'RESTORE_BRIGHTNESS',
  ENABLE_DO_NOT_DISTURB = 'ENABLE_DO_NOT_DISTURB',
  DISABLE_DO_NOT_DISTURB = 'DISABLE_DO_NOT_DISTURB',
  REDUCE_BACKGROUND_ACTIVITY = 'REDUCE_BACKGROUND_ACTIVITY',
  RESTORE_BACKGROUND_ACTIVITY = 'RESTORE_BACKGROUND_ACTIVITY'
}

/**
 * Native Android Action structure
 */
export interface AndroidActionDefinition {
  type: AndroidActionType;
  params?: Record<string, any>;
  timestamp: number;
}

/**
 * Interface for the Android Adapter (Mock or Real)
 */
export interface AndroidAdapter {
  execute(action: AndroidActionDefinition): Promise<ExecutionResult>;
}
