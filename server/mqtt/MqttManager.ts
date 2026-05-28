import mqtt, { MqttClient } from 'mqtt';
import { Server } from 'socket.io';

export class BackendMqttManager {
  private static instance: BackendMqttManager;
  private client: MqttClient | null = null;
  private io: Server | null = null;
  public connected = false;
  private subscriptionsHealthy = false;
  private subscriptionCount = 0;
  private lastPacketAt = 0;
  private lastHeartbeatAt = 0;
  private telemetryInterval: NodeJS.Timeout | null = null;
  private readonly subscribedTopics = ['orion/telemetry/#', 'orion/status/#', 'orion/commands/#'];

  private constructor() {}

  public static getInstance(): BackendMqttManager {
    if (!BackendMqttManager.instance) {
      BackendMqttManager.instance = new BackendMqttManager();
    }
    return BackendMqttManager.instance;
  }

  public init(io: Server) {
    this.io = io;
    this.connect();
  }

  public forceReconnect() {
    console.log('[BACKEND_MQTT] Force reconnect requested');
    if (this.client) {
      this.client.end(true);
      this.client = null;
    }
    this.connected = false;
    this.subscriptionsHealthy = false;
    this.broadcastStatus();
    this.connect();
  }

  private connect() {
    const brokerUrl = process.env.MQTT_URL || 'wss://broker.emqx.io:8084/mqtt';
    console.log(`[BACKEND_MQTT] Connecting to ${brokerUrl}...`);

    try {
      this.client = mqtt.connect(brokerUrl, {
        clientId: `orion_backend_${Math.random().toString(16).slice(2, 8)}`,
        clean: true,
        connectTimeout: 15000,
        keepalive: 60,
        reconnectPeriod: 5000,
        protocolVersion: 5,
        rejectUnauthorized: false,
        path: '/mqtt',
        manualConnect: false
      });

      this.client.on('connect', () => {
        console.log('[BACKEND_MQTT] Connected to broker');
        this.connected = true;
        this.subscribeTopics();
        this.startTelemetryHeartbeat();
        this.emitTelemetry('heartbeat');
        this.broadcastStatus();
      });

      this.client.on('message', (topic, payload) => {
        this.lastPacketAt = Date.now();
        // Log briefly to avoid flooding but show activity
        if (topic.includes('status') || topic.includes('telemetry')) {
          console.log(`[BACKEND_MQTT] Ingress: ${topic}`);
        }
        this.io?.emit('mqtt:message', { topic, payload: payload.toString() });
        this.emitTelemetry('packet_flow', { topic });
      });

      this.client.on('close', () => {
        if (this.connected) {
          console.log('[BACKEND_MQTT] Connection closed');
          this.connected = false;
          this.subscriptionsHealthy = false;
          this.subscriptionCount = 0;
          this.stopTelemetryHeartbeat();
          this.broadcastStatus();
        }
      });

      this.client.on('reconnect', () => {
        console.log('[BACKEND_MQTT] Attempting to reconnect...');
        this.broadcastStatus();
      });

      this.client.on('error', (err) => {
        console.error(`[BACKEND_MQTT] Error: ${err.message}`);
        this.broadcastStatus();
      });

    } catch (error) {
      console.error('[BACKEND_MQTT] Initialization failed:', error);
    }
  }

  private subscribeTopics() {
    console.log(`[BACKEND_MQTT] Subscribing to topics: ${this.subscribedTopics.join(', ')}`);
    this.client?.subscribe(this.subscribedTopics, (error, granted) => {
      if (error) {
        console.error(`[BACKEND_MQTT] Subscribe failed: ${error.message}`);
        this.subscriptionsHealthy = false;
        this.subscriptionCount = 0;
        this.broadcastStatus();
        return;
      }

      this.subscriptionsHealthy = Array.isArray(granted) && granted.length > 0;
      this.subscriptionCount = granted?.length || 0;
      console.log(`[BACKEND_MQTT] Subscriptions active. Count: ${this.subscriptionCount}`);
      this.broadcastStatus();
      this.emitTelemetry('subscriptions_restored');
    });
  }

  private startTelemetryHeartbeat() {
    if (this.telemetryInterval) {
      clearInterval(this.telemetryInterval);
    }

    this.telemetryInterval = setInterval(() => {
      if (!this.connected) {
        return;
      }
      this.emitTelemetry('heartbeat');
    }, 15000);
    console.log('[BACKEND_MQTT] Telemetry heartbeat started (15s interval)');
  }

  private stopTelemetryHeartbeat() {
    if (!this.telemetryInterval) {
      return;
    }
    clearInterval(this.telemetryInterval);
    this.telemetryInterval = null;
  }

  private emitTelemetry(type: 'heartbeat' | 'packet_flow' | 'subscriptions_restored', extra?: Record<string, unknown>) {
    this.lastHeartbeatAt = Date.now();
    this.io?.emit('mqtt:telemetry', {
      type,
      connected: this.connected,
      subscriptionsHealthy: this.subscriptionsHealthy,
      subscriptionCount: this.subscriptionCount,
      lastPacketAt: this.lastPacketAt,
      heartbeatAt: this.lastHeartbeatAt,
      meshState: this.resolveMeshState(),
      ...extra,
    });
  }

  private resolveMeshState() {
    return this.connected && this.subscriptionsHealthy ? 'ACTIVE' : 'DEGRADED';
  }

  private broadcastStatus() {
    this.io?.emit('mqtt:status', { 
      connected: this.connected, 
      timestamp: Date.now(),
      subscriptionsHealthy: this.subscriptionsHealthy,
      subscriptionCount: this.subscriptionCount,
      lastPacketAt: this.lastPacketAt,
      heartbeatAt: this.lastHeartbeatAt,
      meshState: this.resolveMeshState(),
    });
  }

  public publish(topic: string, message: string) {
    if (this.connected && this.client) {
      this.client.publish(topic, message);
    }
  }
}

export const backendMqttManager = BackendMqttManager.getInstance();
