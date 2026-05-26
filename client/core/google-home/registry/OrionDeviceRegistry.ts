import { OrionDevice, DeviceType } from '../types';
import { logger } from '../../logger/Logger';

class OrionDeviceRegistry {
  private static instance: OrionDeviceRegistry;
  private devices: Map<string, OrionDevice> = new Map();

  private constructor() {}

  public static getInstance(): OrionDeviceRegistry {
    if (!OrionDeviceRegistry.instance) {
      OrionDeviceRegistry.instance = new OrionDeviceRegistry();
    }
    return OrionDeviceRegistry.instance;
  }

  public register(device: OrionDevice) {
    const exists = this.devices.has(device.id);
    this.devices.set(device.id, device);
    
    if (!exists) {
      logger.info('DEVICE_REGISTRY', `New device discovered: ${device.name} [${device.type}]`);
    } else {
      // Passive update
      logger.info('DEVICE_REGISTRY', `State sync for: ${device.name}`);
    }
  }

  public getDevice(id: string): OrionDevice | undefined {
    return this.devices.get(id);
  }

  public getAllDevices(): OrionDevice[] {
    return Array.from(this.devices.values());
  }

  public getDevicesByRoom(room: string): OrionDevice[] {
    return this.getAllDevices().filter(d => d.room === room);
  }

  public clear() {
    this.devices.clear();
  }
}

export const deviceRegistry = OrionDeviceRegistry.getInstance();
