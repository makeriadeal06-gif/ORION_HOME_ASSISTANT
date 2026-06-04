import { logger } from '@core/logger/Logger';
import { AndroidBridgeEvent } from '../types';
import { AwarenessEventPayload } from './types';
import { useAndroidAwarenessStore } from './useAndroidAwarenessStore';

// STABILITY FREEZE
// DO NOT MODIFY WITHOUT ARCHITECTURAL REVIEW.

// STABILITY FREEZE
// DO NOT MODIFY WITHOUT ARCHITECTURAL REVIEW.

class AndroidAwarenessEngine {
  private static instance: AndroidAwarenessEngine;
  private initialized = false;

  private constructor() {}

  public static getInstance(): AndroidAwarenessEngine {
    if (!AndroidAwarenessEngine.instance) {
      AndroidAwarenessEngine.instance = new AndroidAwarenessEngine();
    }
    return AndroidAwarenessEngine.instance;
  }

  public async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    
    this.initialized = true;
    this.attachBridgeListener();
    await this.fetchInitialState();
    
    logger.info('ANDROID_AWARENESS', 'awareness_engine_initialized=true');
  }

  private attachBridgeListener(): void {
    window.addEventListener('orion:android-event', ((nativeEvent: Event) => {
      const detail = (nativeEvent as CustomEvent<AndroidBridgeEvent>).detail;
      if (detail && detail.type === 'awareness') {
        this.handleAwarenessEvent(detail.action, detail.payload as any);
      }
    }) as EventListener);

    // Also wrap the global dispatch if needed, but the original AndroidRuntimeManager 
    // already dispatches orion:android-event. Wait, AndroidRuntimeManager actually 
    // assigns window.__ORION_ANDROID_DISPATCH__ directly. 
    // If native calls __ORION_ANDROID_DISPATCH__, it is handled there.
    // Let's hook into window.__ORION_ANDROID_DISPATCH__ safely by wrapping it,
    // just in case AndroidRuntimeManager doesn't re-dispatch it as a DOM event.
    // Actually, AndroidRuntimeManager does not dispatch it as a DOM event. 
    // It listens to the DOM event and also sets the global function.
    // Let's wrap the global function safely.
    const originalDispatch = window.__ORION_ANDROID_DISPATCH__;
    window.__ORION_ANDROID_DISPATCH__ = (event: AndroidBridgeEvent) => {
      if (originalDispatch) {
        originalDispatch(event);
      }
      
      if (event.type === 'awareness') {
        this.handleAwarenessEvent(event.action, event.payload as any);
      }
    };
  }

  private handleAwarenessEvent(action: string, payload: AwarenessEventPayload): void {
    logger.info('ANDROID_AWARENESS', `awareness_event action=${action}`);
    const store = useAndroidAwarenessStore.getState();

    switch (action) {
      case 'battery_update':
        store.updateBattery(payload as any);
        break;
      case 'network_update':
        store.updateNetwork(payload as any);
        break;
      case 'bluetooth_update':
        store.updateBluetooth(payload as any);
        break;
      case 'power_update':
        store.updatePower(payload as any);
        break;
      case 'audio_update':
        store.updateAudio(payload as any);
        break;
      case 'location_update':
        store.updateLocation(payload as any);
        break;
      case 'permissions_update':
        store.updatePermissions(payload as any);
        break;
      default:
        logger.warn('ANDROID_AWARENESS', `unknown_awareness_action action=${action}`);
    }
  }

  private async fetchInitialState(): Promise<void> {
    const bridge = window.AndroidOrionBridge;
    if (!bridge) {
      logger.info('ANDROID_AWARENESS', 'native_bridge_unavailable fetch_skipped=true');
      return;
    }

    const store = useAndroidAwarenessStore.getState();

    try {
      if (bridge.getBatteryState) {
        const battery = await bridge.getBatteryState();
        store.updateBattery(battery);
      }
      
      if (bridge.getNetworkState) {
        const network = await bridge.getNetworkState();
        store.updateNetwork(network);
      }
      
      if (bridge.getBluetoothState) {
        const bluetooth = await bridge.getBluetoothState();
        store.updateBluetooth(bluetooth);
      }
      
      if (bridge.getPowerState) {
        const power = await bridge.getPowerState();
        store.updatePower(power);
      }
      
      if (bridge.getAudioState) {
        const audio = await bridge.getAudioState();
        store.updateAudio(audio);
      }
      
      if (bridge.getLocationState) {
        const location = await bridge.getLocationState();
        store.updateLocation(location);
      }
    } catch (error: any) {
      logger.warn('ANDROID_AWARENESS', `fetch_initial_state_failed error=${error?.message || error}`);
    }
  }
}

export const androidAwarenessEngine = AndroidAwarenessEngine.getInstance();
