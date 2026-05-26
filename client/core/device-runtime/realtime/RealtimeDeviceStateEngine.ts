import { socketRuntime } from '../../socket/SocketRuntime';
import { deviceRegistry } from '../../google-home/registry/OrionDeviceRegistry';
import { useDeviceStore } from '../../google-home/state/useDeviceStore';
import { logger } from '../../logger/Logger';
import { DeviceEvents, DeviceConnectionStatus, DeviceActivityStatus } from '../lifecycle/DeviceLifecycle';
import { OrionDevice } from '../../google-home/types';

class RealtimeDeviceStateEngine {
  private static instance: RealtimeDeviceStateEngine;
  private initialized = false;

  private constructor() {}

  public static getInstance(): RealtimeDeviceStateEngine {
    if (!RealtimeDeviceStateEngine.instance) {
      RealtimeDeviceStateEngine.instance = new RealtimeDeviceStateEngine();
    }
    return RealtimeDeviceStateEngine.instance;
  }

  public init() {
    if (this.initialized) return;
    
    logger.info('DEVICE_RUNTIME', 'Initializing Realtime Device State Engine...');

    this.setupSocketListeners();
    this.initialized = true;
  }

  private setupSocketListeners() {
    // Single device update
    socketRuntime.on(DeviceEvents.DEVICE_UPDATED, (update: Partial<OrionDevice> & { id: string }) => {
      this.handleDeviceUpdate(update);
    });

    // Device online status
    socketRuntime.on(DeviceEvents.DEVICE_ONLINE, (id: string) => {
      this.handleDeviceUpdate({ id, status: DeviceConnectionStatus.ONLINE, lastSeen: Date.now() });
    });

    // Device offline status
    socketRuntime.on(DeviceEvents.DEVICE_OFFLINE, (id: string) => {
      this.handleDeviceUpdate({ id, status: DeviceConnectionStatus.OFFLINE, lastSeen: Date.now() });
    });

    // Device activity
    socketRuntime.on(DeviceEvents.DEVICE_ACTIVE, (id: string) => {
      this.handleDeviceUpdate({ id, activity: DeviceActivityStatus.ACTIVE, lastSeen: Date.now() });
    });

    socketRuntime.on(DeviceEvents.DEVICE_IDLE, (id: string) => {
      this.handleDeviceUpdate({ id, activity: DeviceActivityStatus.IDLE, lastSeen: Date.now() });
    });

    // Batch sync
    socketRuntime.on(DeviceEvents.DEVICE_SYNCED, (devices: OrionDevice[]) => {
      if (!Array.isArray(devices)) {
        return;
      }

      logger.info('DEVICE_SYNC', `Realtime batch sync: ${devices.length} devices`);
      devices.filter(Boolean).forEach(d => deviceRegistry.register(d));
      useDeviceStore.getState().setDevices(deviceRegistry.getAllDevices());
    });
  }

  private handleDeviceUpdate(update: Partial<OrionDevice> & { id: string }) {
    const existing = deviceRegistry.getDevice(update.id);
    if (!existing) {
      logger.warn('DEVICE_RUNTIME', `Received update for unknown device: ${update.id}`);
      return;
    }

    const updatedDevice = { ...existing, ...update };
    deviceRegistry.register(updatedDevice);
    useDeviceStore.getState().updateDevice(update.id, update);
    
    logger.info('REALTIME_STATE', `Device updated: ${updatedDevice.name} [${update.status || update.activity || 'PROPS'}]`);
  }
}

export const realtimeDeviceStateEngine = RealtimeDeviceStateEngine.getInstance();
