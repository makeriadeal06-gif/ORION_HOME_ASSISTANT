import { logger } from '../../logger/Logger';
import { deviceRegistry } from '../registry/OrionDeviceRegistry';
import { useDeviceStore } from '../state/useDeviceStore';
import { socketRuntime } from '../../socket/SocketRuntime';
import { realtimeDeviceStateEngine } from '../../device-runtime/realtime/RealtimeDeviceStateEngine';
import { DeviceMonitoring } from '../../device-runtime/monitoring/DeviceMonitoring';

class GoogleHomeRuntime {
  private static instance: GoogleHomeRuntime;
  private initialized = false;
  private syncInterval: any = null;

  private constructor() {}

  public static getInstance(): GoogleHomeRuntime {
    if (!GoogleHomeRuntime.instance) {
      GoogleHomeRuntime.instance = new GoogleHomeRuntime();
    }
    return GoogleHomeRuntime.instance;
  }

  public init() {
    if (this.initialized) return;

    logger.info('GOOGLE_HOME', 'Initializing passive ecosystem sync...');
    
    // Initialize realtime engine
    realtimeDeviceStateEngine.init();

    // Start telemetry
    DeviceMonitoring.start();

    // Legacy listener for generic sync (can be kept or migrated to engine)
    socketRuntime.on('google:device_sync', (devices) => {
      if (!Array.isArray(devices)) {
        return;
      }

      logger.info('DEVICE_SYNC', `Received batch update: ${devices.length} devices`);
      devices.filter(Boolean).forEach((d: any) => deviceRegistry.register(d));
      useDeviceStore.getState().setDevices(deviceRegistry.getAllDevices());
    });

    this.startPassiveDiscovery();
    this.initialized = true;
  }

  private startPassiveDiscovery() {
    // Initial fetch from server
    this.fetchEcosystem();

    // Periodic check (passive sync)
    if (this.syncInterval) clearInterval(this.syncInterval);
    this.syncInterval = setInterval(() => {
      this.fetchEcosystem();
    }, 60000); // Sync every minute
  }

  private async fetchEcosystem() {
    try {
      logger.info('GOOGLE_HOME', 'Fetching ecosystem snapshot...');
      const response = await fetch('/api/google-home/ecosystem');
      if (response.ok) {
        const devices = await response.json();
        if (!Array.isArray(devices)) {
          return;
        }

        devices.filter(Boolean).forEach((d: any) => deviceRegistry.register(d));
        useDeviceStore.getState().setDevices(deviceRegistry.getAllDevices());
      }
    } catch (error) {
      logger.error('GOOGLE_HOME', 'Failed to fetch ecosystem snapshot');
    }
  }

  public stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

export const googleHomeRuntime = GoogleHomeRuntime.getInstance();
