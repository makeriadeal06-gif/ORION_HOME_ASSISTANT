export enum CognitiveState {
  IDLE = 'IDLE',
  OBSERVING = 'OBSERVING',
  THINKING = 'THINKING',
  RESPONDING = 'RESPONDING',
  EXECUTING = 'EXECUTING',
  RECOVERING = 'RECOVERING'
}

export interface CognitiveContext {
  activeDevicesCount: number;
  runtimeStatus: string;
  socketStatus: string;
  mqttStatus: string;
  availableTriggersCount: number;
  recentActivity: string;
  lastCommand: string | null;
  isUserAuthenticated: boolean;
  
  // Legacy context fields kept for backward compatibility if needed
  dominantRoom?: string;
  activeProfile?: string;
  loadLevel: number;
  lastEvent: string;
  isHomeOccupied: boolean;
  timeContext: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'NIGHT';

  // Extended, lightweight contextual awareness (volatile / presentation-safe)
  playbackActive?: boolean; // media playing on-device or on-page
  mediaSessionState?: 'playing' | 'paused' | 'none' | null; // navigator.mediaSession state
  lastMediaSource?: string | null; // best-effort media source/title
  focusActive?: boolean; // local focus / do-not-disturb style inference
  fullscreenApp?: string | null; // if a fullscreen element is present, approximate route
  foregroundApp?: string; // current foreground route/path
  behaviorMode?: 'AMBIENT' | 'FOCUS' | 'MEDIA_ACTIVE' | 'NIGHT' | 'IDLE' | 'AUTO';
}

export interface CognitiveMemory {
  lastDeviceId: string | null;
  lastTriggerId: string | null;
  shortHistory: string[];
  recentContextSnapshot: CognitiveContext | null;
  lastIntentId: string | null;
}

export interface CognitiveIntent {
  id: string;
  type: 'COMMAND' | 'QUERY' | 'SYSTEM';
  payload: any;
  timestamp: number;
  status: 'RECEIVED' | 'VALIDATING' | 'DECIDING' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'REJECTED' | 'CANCELLED';
  source?: string;
}

export interface CognitiveToken {
  id: string;
  isCancelled: boolean;
  cancel: () => void;
}

export interface CognitiveSuggestion {
  id: string;
  type: 'ACTION' | 'SCENE' | 'ROUTINE';
  title: string;
  description: string;
  confidence: number;
  action: {
    type: string;
    deviceId: string;
    payload: any;
  };
  timestamp: number;
}

export interface BehaviorPattern {
  id: string;
  trigger: string;
  observationCount: number;
  probability: number;
}
