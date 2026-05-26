import { socketManager } from './SocketManager';
import { stateSync } from '@core/state/synchronization/StateSync';
import { logger } from '../logger/Logger';
import { ProductionRecoveryEngine } from '../production/recovery/ProductionRecoveryEngine';
import { socketRuntime } from '@core/socket/SocketRuntime';

export enum MqttState {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DEGRADED = 'DEGRADED',
  RECONNECTING = 'RECONNECTING',
  FAILED = 'FAILED'
}

class MqttManager {
  private static instance: MqttManager;
  private state: MqttState = MqttState.IDLE;
  private initialized = false;
  private listenersAttached = false;
  private reconnectTimer: number | null = null;
  private degradedTimer: number | null = null;
  private reconciliationTimer: number | null = null;
  private watchdogTimer: number | null = null;
  private reconnectCooldown = 2000;
  private readonly maxCooldown = 30000;
  private readonly reconnectGraceMs = 4500;
  private readonly degradedDebounceMs = 2500;
  private readonly reconciliationDelayMs = 1200;
  private readonly staleReconnectThresholdMs = 12000;
  private readonly recoveryValidationWindowMs = 45000;
  private lastReconnectAttempt = 0;
  private lastConnectedAt = 0;
  private lastDisconnectedAt = 0;
  private lastStatusChangeAt = 0;
  private lastVisibilityChangeAt = 0;
  private lastMqttHeartbeatAt = 0;
  private lastPacketFlowAt = 0;
  private lastTelemetryAt = 0;
  private lastRecoveryStartedAt = 0;
  private lastRecoveryCompletedAt = 0;
  private subscriptionCount = 0;
  private staleWatchdogHits = 0;
  private recoveryFlags = {
    socketHealthy: false,
    heartbeatHealthy: false,
    subscriptionsHealthy: false,
    mqttSessionHealthy: false,
    bridgeHealthy: false,
    telemetryHealthy: false,
    packetFlowHealthy: false,
    meshHealthy: false,
  };

  private constructor() {}

  public static getInstance(): MqttManager {
    if (!MqttManager.instance) {
      MqttManager.instance = new MqttManager();
    }
    return MqttManager.instance;
  }

  public connect() {
    this.attachRuntimeListeners();

    const now = Date.now();
    if (now - this.lastReconnectAttempt < this.reconnectCooldown) {
      logger.info('MQTT_RECOVERY', `reconnect_suppressed cooldown_ms=${Math.round(this.reconnectCooldown - (now - this.lastReconnectAttempt))}`);
      return; // Wait for the scheduled retry
    }

    this.lastReconnectAttempt = now;
    this.lastRecoveryStartedAt = now;
    logger.info('MQTT_RECOVERY', `connect_requested state=${this.state}`);
    
    const socket = socketManager.getSocket();
    if (!socket) {
      // Exponential backoff for recovery
      this.reconnectCooldown = Math.min(this.reconnectCooldown * 1.5, this.maxCooldown);
      this.transitionState(MqttState.RECONNECTING, 'socket_unavailable');
      logger.warn('MQTT_RECOVERY', `socket_unavailable backoff_ms=${Math.round(this.reconnectCooldown)}`);
      this.scheduleReconnect('socket_unavailable', this.reconnectCooldown);
      return;
    }

    this.setupListeners(socket);
    this.initialized = true;
    this.reconnectCooldown = 2000; // Reset on success
    this.startWatchdog();
    this.reconcileHealth('connect_success');
  }

