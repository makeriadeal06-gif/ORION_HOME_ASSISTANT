import { create } from 'zustand';
import { CognitiveModeType, CognitiveModeState } from './types';
import { logger } from '@core/logger/Logger';

interface CognitiveModeActions {
  setActiveMode: (mode: CognitiveModeType) => void;
}

export const useCognitiveModeStore = create<CognitiveModeState & CognitiveModeActions>((set) => ({
  activeMode: CognitiveModeType.BALANCED,
  lastChangedAt: Date.now(),

  setActiveMode: (mode) => {
    logger.info('COGNITIVE_MODES', `mode_transition target=${mode}`);
    set({ activeMode: mode, lastChangedAt: Date.now() });
  },
}));
