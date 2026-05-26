import { moduleRegistry } from '../registry/ModuleRegistry';
import { logger } from '../../logger/Logger';

class ModuleHealthMonitor {
  private static instance: ModuleHealthMonitor;
  private intervalId: any = null;
  private CHECK_INTERVAL = 30000; // 30 seconds

  private constructor() {}

  public static getInstance(): ModuleHealthMonitor {
    if (!ModuleHealthMonitor.instance) {
      ModuleHealthMonitor.instance = new ModuleHealthMonitor();
    }
    return ModuleHealthMonitor.instance;
  }

  public start() {
    if (this.intervalId) return;

    logger.info('MODULE_HEALTH', 'Starting dynamic health monitor...');
    this.intervalId = setInterval(() => {
      this.performHealthChecks();
    }, this.CHECK_INTERVAL);
    
    // Initial check
    this.performHealthChecks();
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private isChecking = false;

  private async performHealthChecks() {
    if (this.isChecking) {
      logger.warn('MODULE_HEALTH', 'Previous health check still in progress, skipping cycle.');
      return;
    }
    
    this.isChecking = true;
    try {
      logger.debug('MODULE_HEALTH', 'Executing scheduled scan...');
      await moduleRegistry.runHealthChecks();
    } catch (error) {
      logger.error('MODULE_HEALTH', 'Critical failure during health scan', error);
    } finally {
      this.isChecking = false;
    }
  }
}

export const moduleHealthMonitor = ModuleHealthMonitor.getInstance();