  private setupListeners(socket: any) {
    if (this.listenersAttached) {
      return;
    }
    this.listenersAttached = true;

    socket.on('mqtt:status', (data: { connected: boolean; subscriptionsHealthy?: boolean; subscriptionCount?: number; lastPacketAt?: number; heartbeatAt?: number; meshState?: string }) => {
      this.applyStatusSnapshot(data, 'status_event');
      if (data.connected) {
        this.handleConnectedStatus('status_event');
      } else {
        this.handleDisconnectedStatus('status_event');
      }
    });

    socket.on('mqtt:telemetry', (data: { type: string; connected: boolean; subscriptionsHealthy?: boolean; subscriptionCount?: number; lastPacketAt?: number; heartbeatAt?: number; meshState?: string; topic?: string }) => {
      this.lastTelemetryAt = Date.now();
      this.recoveryFlags.telemetryHealthy = true;
      if (typeof data.heartbeatAt === 'number') {
        this.lastMqttHeartbeatAt = Math.max(this.lastMqttHeartbeatAt, data.heartbeatAt);
      }
      if (typeof data.lastPacketAt === 'number' && data.lastPacketAt > 0) {
        this.lastPacketFlowAt = Math.max(this.lastPacketFlowAt, data.lastPacketAt);
        this.recoveryFlags.packetFlowHealthy = true;
      }
      this.staleWatchdogHits = 0;
      this.applyStatusSnapshot(data, `telemetry:${data.type}`);
      logger.info('MQTT_TELEMETRY', `type=${data.type} mesh_state=${data.meshState || 'unknown'} subscriptions=${data.subscriptionCount || 0}`);
      if (data.type === 'heartbeat') {
        logger.info('MQTT_HEARTBEAT', `active=true last_heartbeat_age_ms=${Date.now() - this.lastMqttHeartbeatAt}`);
      }
      if (data.type === 'packet_flow') {
        logger.info('MQTT_PACKET_FLOW', `topic=${data.topic || 'unknown'} packet_age_ms=${Date.now() - this.lastPacketFlowAt}`);
      }
      if (data.type === 'subscriptions_restored') {
        logger.info('MQTT_SUBSCRIPTIONS', `restored=true count=${this.subscriptionCount}`);
      }
      this.reconcileHealth(`telemetry:${data.type}`);
    });

    socket.on('mqtt:message', ({ topic, payload }: { topic: string, payload: string }) => {
      // Trace-only reporting for data packets to keep log clean
      logger.trace('MQTT', `Payload_Ingress: ${topic}`);
      this.lastMqttHeartbeatAt = Date.now();
      this.lastTelemetryAt = this.lastMqttHeartbeatAt;
      this.lastPacketFlowAt = this.lastMqttHeartbeatAt;
      this.recoveryFlags.heartbeatHealthy = true;
      this.recoveryFlags.mqttSessionHealthy = true;
      this.recoveryFlags.bridgeHealthy = true;
      this.recoveryFlags.packetFlowHealthy = true;
      this.recoveryFlags.telemetryHealthy = true;
      this.staleWatchdogHits = 0;
      stateSync.trackEvent();
      logger.info('MQTT_PACKET_FLOW', `topic=${topic} payload_size=${payload.length}`);
      this.reconcileHealth('message_ingress');
    });
  }

  private applyStatusSnapshot(data: { subscriptionsHealthy?: boolean; subscriptionCount?: number; lastPacketAt?: number; heartbeatAt?: number; meshState?: string }, reason: string) {
    if (typeof data.subscriptionCount === 'number') {
      this.subscriptionCount = data.subscriptionCount;
    }
    if (typeof data.subscriptionsHealthy === 'boolean') {
      this.recoveryFlags.subscriptionsHealthy = data.subscriptionsHealthy;
    }
    if (typeof data.heartbeatAt === 'number' && data.heartbeatAt > 0) {
      this.lastMqttHeartbeatAt = Math.max(this.lastMqttHeartbeatAt, data.heartbeatAt);
      this.recoveryFlags.heartbeatHealthy = true;
    }
    if (typeof data.lastPacketAt === 'number' && data.lastPacketAt > 0) {
      this.lastPacketFlowAt = Math.max(this.lastPacketFlowAt, data.lastPacketAt);
      this.recoveryFlags.packetFlowHealthy = true;
    }
    if (typeof data.meshState === 'string') {
      this.recoveryFlags.meshHealthy = data.meshState === 'ACTIVE';
      logger.info('MQTT_MESH_STATE', `state=${data.meshState} reason=${reason}`);
    }
  }

