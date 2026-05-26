import { DeviceConnectionStatus, DeviceActivityStatus } from '../device-runtime/lifecycle/DeviceLifecycle';

export enum DeviceType {
  LIGHT = 'LIGHT',
  OUTLET = 'OUTLET',
  SWITCH = 'SWITCH',
  THERMOSTAT = 'THERMOSTAT',
  SPEAKER = 'SPEAKER',
  TV = 'TV',
  SENSOR = 'SENSOR',
  CONSOLE = 'CONSOLE',
  PC = 'PC',
  UNKNOWN = 'UNKNOWN'
}

export interface DeviceTrait {
  name: string;
  value: any;
  updatedAt: number;
}

export interface OrionDevice {
  id: string;
  name: string;
  type: DeviceType;
  room?: string;
  traits: Record<string, DeviceTrait>;
  status: DeviceConnectionStatus;
  activity: DeviceActivityStatus;
  lastSeen: number;
  metadata: {
    manufacturer?: string;
    model?: string;
    hwVersion?: string;
    swVersion?: string;
  };
}

export interface EcosystemRoom {
  id: string;
  name: string;
  devices: string[]; // Array of Device IDs
}

export interface EcosystemMap {
  rooms: Record<string, EcosystemRoom>;
  unassigned: string[];
}
