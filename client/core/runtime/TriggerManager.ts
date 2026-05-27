import { socketManager } from './SocketManager';
import { logger } from '../logger/Logger';
import { apiClient } from '../api/client/ApiClient';
import { runtimeIdentity } from './RuntimeIdentity';

export interface TriggerDevice {
  id: string;
  name: string;
  cmd: string;
  server: string;
  status: string;
  aliases?: string[];
  provider?: string;
  source?: string;
  app?: string;
  category?: string;
}

export interface BridgeUserConfig {
  hasToken: boolean;
  endpoint?: string;
  syncedAt?: number;
  deviceCount?: number;
}

export type BridgeConnectionStatus =
  | 'disconnected'
  | 'connected'
  | 'syncing'
  | 'invalid_token'
  | 'no_token';

class TriggerManager {
  private static instance: TriggerManager;
  private devices: TriggerDevice[] = [];
  private listeners: ((devices: TriggerDevice[]) => void)[] = [];
  private userId: string | null = null;
  private config: BridgeUserConfig | null = null;
  private connectionStatus: BridgeConnectionStatus = 'no_token';
  private statusListeners: ((status: BridgeConnectionStatus) => void)[] = [];
  private listenerRegistered = false;

  private constructor() {}

  public static getInstance(): TriggerManager {
    if (!TriggerManager.instance) {
      TriggerManager.instance = new TriggerManager();
    }
    return TriggerManager.instance;
  }

  public init() {
    this.registerListener();
  }

  private registerListener() {
    if (this.listenerRegistered) return;

    const socket = socketManager.getSocket();
    if (!socket) {
      // Socket not ready yet — init() will retry when INTEGRATIONS phase runs
      logger.info('TRIGGER_MANAGER', 'Socket not available yet, listener registration deferred');
      return;
    }

    this.listenerRegistered = true;
    logger.info('TRIGGER_MANAGER', 'TriggerManager successfully registered listener on socket.');

    socket.on('trigger:devices', (devices: TriggerDevice[]) => {
      logger.info('TRIGGER_HYDRATION', `[Hydration] trigger:devices received. Count in payload: ${devices ? devices.length : 0}`);

      if (!devices || !Array.isArray(devices)) {
        logger.warn('TRIGGER_MANAGER', 'Received invalid trigger devices payload (not an array or null)');
        this.devices = [];
        this.notify();
        return;
      }

      this.devices = devices;
      logger.info('TRIGGER_UI', `[UI] hydrated devices=${this.devices.length}`);
      this.notify();
    });

    // Handle future reconnections
    socket.on('connect', () => {
      logger.info('TRIGGER_SOCKET', `Socket reconnected userId=${this.userId}`);
      if (this.userId) {
        logger.info('TRIGGER_AUTH', 'Socket reconnected — re-authenticating user bridge');
        socket.emit('user:auth', { userId: this.userId });
        logger.info('TRIGGER_SOCKET', `auth emitted userId=${this.userId}`);
      }
    });

    // Handle case where socket is already connected (common case: NETWORK phase before INTEGRATIONS)
    if (socket.connected && this.userId) {
      logger.info('TRIGGER_SOCKET', `Socket already connected — authenticating user bridge userId=${this.userId}`);
      socket.emit('user:auth', { userId: this.userId });
      logger.info('TRIGGER_SOCKET', `auth emitted userId=${this.userId}`);
    }
  }

  // ──────────────── User-Scoped Methods ────────────────