  private startWatchdog() {
    if (this.watchdogTimer) {
      return;
    }
    this.watchdogTimer = window.setInterval(() => {
      const heartbeatAge = this.lastMqttHeartbeatAt ? Date.now() - this.lastMqttHeartbeatAt : -1;
      const telemetryAge = this.lastTelemetryAt ? Date.now() - this.lastTelemetryAt : -1;
      logger.info('MQTT_WATCHDOG', `state=${this.state} heartbeat_age_ms=${heartbeatAge} telemetry_age_ms=${telemetryAge} subs=${this.subscriptionCount} stale_hits=${this.staleWatchdogHits}`);
      if (this.state === MqttState.CONNECTED && this.lastTelemetryAt > 0 && telemetryAge > this.recoveryValidationWindowMs) {
        this.staleWatchdogHits += 1;
        this.transitionState(MqttState.DEGRADED, 'telemetry_watchdog_stale');
        this.syncHealth(false);
        if (this.staleWatchdogHits >= 3 && !this.isSocketHealthy()) {
          this.scheduleReconnect('telemetry_watchdog_stale', this.reconnectCooldown);
        }
        return;
      }

      if (this.state === MqttState.DEGRADED && telemetryAge >= 0 && telemetryAge <= this.recoveryValidationWindowMs) {
        this.staleWatchdogHits = 0;
        this.reconcileHealth('watchdog_recovered');
      }
    }, 10000);
  }

