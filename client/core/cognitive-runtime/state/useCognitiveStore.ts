import { create } from 'zustand';
import { CognitiveState, CognitiveContext, CognitiveSuggestion, BehaviorPattern } from '../types';

interface CognitiveStore {
  state: CognitiveState;
  context: CognitiveContext;
  suggestions: CognitiveSuggestion[];
  patterns: BehaviorPattern[];
  
  setState: (state: CognitiveState) => void;
  updateContext: (update: Partial<CognitiveContext>) => void;
  addSuggestion: (suggestion: CognitiveSuggestion) => void;
  removeSuggestion: (id: string) => void;
  updatePatterns: (patterns: BehaviorPattern[]) => void;
}

export const useCognitiveStore = create<CognitiveStore>((set) => ({
  state: CognitiveState.IDLE,
  context: {
    activeDevicesCount: 0,
    runtimeStatus: 'INITIALIZING',
    socketStatus: 'INITIALIZING',
    mqttStatus: 'DISCONNECTED',
    availableTriggersCount: 0,
    recentActivity: 'NONE',
    lastCommand: null,
    isUserAuthenticated: false,
    loadLevel: 0,
    lastEvent: 'INITIALIZING',
    isHomeOccupied: false,
    timeContext: 'MORNING',

    // Extended defaults
    playbackActive: false,
    mediaSessionState: null,
    lastMediaSource: null,
    focusActive: false,
    fullscreenApp: null,
    foregroundApp: 'dashboard',
    behaviorMode: 'AUTO'
  },
  suggestions: [],
  patterns: [],

  setState: (state) => set({ state }),
  
  updateContext: (update) => set((state) => ({
    context: { ...state.context, ...update }
  })),

  addSuggestion: (suggestion) => set((state) => ({
    suggestions: [suggestion, ...state.suggestions].slice(0, 5)
  })),

  removeSuggestion: (id) => set((state) => ({
    suggestions: state.suggestions.filter(s => s.id !== id)
  })),

  updatePatterns: (patterns) => set({ patterns })
}));
