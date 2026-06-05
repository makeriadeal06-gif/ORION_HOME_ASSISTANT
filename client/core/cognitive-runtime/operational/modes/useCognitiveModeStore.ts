import { create } from 'zustand';
import { CognitiveModeType, CognitiveModeState } from './types';
import { logger } from '@core/logger/Logger';
import { operationalMemoryEngine } from '../memory/OperationalMemoryEngine';

// STABILITY FREEZE
// DO NOT MODIFY WITHOUT ARCHITECTURAL REVIEW.
// FREEZE_PHASE_09_OPERATIONAL_MEMORY
// FREEZE_PHASE_14_CONTROLLED_AUTONOMY

interface CognitiveModeActions {
  setActiveMode: (mode: CognitiveModeType) => void;
}

export const useCognitiveModeStore = create<CognitiveModeState & CognitiveModeActions>((set) => ({
  activeMode: CognitiveModeType.BALANCED,
  lastChangedAt: Date.now(),

  setActiveMode: (mode) => {
    // FREEZE_PHASE_14_CONTROLLED_AUTONOMY
    logger.info('COGNITIVE_MODES', `mode_transition target=${mode}`);
    
    // FREEZE_PHASE_09_OPERATIONAL_MEMORY
    operationalMemoryEngine.record('mode_change', 'cognitive_modes', { 
      previous: useCognitiveModeStore.getState().activeMode,
      next: mode 
    });

    set({ activeMode: mode, lastChangedAt: Date.now() });
  },
}));