  private attachRuntimeListeners() {
    if (typeof document === 'undefined' || this.initialized) {
      return;
    }

    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private handleVisibilityChange = () => {
    this.lastVisibilityChangeAt = Date.now();
    const visibility = document.visibilityState;
    logger.info('SOCKET_STABILITY', `visibility_change state=${visibility} mqtt_state=${this.state}`);

    if (visibility !== 'visible') {
      return;
    }

    window.clearTimeout(this.reconciliationTimer ?? undefined);
    this.reconciliationTimer = window.setTimeout(() => {
      this.reconciliationTimer = null;
      this.reconcileOrReconnect('visibility_resume');
    }, this.reconnectGraceMs);
  };

  private handleConnectedStatus(reason: string) {
    window.clearTimeout(this.degradedTimer ?? undefined);
    this.degradedTimer = null;
    this.staleWatchdogHits = 0;
    this.lastConnectedAt = Date.now();
    this.lastMqttHeartbeatAt = this.lastConnectedAt;
    this.recoveryFlags.mqttSessionHealthy = true;
    this.recoveryFlags.bridgeHealthy = true;
    this.throttledPing();
    this.reconcileHealth(reason);
  }

  private handleDisconnectedStatus(reason: string) {
    this.lastDisconnectedAt = Date.now();
    this.recoveryFlags.mqttSessionHealthy = false;
    this.recoveryFlags.bridgeHealthy = false;
    this.recoveryFlags.telemetryHealthy = false;
    this.recoveryFlags.meshHealthy = false;
    if (this.degradedTimer) {
      logger.info('DEGRADED_RUNTIME', `degraded_pending reason=${reason}`);
      return;
    }
    logger.warn('DEGRADED_RUNTIME', `degraded_debounce_started reason=${reason} debounce_ms=${this.degradedDebounceMs}`);
    this.degradedTimer = window.setTimeout(() => {
      this.degradedTimer = null;
      const socketHealthy = this.isSocketHealthy();
      if (socketHealthy && Date.now() - this.lastConnectedAt < this.recoveryValidationWindowMs) {
        logger.info('MQTT_RECONCILIATION', `degraded_cleared_before_transition reason=${reason}`);
        this.reconcileHealth('degraded_preempted');
        return;
      }
      this.transitionState(MqttState.DEGRADED, reason);
      this.syncHealth(false);
      if (this.shouldEscalateReconnect(reason)) {
        this.scheduleReconnect('degraded_state', this.reconnectCooldown);
      } else {
        logger.info('MQTT_RECOVERY', `reconnect_deferred reason=${reason} state=${this.state}`);
      }
    }, this.degradedDebounceMs);
  }

  private reconcileOrReconnect(reason: string) {
    const socketHealthy = this.isSocketHealthy();
    const mqttFresh = this.isMqttFresh();
    logger.info('MQTT_WATCHDOG', `reconnect_gate reason=${reason} socket_healthy=${String(socketHealthy)} mqtt_fresh=${String(mqttFresh)} telemetry_healthy=${String(this.recoveryFlags.telemetryHealthy)} state=${this.state}`);
    if (socketHealthy && mqttFresh) {
      this.reconcileHealth(reason);
      return;
    }

    const now = Date.now();
    const staleFor = Math.max(now - this.lastConnectedAt, now - this.lastMqttHeartbeatAt);
    if (staleFor < this.staleReconnectThresholdMs) {
      logger.info('MQTT_RECOVERY', `stale_reconnect_suppressed reason=${reason} stale_ms=${staleFor}`);
      return;
    }

    this.scheduleReconnect(reason, this.reconnectCooldown);
  }

  private reconcileHealth(reason: string) {
    this.recoveryFlags.socketHealthy = this.isSocketHealthy();
    this.recoveryFlags.heartbeatHealthy = this.isHeartbeatHealthy();
    this.recoveryFlags.subscriptionsHealthy = this.recoveryFlags.subscriptionsHealthy && this.subscriptionCount > 0;
    this.recoveryFlags.mqttSessionHealthy = this.recoveryFlags.mqttSessionHealthy || this.state === MqttState.CONNECTED;
    this.recoveryFlags.bridgeHealthy = this.recoveryFlags.bridgeHealthy || this.recoveryFlags.socketHealthy;
    this.recoveryFlags.telemetryHealthy = this.isTelemetryHealthy();
    this.recoveryFlags.meshHealthy = this.recoveryFlags.meshHealthy || (this.recoveryFlags.socketHealthy && this.recoveryFlags.subscriptionsHealthy && this.recoveryFlags.telemetryHealthy);

    logger.info(
      'RECOVERY_COMPLETION',
      `reason=${reason} socket=${String(this.recoveryFlags.socketHealthy)} heartbeat=${String(this.recoveryFlags.heartbeatHealthy)} subscriptions=${String(this.recoveryFlags.subscriptionsHealthy)} mqtt_session=${String(this.recoveryFlags.mqttSessionHealthy)} telemetry=${String(this.recoveryFlags.telemetryHealthy)} mesh=${String(this.recoveryFlags.meshHealthy)} bridge=${String(this.recoveryFlags.bridgeHealthy)}`,
    );

    if (!this.recoveryFlags.socketHealthy || !this.recoveryFlags.heartbeatHealthy || !this.recoveryFlags.subscriptionsHealthy || !this.recoveryFlags.mqttSessionHealthy || !this.recoveryFlags.telemetryHealthy || !this.recoveryFlags.meshHealthy || !this.recoveryFlags.bridgeHealthy) {
      logger.info('MQTT_RECONCILIATION', `recovery_incomplete reason=${reason}`);
      return;
    }

    this.lastRecoveryCompletedAt = Date.now();
    this.transitionState(MqttState.CONNECTED, `reconciled:${reason}`);
    this.syncHealth(true);
    ProductionRecoveryEngine.ping('MQTT_LAYER');
    logger.info('BRIDGE_ACTIVE', `mqtt_active reason=${reason} recovery_ms=${this.lastRecoveryCompletedAt - this.lastRecoveryStartedAt}`);
  }

  private isSocketHealthy() {
    const metrics = socketRuntime.getHealthMetrics();
    const healthy = metrics.connected && (Date.now() - metrics.lastConnectedAt < this.recoveryValidationWindowMs || metrics.lastHeartbeat > 0);
    logger.info('SOCKET_STABILITY', `connected=${String(metrics.connected)} status=${metrics.status} reconnects=${metrics.reconnectCount}`);
    return healthy;
  }

  private isHeartbeatHealthy() {
    const metrics = socketRuntime.getHealthMetrics();
    const lastSignalAt = Math.max(metrics.lastHeartbeat || 0, this.lastMqttHeartbeatAt || 0, this.lastConnectedAt || 0);
    const healthy = lastSignalAt > 0 && Date.now() - lastSignalAt < this.recoveryValidationWindowMs;
    logger.info('HEARTBEAT_RUNTIME', `healthy=${String(healthy)} last_signal_ms=${lastSignalAt ? Date.now() - lastSignalAt : -1}`);
    return healthy;
  }

  private isTelemetryHealthy() {
    const lastSignalAt = Math.max(this.lastTelemetryAt || 0, this.lastMqttHeartbeatAt || 0, this.lastPacketFlowAt || 0);
    const healthy = lastSignalAt > 0 && Date.now() - lastSignalAt < this.recoveryValidationWindowMs;
    logger.info('MQTT_TELEMETRY', `healthy=${String(healthy)} last_signal_ms=${lastSignalAt ? Date.now() - lastSignalAt : -1}`);
    return healthy;
  }

  private isMqttFresh() {
    return this.lastConnectedAt > 0 && Date.now() - this.lastConnectedAt < this.recoveryValidationWindowMs;
  }

  private shouldEscalateReconnect(reason: string) {
    if (reason === 'telemetry_watchdog_stale' || reason === 'visibility_resume') {
      return false;
    }

    if (this.isSocketHealthy()) {
      return false;
    }

    return true;
  }

  private scheduleReconnect(reason: string, delayMs: number) {
    if (this.reconnectTimer) {
      logger.info('MQTT_RECOVERY', `reconnect_loop_suppressed reason=${reason}`);
      return;
    }

    this.transitionState(MqttState.RECONNECTING, `scheduled:${reason}`);
    logger.warn('SOCKET_RECOVERY', `mqtt_reconnect_scheduled reason=${reason} delay_ms=${delayMs}`);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delayMs);
  }

