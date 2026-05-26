import { create } from 'zustand';
import {
  ConversationChainSnapshot,
  OrionBehaviorMode,
  OrionPresenceState,
  PresenceContextSnapshot,
  ResponseStyleProfile,
} from '../types';

interface PresenceStoreState {
  cognitiveState: OrionPresenceState;
  mode: OrionBehaviorMode;
  responseProfile: ResponseStyleProfile;
  context: PresenceContextSnapshot;
  chain: ConversationChainSnapshot;
  setCognitiveState: (state: OrionPresenceState) => void;
  setMode: (mode: OrionBehaviorMode) => void;
  setResponseProfile: (profile: ResponseStyleProfile) => void;
  setContext: (context: PresenceContextSnapshot) => void;
  setChain: (chain: ConversationChainSnapshot) => void;
}

const DEFAULT_PROFILE: ResponseStyleProfile = {
  mode: 'Equilibrado',
  acknowledgmentStyle: 'natural',
  pacing: 'steady',
  chatterLevel: 'medium',
};

const DEFAULT_CONTEXT: PresenceContextSnapshot = {
  updatedAt: Date.now(),
  timeOfDay: 'tarde',
  focusActive: false,
  activeAutomations: 0,
  playbackActive: false,
  runtimeState: {
    recovering: false,
    disconnected: false,
    reconnecting: false,
    degraded: false,
    offline: false,
    criticalAutomationActive: false,
    longRunningTaskActive: false,
    recentRuntimeError: null,
  },
  androidLifecycle: 'BOOTING',
  connectivity: 'disconnected',
  currentView: 'dashboard',
  recentCommands: [],
  route: '/',
  environment: {
    batteryLevel: null,
    networkQuality: 'unknown',
    activeAudioDevice: 'default',
    fullscreenApp: null,
    idleState: 'active',
    foregroundApp: 'dashboard',
    wifiDiscoveryPlaceholder: 'pending',
    environmentType: 'browser',
    runtimeQuality: 'stable',
    operationalMode: 'active',
    deviceId: 'unknown',
  },
};

export const usePresenceStore = create<PresenceStoreState>((set) => ({
  cognitiveState: 'idle',
  mode: 'Equilibrado',
  responseProfile: DEFAULT_PROFILE,
  context: DEFAULT_CONTEXT,
  chain: {
    id: null,
    lastUpdatedAt: null,
    lastActionVerb: null,
    lastTarget: null,
  },
  setCognitiveState: (cognitiveState) => set({ cognitiveState }),
  setMode: (mode) => set({ mode }),
  setResponseProfile: (responseProfile) => set({ responseProfile }),
  setContext: (context) => set({ context }),
  setChain: (chain) => set({ chain }),
}));
