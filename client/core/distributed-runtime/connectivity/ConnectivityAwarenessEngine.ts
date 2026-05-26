import { useDistributedStore } from '../state/useDistributedStore';
import { logger } from '../../logger/Logger';

export class ConnectivityAwarenessEngine {
  private static initialized = false;

  public static init() {
    if (this.initialized) return;

    window.addEventListener('online', () => this.handleStatusChange(true));
    window.addEventListener('offline', () => this.handleStatusChange(false));

    // Periodic latency check
    setInterval(() => this.measureLatency(), 30000);

    this.initialized = true;
    logger.info('DISTRIBUTED_RUNTIME', 'Connectivity Awareness Engine Online');
  }

  private static handleStatusChange(online: boolean) {
    const quality = online ? 'GOOD' : 'DISCONNECTED';
    useDistributedStore.getState().setConnectivity({ online, quality });
    logger.info('CONNECTIVITY', `Network state changed: ${online ? 'ONLINE' : 'OFFLINE'}`);
  }

  private static async measureLatency() {
    if (!navigator.onLine) return;

    const start = Date.now();
    try {
      // Basic heartbeat to origin
      await fetch('/favicon.ico', { method: 'HEAD', cache: 'no-store' });
      const latency = Date.now() - start;
      
      let quality: 'EXCELLENT' | 'GOOD' | 'DEGRADED' = 'EXCELLENT';
      if (latency > 300) quality = 'DEGRADED';
      else if (latency > 100) quality = 'GOOD';

      useDistributedStore.getState().setConnectivity({ latency, quality });
    } catch (e) {
      // Ignore failed latency checks
    }
  }
}
