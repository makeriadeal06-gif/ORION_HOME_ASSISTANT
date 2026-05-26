import { logger } from '../../logger/Logger';
import { deviceRegistry } from '../../google-home/registry/OrionDeviceRegistry';
import { ContextAwareness } from '../awareness/ContextAwareness';

export class DeviceMonitoring {
  private static healthCheckInterval: any = null;

  public static start() {
    if (this.healthCheckInterval) return;

    logger.info('DEVICE_RUNTIME', 'Starting device telemetry monitoring...');

    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 300000); // Every 5 minutes
  }

  private static performHealthCheck() {
    const devices = deviceRegistry.getAllDevices();
    const staleLimit = Date.now() - (10 * 60 * 1000); // 10 minutes

    devices.forEach(device => {
      if (device.lastSeen < staleLimit) {
        logger.warn('DEVICE_AWARENESS', `Device heartbeat stale: ${device.name} [Last seen: ${new Date(device.lastSeen).toLocaleTimeString()}]`);
      }
    });

    const summary = ContextAwareness.getEcosystemSummary();
    logger.info('DEVICE_SYNC', `Health Check Summary: ${summary.online}/${summary.total} nodes operational | ${summary.active} active`);
  }

  public static stop() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
}
