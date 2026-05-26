import { socketManager, SocketState } from './SocketManager';
import { mqttManager, MqttState } from './MqttManager';
import { useSystemStore } from '@core/state/stores/useSystemStore';
import { logger } from '../logger/Logger';
import { taskRuntime } from '@core/task-runtime/TaskRuntime';

class RecoveryManager {
  private static instance: RecoveryManager;
  private recoveryLock = false;
  private cooldownTimer: any = null;
  private lastRecovery = 0;
  private COOLDOWN_MS = 120000; // 2 minutes between recovery bursts for Calm Mode

  private constructor() {}

  public static getInstance(): RecoveryManager {
    if (!RecoveryManager.instance) {
      RecoveryManager.instance = new RecoveryManager();
    }
    return RecoveryManager.instance;
  }

  public async evaluateSystem() {
    if (this.recoveryLock) return;

    const { isAuthenticating } = useSystemStore.getState();
    if (isAuthenticating) return;

    const now = Date.now();
    const sState = socketManager.getState();
    const mState = mqttManager.getState();

    let needsRecovery = false;

    if (sState === SocketState.FAILED) needsRecovery = true;
    if (mState === MqttState.FAILED) needsRecovery = true;

    if (needsRecovery) {
      if (now - this.lastRecovery < this.COOLDOWN_MS) {
        logger.trace('RECOVERY', 'Supressing concurrent recovery request (Cooldown active)');
        return;
      }
      this.triggerRecovery();
    }

    taskRuntime.runIntegrityPass('recovery_manager');
  }

  private triggerRecovery() {
    this.recoveryLock = true;
    this.lastRecovery = Date.now();
    window.dispatchEvent(new CustomEvent('orion:runtime-context', {
      detail: {
        type: 'runtime',
        action: 'recovery',
        payload: {
          source: 'RecoveryManager',
        },
      },
    }));
    
    const sState = socketManager.getState();
    const mState = mqttManager.getState();
    
    logger.info('RECOVERY', `Adaptive_System_Evaluation: S:${sState}, M:${mState}`);

    if (sState === SocketState.FAILED) {
      logger.info('RECOVERY', 'Resetting_Socket_Transport_Layer');
      socketManager.disconnect();
      setTimeout(() => socketManager.connect(), 1000);
    }

    if (mState === MqttState.FAILED) {
      logger.info('RECOVERY', 'Resetting_Mqtt_Infrastructure_Bridge');
      mqttManager.disconnect();
      setTimeout(() => mqttManager.connect(), 2000);
    }
    
    this.recoveryLock = false;
  }

  private intervalId: any = null;

  public startWatchdog() {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.evaluateSystem(), 60000); // 60s audit
  }
}

export const recoveryManager = RecoveryManager.getInstance();
