export enum VoiceState {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING',
  PROCESSING = 'PROCESSING',
  SPEAKING = 'SPEAKING',
  INTERRUPTED = 'INTERRUPTED',
  MUTED = 'MUTED'
}

export interface VoiceProfile {
  id: string;
  name: string;
  pitch: number;
  rate: number;
  provider: 'browser' | 'android' | 'elevenlabs' | 'whisper';
}

export type VoiceProvider = VoiceProfile['provider'];

export type VoiceRecoveryState =
  | 'stable'
  | 'temporary_browser_fallback'
  | 'recovering_provider'
  | 'provider_error'
  | 'auth_transition_hold';

export interface VoiceAuthorityState {
  ownerId: string | null;
  runtimeSessionId: string;
  runtimeDeviceId: string;
  activeVoiceProvider: VoiceProvider;
  preferredVoiceProvider: VoiceProvider;
  lastStableVoiceProvider: VoiceProvider;
  activeVoiceProfileId: string;
  activeVoiceId: string;
  providerLocked: boolean;
  lockedProvider: VoiceProvider | null;
  lockedVoiceId: string | null;
  lockedProfileId: string | null;
  lockedAt: number | null;
  lockReason: string | null;
  providerRecoveryState: VoiceRecoveryState;
  providerFailureReason: string | null;
  temporaryFallbackLease: boolean;
  fallbackLeaseStartedAt: number | null;
  fallbackLeaseTTL: number | null;
  fallbackLeaseReason: string | null;
  fallbackLeaseReleasedAt: number | null;
  restoringProvider: VoiceProvider | null;
  recoveredProvider: VoiceProvider | null;
  providerRecoveredAt: number | null;
  speechRate: number;
  pacing: string;
  naturalizationConfig: string;
  latencyProfile: string;
  streamMode: string;
  startupBufferMs: number;
  stability: number;
  similarityBoost: number;
  style: number;
  speakerBoost: boolean;
  optimizeStreamingLatency: number;
  modelId: string;
  outputFormat: string;
  updatedAt: number;
  lastStableAt: number;
  lastFailureAt: number | null;
}

export interface SpeechSession {
  id: string;
  text: string;
  status: 'PENDING' | 'PLAYING' | 'COMPLETED' | 'ABORTED';
  abortController: AbortController;
  createdAt: number;
}

export interface TTSRequestMetadata {
  sessionId: string;
  requestId: string;
  intentId?: string;
  onResponseReady?: (timestamp: number) => void;
  onFirstAudioByte?: (timestamp: number) => void;
  onPlaybackStart?: (timestamp: number) => void;
}

export interface ISTTAdapter {
  isListening: boolean;
  startListening(onSpeechDetected: (text: string) => void, onError: (err: any) => void): void;
  stopListening(): void;
  pauseListening(): void;
  resumeListening(): void;
}

export interface ITTSAdapter {
  isSpeaking: boolean;
  speak(
    text: string,
    profile: VoiceProfile,
    onEnd: () => void,
    onError: (err: any) => void,
    metadata?: TTSRequestMetadata
  ): void;
  stopSpeaking(): void;
}
