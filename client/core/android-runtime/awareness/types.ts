export type BatteryStatus = 'unknown' | 'charging' | 'discharging' | 'full' | 'not_charging';
export type NetworkType = 'unknown' | 'wifi' | 'cellular' | 'ethernet' | 'none';
export type BluetoothStatus = 'unknown' | 'on' | 'off' | 'connected' | 'disconnected';
export type PowerSavingStatus = 'unknown' | 'on' | 'off';
export type LocationStatus = 'unknown' | 'available' | 'disabled' | 'denied';

export interface BatteryState {
  level: number; // 0 to 1
  status: BatteryStatus;
  temperature: number; // in celsius, optional
  updatedAt: number;
}

export interface NetworkState {
  type: NetworkType;
  isConnected: boolean;
  isMetered: boolean;
  updatedAt: number;
}

export interface BluetoothState {
  status: BluetoothStatus;
  updatedAt: number;
}

export interface PowerState {
  isPowerSaveMode: boolean;
  isInteractive: boolean;
  updatedAt: number;
}

export interface AudioState {
  volume: number; // 0 to 1
  isMuted: boolean;
  isMusicActive: boolean;
  updatedAt: number;
}

export interface LocationState {
  status: LocationStatus;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  updatedAt: number;
}

export interface PermissionState {
  microphone: 'granted' | 'denied' | 'prompt' | 'unknown';
  notifications: 'granted' | 'denied' | 'prompt' | 'unknown';
  location: 'granted' | 'denied' | 'prompt' | 'unknown';
  camera: 'granted' | 'denied' | 'prompt' | 'unknown';
  updatedAt: number;
}

export interface AndroidAwarenessState {
  battery: BatteryState;
  network: NetworkState;
  bluetooth: BluetoothState;
  power: PowerState;
  audio: AudioState;
  location: LocationState;
  permissions: PermissionState;
  lastUpdated: number;
}

export type AwarenessEventPayload =
  | { type: 'battery'; payload: Partial<BatteryState> }
  | { type: 'network'; payload: Partial<NetworkState> }
  | { type: 'bluetooth'; payload: Partial<BluetoothState> }
  | { type: 'power'; payload: Partial<PowerState> }
  | { type: 'audio'; payload: Partial<AudioState> }
  | { type: 'location'; payload: Partial<LocationState> }
  | { type: 'permissions'; payload: Partial<PermissionState> };
