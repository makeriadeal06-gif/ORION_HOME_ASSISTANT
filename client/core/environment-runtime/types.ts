import type { VoiceProfile } from '@core/voice-runtime/types';

export type EnvironmentKind = 'desktop' | 'android' | 'browser' | 'mobile_web' | 'embedded_webview';

export type EnvironmentOperationalMode = 'active' | 'background' | 'degraded' | 'offline' | 'recovery';

export type RuntimeQualityProfile = 'optimal' | 'stable' | 'limited' | 'degraded' | 'offline' | 'recovering';

export type CapabilityState = 'available' | 'degraded' | 'unavailable';

export interface RuntimeCapabilityDescriptor {
  available: boolean;
  state: CapabilityState;
  detail: string;
  lastCheckedAt: number;
}

export interface RuntimeCapabilityProfile {
  microphone: RuntimeCapabilityDescriptor;
  notifications: RuntimeCapabilityDescriptor;
  localExecution: RuntimeCapabilityDescriptor;
  triggerCmdAvailability: RuntimeCapabilityDescriptor;
  browserSpeech: RuntimeCapabilityDescriptor;
  elevenLabsAvailability: RuntimeCapabilityDescriptor;
  backgroundExecution: RuntimeCapabilityDescriptor;
  automationExecution: RuntimeCapabilityDescriptor;
  websocketConnectivity: RuntimeCapabilityDescriptor;
}

export interface RuntimeQualitySummary {
  profile: RuntimeQualityProfile;
  score: number;
  reason: string;
}

export interface DeviceSessionAwareness {
  sessionId: string;
  activeDeviceId: string;
  userId: string | null;
  continuityKey: string;
  currentEnvironment: EnvironmentKind;
  multiDeviceReady: boolean;
}

export interface EnvironmentState {
  initializedAt: number;
  updatedAt: number;
  environment: EnvironmentKind;
  activeMode: EnvironmentOperationalMode;
  modes: {
    background: boolean;
    lowFocus: boolean;
    degraded: boolean;
    offline: boolean;
    recovery: boolean;
  };
  deviceSession: DeviceSessionAwareness;
  capabilities: RuntimeCapabilityProfile;
  runtimeQuality: RuntimeQualitySummary;
  health: {
    classification: 'healthy' | 'background' | 'degraded' | 'offline' | 'recovering';
    operationalScore: number;
    criticalCapabilitiesHealthy: boolean;
  };
  limitations: string[];
  coordination: {
    connectivityOnline: boolean;
    websocketConnected: boolean;
    triggerCmdStatus: string;
    voiceMode: 'full' | 'degraded' | 'offline';
    automationMode: 'full' | 'degraded';
    reconnectEligible: boolean;
  };
  continuity: {
    lastRoute: string;
    lastView: string;
    activeTaskIds: string[];
    activeAutomationIds: string[];
    lastRecoveredAt: number | null;
  };
  activeTaskCount: number;
  activeAutomationCount: number;
  runtimeSingleInstance: true;
}

export interface EnvironmentSnapshot {
  version: 1;
  ownerId: string;
  runtimeSessionId: string;
  runtimeDeviceId?: string;
  persistedAt: number;
  expiresAt: number;
  checksum: string;
  state: EnvironmentState;
}

export interface EnvironmentVoiceProfileResolution {
  profile: VoiceProfile;
  degraded: boolean;
  reason: string | null;
}