  public setUserId(userId: string | null): void {
    if (!userId) {
      logger.info('AUTH_RUNTIME', 'trigger_runtime_preview_mode=true');
    }

    this.registerListener();

    const socket = socketManager.getSocket();

    if (this.userId && this.userId !== userId) {
      logger.info('TRIGGER_AUTH_FLOW', `resetting bridge state: prev=${this.userId} new=${userId}`);
      socket?.emit('user:logout');
      this.devices = [];
      this.config = null;
      this.connectionStatus = 'no_token';
      this.notify();
      this.notifyStatus();
    }

    const prevUserId = this.userId;
    this.userId = userId;

    logger.info('TRIGGER_SOCKET', `setUserId prev=${prevUserId} new=${userId} socket=${socket ? 'available' : 'null'}`);

    if (userId && socket) {
      socket.emit('user:auth', { userId });
      logger.info('TRIGGER_SOCKET', `auth emitted userId=${userId}`);
      this.loadConfig();
    } else if (userId && !socket) {
      // No persistent socket available (serverless deployment). Fall back
      // to HTTP-based synchronization so the user can still save tokens and
      // sync devices via the API endpoints.
      logger.info('TRIGGER_AUTH', 'Socket not available — using HTTP fallback for TriggerCMD');
      // Attempt to load config via API immediately
      void this.loadConfig();
    } else {
      logger.info('TRIGGER_AUTH_FLOW', `setting null state userId=${userId}`);
      this.config = null;
      this.connectionStatus = 'no_token';
      this.notifyStatus();
    }
  }

  public getUserId(): string | null {
    return this.userId;
  }

  public async loadConfig(): Promise<BridgeUserConfig | null> {
    if (!this.userId || !runtimeIdentity.requiresAuthenticatedRuntime('trigger_load_config')) return null;

    try {
      logger.info('TRIGGER_CONFIG', `loading config userId=${this.userId}`);
      const config = await apiClient.get<BridgeUserConfig & { devices?: TriggerDevice[] }>(`/triggercmd/config?userId=${this.userId}`);
      logger.info('TRIGGER_HYDRATION', `applying hydrated state hasToken=${config.hasToken} endpoint=${config.endpoint || 'none'}`);
      this.config = config;
      this.connectionStatus = config.hasToken ? 'connected' : 'no_token';
      
      if (config.devices && Array.isArray(config.devices)) {
        this.devices = config.devices;
        this.notify();
      }
      
      this.notifyStatus();
      logger.info('TRIGGER_CONFIG', `hydrated config hasToken=${config.hasToken} userId=${this.userId}`);
      return config;
    } catch (err) {
      logger.warn('TRIGGER_CONFIG', `Failed to load user bridge config err=${err}`);
      this.config = null;
      this.connectionStatus = 'disconnected';
      this.notifyStatus();
      return null;
    }
  }

  public async saveConfig(token: string, endpoint?: string): Promise<boolean> {
    if (!this.userId || !runtimeIdentity.requiresPersistentExecution('trigger_save_config')) return false;

    try {
      logger.info('TRIGGER_CONFIG', `saving token userId=${this.userId} token_length=${token.length}`);
      await apiClient.post('/triggercmd/config', {
        userId: this.userId,
        token,
        endpoint
      });

      logger.info('TRIGGER_SAVE', `before_save token_length=${token.length}`);
      this.config = { hasToken: true, endpoint };
      this.connectionStatus = 'connected';
      this.notifyStatus();
      logger.info('TRIGGER_SAVE', `persisted token_exists=true userId=${this.userId}`);
      
      // Auto-sync after saving config to get devices immediately
      void this.syncDevices();
      
      return true;
    } catch (err) {
      logger.error('TRIGGER_CONFIG', `Failed to save user bridge config err=${err}`);
      return false;
    }
  }

