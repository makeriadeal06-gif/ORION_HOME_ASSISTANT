export enum NodeMode {
  PRIMARY = 'PRIMARY',
  SECONDARY = 'SECONDARY',
  PASSIVE = 'PASSIVE',
  BACKGROUND = 'BACKGROUND',
  RECOVERING = 'RECOVERING',
  OFFLINE = 'OFFLINE'
}

export enum NodeType {
  DESKTOP = 'DESKTOP',
  MOBILE = 'MOBILE',
  TABLET = 'TABLET',
  EDGE = 'EDGE'
}

export interface NodeInfo {
  id: string;
  type: NodeType;
  mode: NodeMode;
  lastSeen: number;
  isPrimary: boolean;
  userAgent: string;
}

export interface ConnectivityStatus {
  online: boolean;
  latency: number;
  quality: 'EXCELLENT' | 'GOOD' | 'DEGRADED' | 'DISCONNECTED';
  lastChange: number;
}