  private transitionState(nextState: MqttState, reason: string) {
    if (this.state === nextState) {
      logger.info('MQTT_STATE_TRANSITION', `state_unchanged state=${nextState} reason=${reason}`);
      return;
    }
    const previous = this.state;
    this.state = nextState;
    this.lastStatusChangeAt = Date.now();
    logger.info('MQTT_STATE_TRANSITION', `from=${previous} to=${nextState} reason=${reason}`);
  }

  private lastPingTime = 0;
  private throttledPing() {
    const now = Date.now();
    if (now - this.lastPingTime > 30000) {
      ProductionRecoveryEngine.ping('MQTT_LAYER');
      this.lastPingTime = now;
      this.lastMqttHeartbeatAt = now;
      logger.info('MQTT_HEARTBEAT', `heartbeat_pulse state=${this.state}`);
    }
  }

  private syncHealth(connected: boolean) {
    logger.info('MQTT_HEALTH', `sync connected=${String(connected)} state=${this.state} reconnect_attempts=${this.lastReconnectAttempt > 0 ? 1 : 0}`);
    stateSync.updateMqttHealth({
      connected,
      mqttMode: 'REALTIME',
      mqttRecoveryState: connected ? 'STABLE' : (this.state === MqttState.FAILED ? 'FAILED' : this.state === MqttState.RECONNECTING ? 'RECOVERING' : 'UNSTABLE'),
      reconnectAttempts: Math.max(0, socketRuntime.getHealthMetrics().reconnectCount),
      circuitBreakerState: 'CLOSED'
    });
  }

  public publish(topic: string, message: any) {
    const socket = socketManager.getSocket();
    if (socket) {
      const msg = typeof message === 'string' ? message : JSON.stringify(message);
      socket.emit('mqtt:publish', { topic, message: msg });
    }
  }

  public disconnect() {
    // Backend handles real disconnect
    this.transitionState(MqttState.IDLE, 'manual_disconnect');
    this.syncHealth(false);
  }

  public getState() {
    return this.state;
  }
}

export const mqttManager = MqttManager.getInstance();
