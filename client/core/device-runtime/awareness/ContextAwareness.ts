import { deviceRegistry } from '../../google-home/registry/OrionDeviceRegistry';
import { logger } from '../../logger/Logger';

export class ContextAwareness {
  public static getRoomActivity(roomName: string) {
    const devices = deviceRegistry.getDevicesByRoom(roomName);
    const activeDevices = devices.filter(d => d.activity === 'ACTIVE');
    
    return {
      activeCount: activeDevices.length,
      totalCount: devices.length,
      isOccupied: activeDevices.length > 0,
    };
  }

  public static getEcosystemSummary() {
    const devices = deviceRegistry.getAllDevices();
    const online = devices.filter(d => d.status === 'ONLINE');
    const active = online.filter(d => d.activity === 'ACTIVE');

    return {
      total: devices.length,
      online: online.length,
      active: active.length,
      load: (active.length / Math.max(online.length, 1)) * 100
    };
  }

  public static logAwareness() {
    const summary = this.getEcosystemSummary();
    logger.info('DEVICE_AWARENESS', `Ecosystem Load: ${summary.load.toFixed(1)}% | ${summary.active} active nodes`);
  }
}
