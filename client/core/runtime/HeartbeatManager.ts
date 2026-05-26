import { socketManager, SocketState } from './SocketManager';
import { mqttManager, MqttState } from './MqttManager';
import { logger } from '../logger/Logger';
import { ProductionRecoveryEngine } from '../production/recovery/ProductionRecoveryEngine';

class HeartbeatManager {
  private static instance: HeartbeatManager;
  private interval: any = null;
  private lastBeat = 0;

  private constructor() {}

  public static getInstance(): HeartbeatManager {
    if (!HeartbeatManager.instance) {
      HeartbeatManager.instance = new HeartbeatManager();
    }
    return HeartbeatManager.instance;
  }

  public start() {
    if (this.interval) return;
    logger.info('RUNTIME', 'Monitoring pulse active [CALM_MODE]');
    this.interval = setInterval(() => this.performHealthCheck(), 30000); // 30s for Calm Mode
  }

  private performHealthCheck() {
    this.lastBeat = Date.now();
    
    // Core Pulse
    ProductionRecoveryEngine.ping('INTERNAL_RUNTIME');

    const sState = socketManager.getState();
    const mState = mqttManager.getState();

    // Verify Socket Health
    if (sState === SocketState.CONNECTED) {
      const socket = socketManager.getSocket();
      if (socket && !socket.connected) {
         console.warn('[HEARTBEAT] Socket ghosting detected');
      }
    }

    // Emit health event (silent)
    // console.log(`[HEARTBEAT] Health Synced: S:${sState} M:${mState}`);
  }

  public stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

export const heartbeatManager = HeartbeatManager.getInstance();
