import { useProductionStore } from '../state/useProductionStore';
import { logger } from '../../logger/Logger';
import { healthBus, HealthEvent } from '../infrastructure/RuntimeHealthBus';

export class ProductionRecoveryEngine {
  private static checkInterval: any;
  private static subscribers: Set<() => void> = new Set();

  public static init() {
    if (this.checkInterval) return;

    logger.info('PRODUCTION_RUNTIME', 'Production Recovery Engine Active [CALM_MODE]');

    // Listen to Health Bus events instead of just polling
    this.subscribers.add(healthBus.subscribe(HealthEvent.PING, ({ subsystemId }) => {
      this.handlePing(subsystemId);
    }));

    this.subscribers.add(healthBus.subscribe(HealthEvent.DEGRADED, ({ subsystemId, message }) => {
      this.markDegraded(subsystemId, message);
    }));

    this.checkInterval = setInterval(() => {
      this.auditSystems();
    }, 60000); // Increased to 60s health audit for "Calm Mode"
  }

  private static handlePing(subsystemId: string) {
    useProductionStore.getState().updateSubsystem(subsystemId, { 
      status: 'HEALTHY', 
      message: 'Operational' 
    });
  }

  private static markDegraded(subsystemId: string, message?: string) {
    useProductionStore.getState().updateSubsystem(subsystemId, { 
      status: 'DEGRADED', 
      message: message || 'Stability_Warning' 
    });
  }

  private static auditSystems() {
    const { subsystems } = useProductionStore.getState().health;
    const now = Date.now();

    Object.values(subsystems).forEach(sub => {
      const diff = now - sub.lastPing;
      
      // Increased tolerance: 2 minutes for degraded, 5 minutes for critical
      if (diff > 120000 && sub.status === 'HEALTHY') {
        this.markDegraded(sub.id, 'Silent_Heartbeat');
        logger.warn('PRODUCTION_RECOVERY', `Subsystem ${sub.id} is degraded (silent for ${Math.round(diff/1000)}s)`);
      }
      
      if (diff > 300000 && sub.status !== 'CRITICAL') {
         useProductionStore.getState().updateSubsystem(sub.id, { 
          status: 'CRITICAL',
          message: 'Runtime_Expiration'
        });
        this.attemptRecovery(sub.id);
      }
    });
  }

  private static attemptRecovery(subsystemId: string) {
    logger.info('PRODUCTION_RECOVERY', `Initiating adaptive recovery protocol: ${subsystemId}`);
    
    switch (subsystemId) {
      case 'INTERNAL_RUNTIME':
        // Only reload if we are sure it's dead and no other nodes are active
        // For now, just log the intent to avoid loop-reloads
        logger.error('PRODUCTION_RECOVERY', 'INTERNAL_RUNTIME_CRITICAL: Manual intervention or reload suggested.');
        break;
    }
  }

  public static ping(subsystemId: string) {
    healthBus.ping(subsystemId);
  }
}
