export enum CommandStatus {
  PENDING = 'PENDING',
  VALIDATING = 'VALIDATING',
  QUEUED = 'QUEUED',
  EXECUTING = 'EXECUTING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  TIMEOUT = 'TIMEOUT'
}

export enum CommandType {
  GOOGLE_HOME = 'GOOGLE_HOME',
  MQTT = 'MQTT',
  TRIGGER_CMD = 'TRIGGER_CMD',
  SYSTEM = 'SYSTEM'
}

export interface CommandRequest {
  id: string;
  type: CommandType;
  deviceId: string;
  action: string;
  payload?: any;
  priority?: number;
  timestamp: number;
  taskContext?: {
    taskId: string;
    correlationId: string;
    ownerId: string;
  };
}

export interface CommandResponse {
  commandId: string;
  status: CommandStatus;
  message?: string;
  result?: any;
  duration?: number;
}

export interface AuditLogEntry {
  id: string;
  commandId: string;
  type: CommandType;
  deviceId: string;
  action: string;
  status: CommandStatus;
  userEmail: string;
  timestamp: number;
  duration?: number;
  error?: string;
}
