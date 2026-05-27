import { io, Socket } from 'socket.io-client';
import { logger } from '../logger/Logger';
import { SocketHealthMetrics, SocketStatus } from './SocketLifecycle';
import { ProductionRecoveryEngine } from '../production/recovery/ProductionRecoveryEngine';

class SocketRuntime {
  private static instance: SocketRuntime;
  private socket: Socket | null = null;
  private status: SocketStatus = SocketStatus.INITIALIZING;
  private reconnectAttempts = 0;
  private lastConnectedAt = 0;
  private lastDisconnectedAt = 0;
  private lastHeartbeatAt = 0;

  private constructor() {}

  public static getInstance(): SocketRuntime {
    if (!SocketRuntime.instance) {
      SocketRuntime.instance = new SocketRuntime();
    }
    return SocketRuntime.instance;
  }

  public connect() {
    if (this.socket) {
      if (!this.socket.connected) {
        this.status = SocketStatus.RECONNECTING;
        logger.info('SOCKET_RUNTIME', 'Reconnecting existing persistent transport...');
        this.socket.connect();
      }
      return;
    }

    this.status = SocketStatus.CONNECTING;
    logger.info('SOCKET_RUNTIME', 'Initializing persistent transport...');
    // If running as a Vercel-deployed static/frontend site there is no
    // persistent socket endpoint available (Vercel serverless does not
    // support long-lived WebSocket servers). In that environment we must
    // avoid attempting to create a socket.io connection — doing so emits
    // noisy wss:// errors in the browser console and may block the
    // runtime boot sequence waiting for NETWORK readiness.
    // import.meta.env.VERCEL is defined at build time by Vite when
    // deploying to Vercel; if present, skip socket creation and let
    // higher-level managers fall back to HTTP-based synchronization.
    // Detect Vercel / serverless deployments: prefer explicit compile-time flag
    // (import.meta.env.VERCEL) when available, but also detect known Vercel
    // hostnames at runtime (e.g. orion-home-assistant.vercel.app). If running
    // on Vercel we must not attempt persistent WebSocket connections.
    const envVercel = (import.meta as any)?.env?.VERCEL;
    const hostIsVercel = typeof window !== 'undefined' && window.location && typeof window.location.hostname === 'string' && window.location.hostname.endsWith('.vercel.app');
    if (envVercel || hostIsVercel) {
      this.status = SocketStatus.FAILED;
      logger.info('SOCKET_RUNTIME', 'Persistent WebSocket transport disabled in Vercel/serverless environment — skipping socket creation.');
      return;
    }

    logger.info('SOCKET_RUNTIME', `Connection config: url=${window.location.origin} path=/socket.io transport=websocket API=ready`);

    this.socket = io(window.location.origin, {
      transports: ['websocket'], // Use websocket directly to avoid upgrade 'transport close' warnings
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.5,
      timeout: 20000,
      autoConnect: true,
      forceNew: true
    });

    this.setupListeners();
  }

  private setupListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.status = SocketStatus.CONNECTED;
      this.reconnectAttempts = 0;
      this.lastConnectedAt = Date.now();
      this.throttledPing();
      this.emitRuntimeContext('socket_connected');
      const transport = this.socket?.io.engine.transport.name;
      logger.info('SOCKET', `Transport_Established: ${transport} | Status: CONNECTED`);
    });

    this.socket.on('disconnect', (reason) => {
      this.status = SocketStatus.DISCONNECTED;
      this.lastDisconnectedAt = Date.now();
      this.emitRuntimeContext('socket_disconnected', { reason });
      logger.warn('SOCKET', `Session_Suspended. Status: DISCONNECTED | Reason: ${reason}`);
    });

    this.socket.on('connect_error', (error) => {
      this.status = SocketStatus.ERROR;
      this.lastDisconnectedAt = Date.now();
      this.reconnectAttempts++;
      if (this.reconnectAttempts % 10 === 0) {
        logger.error('SOCKET_RUNTIME', `Transport_Link_Fail_Persistent: ${error.message}`);
      }
    });

    // Handle transport upgrade
    this.socket.io.engine.on('upgrade', (transport) => {
      logger.info('SOCKET', `Transport_Upgraded: ${transport.name}`);
    });
  }

  private lastPingTime = 0;
  private throttledPing() {
    const now = Date.now();
    if (now - this.lastPingTime > 30000) {
      ProductionRecoveryEngine.ping('SOCKET_LAYER');
      this.lastPingTime = now;
      this.lastHeartbeatAt = now;
    }
  }

  public getSocket(): Socket | null {
    return this.socket;
  }

  public getStatus(): SocketStatus {
    return this.status;
  }

  public emit(event: string, data: any) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
      this.throttledPing();
    } else {
      logger.warn('SOCKET', `Attempted to emit ${event} while disconnected`);
    }
  }

  public on(event: string, callback: (...args: any[]) => void) {
    this.socket?.on(event, callback);
    return () => {
      this.socket?.off(event, callback);
    };
  }

  public reconnect(reason = 'manual_reconnect') {
    logger.info('SOCKET_RECOVERY', `reconnect_requested reason=${reason} hasSocket=${Boolean(this.socket)}`);
    this.connect();
  }

  public resetStaleConnection(reason = 'stale_cleanup') {
    logger.warn('SOCKET_RECOVERY', `reset_requested reason=${reason} hasSocket=${Boolean(this.socket)}`);
    if (this.socket) {
      this.status = SocketStatus.RECONNECTING;
      this.socket.disconnect();
      this.socket.connect();
      return;
    }

    this.status = SocketStatus.INITIALIZING;
    this.connect();
  }

  public getHealthMetrics(): SocketHealthMetrics & {
    connected: boolean;
    status: SocketStatus;
    lastConnectedAt: number;
    lastDisconnectedAt: number;
  } {
    return {
      latency: 0,
      lastHeartbeat: this.lastHeartbeatAt,
      reconnectCount: this.reconnectAttempts,
      transport: this.socket?.io.engine.transport.name || 'none',
      connected: Boolean(this.socket?.connected),
      status: this.status,
      lastConnectedAt: this.lastConnectedAt,
      lastDisconnectedAt: this.lastDisconnectedAt,
    };
  }

  private emitRuntimeContext(action: string, payload?: Record<string, unknown>) {
    window.dispatchEvent(new CustomEvent('orion:runtime-context', {
      detail: {
        type: 'socket',
        action,
        payload,
      },
    }));
  }
}

export const socketRuntime = SocketRuntime.getInstance();
