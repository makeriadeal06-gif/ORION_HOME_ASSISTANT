export type AndroidLifecycleState = 'BOOTING' | 'ACTIVE' | 'BACKGROUND' | 'SUSPENDED' | 'RECOVERING';

export type AndroidPermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';

export type AndroidExecutionCommand = 'push_to_talk_start' | 'push_to_talk_stop' | 'interrupt';

export interface AndroidRuntimeSnapshot {
  version: 1;
  updatedAt: number;
  bootId: string;
  ownerId: string;
  runtimeSessionId: string;
  runtimeDeviceId: string;
  platform: 'android' | 'web';
  lifecycle: AndroidLifecycleState;
  route: string;
  foregroundServiceActive: boolean;
  permissions: {
    microphone: AndroidPermissionState;
    notifications: AndroidPermissionState;
  };
  continuity: {
    lastActiveAt: number;
    lastRecoveryAt: number | null;
    executionState: 'idle' | 'listening' | 'processing' | 'speaking';
  };
}

export interface AndroidBridgeEvent {
  type: 'lifecycle' | 'permission' | 'execution' | 'service' | 'state' | 'audio' | 'connectivity';
  action: string;
  payload?: Record<string, unknown>;
}

export interface AndroidRuntimeHealthSnapshot {
  updatedAt: number;
  runtimeHealthy: boolean;
  degradedReason: string | null;
  checks: {
    sttFrozen: boolean;
    playbackStuck: boolean;
    executionStuck: boolean;
    socketDead: boolean;
    ttsUnresponsive: boolean;
    hydrationIncomplete: boolean;
    recoveryIncomplete: boolean;
  };
}

export interface AndroidForegroundServicePayload {
  active: boolean;
  lifecycle: AndroidLifecycleState;
  route: string;
}

export interface AndroidNativeBridge {
  isAvailable?: () => boolean;
  startForegroundService?: (payload: AndroidForegroundServicePayload) => Promise<void> | void;
  stopForegroundService?: () => Promise<void> | void;
  updateRuntimeState?: (snapshot: AndroidRuntimeSnapshot) => Promise<void> | void;
  getPermissionState?: (permission: 'microphone' | 'notifications') => Promise<AndroidPermissionState> | AndroidPermissionState;
  dispatchEvent?: (event: AndroidBridgeEvent) => Promise<void> | void;
}

declare global {
  interface Window {
    AndroidOrionBridge?: AndroidNativeBridge;
    __ORION_ANDROID_DISPATCH__?: (event: AndroidBridgeEvent) => void;
  }
}
