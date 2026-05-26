export const SocketEvents = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  ERROR: 'connect_error',
  METRICS: 'system:metrics',
  MQTT_PUBLISH: 'mqtt:publish',
  MQTT_STATUS: 'mqtt:status',
  TRIGGER_DEVICES: 'trigger:devices',
  TRIGGER_EXECUTE: 'trigger:execute',
  DEVICE_ONLINE: 'device:online',
  DEVICE_OFFLINE: 'device:offline',
  DEVICE_UPDATED: 'device:updated',
  DEVICE_ACTIVE: 'device:active',
  DEVICE_IDLE: 'device:idle',
  DEVICE_SYNCED: 'device:synced',
  COMMAND_INITIATED: 'command:initiated'
} as const;
