import { CognitiveModeType } from '../operational/modes/types';
import { AutonomyLevel } from './types';

/**
 * Registry of autonomy policies based on Cognitive Modes.
 */
// FREEZE_PHASE_14_CONTROLLED_AUTONOMY
export const AutonomyPolicyRegistry: Record<CognitiveModeType, AutonomyLevel> = {
  [CognitiveModeType.PROFESSIONAL]: AutonomyLevel.CONFIRM,
  [CognitiveModeType.BALANCED]: AutonomyLevel.CONFIRM, // Mapping EQUILIBRADO to BALANCED, defaulting to CONFIRM per rules
  [CognitiveModeType.FOCUS]: AutonomyLevel.AUTONOMOUS,
  [CognitiveModeType.SILENT]: AutonomyLevel.AUTONOMOUS,
  [CognitiveModeType.CASUAL]: AutonomyLevel.SUGGEST
};

/**
 * Custom rule overrides can be implemented here if needed.
 * For example: Critical battery might always be AUTONOMOUS regardless of mode.
 */
