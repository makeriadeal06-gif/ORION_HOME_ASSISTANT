import { socketRuntime } from '@core/socket/SocketRuntime';

export enum SocketState {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  RECONNECTING = 'RECONNECTING',
  FAILED = 'FAILED'
}

class SocketManager {
  private static instance: SocketManager;

  private constructor() {}

  public static getInstance(): SocketManager {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager();
    }
    return SocketManager.instance;
  }

  public connect() {
    socketRuntime.connect();
  }

  public getSocket() {
    return socketRuntime.getSocket();
  }

  public getState(): SocketState {
    const status = socketRuntime.getStatus();
    // Map internal status to legacy state for compatibility
    return status as unknown as SocketState;
  }

  public disconnect() {
    // Standardized disconnect handling is in socketRuntime
  }
}

export const socketManager = SocketManager.getInstance();
