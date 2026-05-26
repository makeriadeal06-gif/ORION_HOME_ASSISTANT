export type OrionBehaviorMode = 'Equilibrado' | 'Silencioso' | 'Profissional' | 'Casual' | 'Foco';

export type OrionPresenceState =
  | 'idle'
  | 'listening'
  | 'understanding'
  | 'processing'
  | 'executing'
  | 'speaking'
  | 'recovering'
  | 'reconnecting'
  | 'suspended';

export interface RecentCommandContext {
  id: string;
  chainId: string;
  rawText: string;
  normalizedText: string;
  action: string;
  target: string;
  createdAt: number;
  followup: boolean;
}

export interface ResponseStyleProfile {
  mode: OrionBehaviorMode;
  acknowledgmentStyle: 'minimal' | 'natural' | 'direct' | 'calm';
  pacing: 'calm' | 'steady' | 'compact';
  chatterLevel: 'low' | 'medium' | 'high';
}

export interface EnvironmentalContextSnapshot {
  batteryLevel: number | null;
  networkQuality: string;
  activeAudioDevice: string;
  fullscreenApp: string | null;
  idleState: 'active' | 'idle';
  foregroundApp: string;
  wifiDiscoveryPlaceholder: string;
  environmentType: string;
  runtimeQuality: string;
  operationalMode: string;
  deviceId: string;
}

export interface RuntimeAwarenessSnapshot {
  recovering: boolean;
  disconnected: boolean;
  reconnecting: boolean;
  degraded: boolean;
  offline: boolean;
  criticalAutomationActive: boolean;
  longRunningTaskActive: boolean;
  recentRuntimeError: string | null;
}

export interface PresenceContextSnapshot {
  updatedAt: number;
  timeOfDay: 'madrugada' | 'manha' | 'tarde' | 'noite';
  focusActive: boolean;
  activeAutomations: number;
  playbackActive: boolean;
  runtimeState: RuntimeAwarenessSnapshot;
  androidLifecycle: string;
  connectivity: 'connected' | 'disconnected' | 'reconnecting';
  currentView: string;
  recentCommands: RecentCommandContext[];
  route: string;
  environment: EnvironmentalContextSnapshot;
}

export interface ConversationChainSnapshot {
  id: string | null;
  lastUpdatedAt: number | null;
  lastActionVerb: string | null;
  lastTarget: string | null;
}

export interface PresenceRecoverySnapshot {
  ownerId: string;
  runtimeSessionId: string;
  runtimeDeviceId?: string;
  context: PresenceContextSnapshot;
  cognitiveState: OrionPresenceState;
  mode: OrionBehaviorMode;
  responseProfile: ResponseStyleProfile;
  chain: ConversationChainSnapshot;
}
