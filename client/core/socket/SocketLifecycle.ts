export enum SocketStatus {
  INITIALIZING = 'INITIALIZING',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  RECONNECTING = 'RECONNECTING',
  ERROR = 'ERROR'
}

export interface SocketHealthMetrics {
  latency: number;
  lastHeartbeat: number;
  reconnectCount: number;
  transport: string;
}