  public async syncDevices(): Promise<{
    success: boolean;
    count: number;
    status: string;
    devices?: TriggerDevice[];
  }> {
    if (!this.userId || !runtimeIdentity.requiresExecutionPermission('trigger_sync_devices', this.userId)) {
      return { success: false, count: 0, status: 'no_user' };
    }

    this.connectionStatus = 'syncing';
    this.notifyStatus();

    try {
      const result = await apiClient.post<{
        success: boolean;
        count: number;
        status: string;
        devices?: TriggerDevice[];
      }>('/triggercmd/sync', { userId: this.userId });

      this.connectionStatus = result.success ? 'connected' : 'invalid_token';
      
      if (result.success && result.devices) {
        this.devices = result.devices;
        this.notify();
      }

      this.notifyStatus();

      if (result.success) {
        logger.info('TRIGGER_SYNC', `synced devices=${result.count} userId=${this.userId}`);
      } else {
        logger.warn('TRIGGER_SYNC', `sync failed status=${result.status} userId=${this.userId}`);
      }

      return result;
    } catch {
      this.connectionStatus = 'disconnected';
      this.notifyStatus();
      return { success: false, count: 0, status: 'error' };
    }
  }

  public clearUser(): void {
    logger.info('TRIGGER_AUTH_FLOW', 'clearUser — resetting all bridge state');
    this.userId = null;
    this.config = null;
    this.devices = [];
    this.connectionStatus = 'no_token';
    this.notify();
    this.notifyStatus();
  }

  public getConfig(): BridgeUserConfig | null {
    return this.config;
  }

  public getConnectionStatus(): BridgeConnectionStatus {
    return this.connectionStatus;
  }

  public subscribeStatus(callback: (status: BridgeConnectionStatus) => void) {
    this.statusListeners.push(callback);
    callback(this.connectionStatus);
    return () => {
      this.statusListeners = this.statusListeners.filter(l => l !== callback);
    };
  }

  // ──────────────── Legacy Methods ────────────────

  public subscribe(callback: (devices: TriggerDevice[]) => void) {
    this.listeners.push(callback);
    callback(this.devices);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private notify() {
    this.listeners.forEach(l => l(this.devices));
  }

  private notifyStatus() {
    this.statusListeners.forEach(l => l(this.connectionStatus));
  }

  public execute(deviceId: string): Promise<boolean> {
    if (!runtimeIdentity.requiresExecutionPermission('trigger_execute', this.userId)) {
      logger.warn('AUTH_RUNTIME', `preview_execution_blocked runtime=triggercmd deviceId=${deviceId}`);
      return Promise.resolve(false);
    }

    const socket = socketManager.getSocket();
    if (!socket) {
      logger.info('TRIGGER_RUNTIME', `no_socket_execute — falling back to HTTP execute deviceId=${deviceId} userId=${this.userId}`);
      // Fallback to HTTP endpoint when socket is not available
      if (!this.userId) {
        logger.warn('TRIGGER_RUNTIME', `execute_failed_no_user deviceId=${deviceId}`);
        return Promise.resolve(false);
      }

      try {
        // Lazy import to avoid circular deps in some bundlers
        const { apiClient } = await import('@core/api/client/ApiClient');
        const res = await apiClient.post('/triggercmd/execute', { userId: this.userId, deviceId });
        const success = res && (res.success === true);
        logger.info('TRIGGER_RUNTIME', `http_execute result=${success} deviceId=${deviceId}`);
        return Promise.resolve(Boolean(success));
      } catch (err) {
        logger.warn('TRIGGER_RUNTIME', `http_execute_failed deviceId=${deviceId} err=${err}`);
        return Promise.resolve(false);
      }
    }

    logger.info('VOICE_EXECUTION', `trigger_found=true deviceId=${deviceId} userId=${this.userId || 'none'}`);
    logger.info('VOICE_EXECUTION', `execute_called=true deviceId=${deviceId}`);

    return new Promise((resolve) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        logger.warn('VOICE_EXECUTION', `execution_success=false reason=ack_timeout deviceId=${deviceId}`);
        resolve(false);
      }, 3000);

      socket.emit('trigger:execute', { deviceId }, (ack?: { success?: boolean }) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        const success = Boolean(ack?.success);
        logger.info('VOICE_EXECUTION', `execution_success=${success} deviceId=${deviceId}`);
        resolve(success);
      });
    });
  }

  public getDevices() {
    return this.devices;
  }
}

export const triggerManager = TriggerManager.getInstance();
