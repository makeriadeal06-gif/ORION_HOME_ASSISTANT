export enum DeviceActivityStatus {
  IDLE = 'IDLE',
  ACTIVE = 'ACTIVE',
  BUSY = 'BUSY',
  SLEEPING = 'SLEEPING',
  UNKNOWN = 'UNKNOWN'
}

export enum DeviceConnectionStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  CONNECTING = 'CONNECTING'
}

export const DeviceEvents = {
  DEVICE_ONLINE: 'device:online',
  DEVICE_OFFLINE: 'device:offline',
  DEVICE_UPDATED: 'device:updated',
  DEVICE_ACTIVE: 'device:active',
  DEVICE_IDLE: 'device:idle',
  DEVICE_SYNCED: 'device:synced'
} as const;
