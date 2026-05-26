import { logger } from '../../logger/Logger';
import { automationStoreService } from '@core/automation-runtime/AutomationStore';
import { triggerManager } from '@core/runtime/TriggerManager';
import { stateSync } from '@core/state/synchronization/StateSync';
import { runtimeIdentity } from '@core/runtime/RuntimeIdentity';

class InitializeSyncRuntime {
  private static instance: InitializeSyncRuntime;

  private constructor() {}

  public static getInstance(): InitializeSyncRuntime {
    if (!InitializeSyncRuntime.instance) {
      InitializeSyncRuntime.instance = new InitializeSyncRuntime();
    }
    return InitializeSyncRuntime.instance;
  }

  public init() {
    logger.info('INITIALIZE_SYNC', 'Synchronization runtime ready');
  }

  public async run(): Promise<void> {
    logger.info('INITIALIZE_SYNC', 'Starting initial synchronization pass');

    try {
      // trigger manager (rooms/devices/triggers)
      await triggerManager.loadConfig();
      await triggerManager.syncDevices();
      logger.info('INITIALIZE_SYNC', 'TriggerManager sync complete');
    } catch (e) {
      logger.warn('INITIALIZE_SYNC', `trigger_sync_failed ${String(e)}`);
    }

    try {
      // Automations snapshot/hydration is managed by automationStoreService.init during RuntimeManager boot
      // We still ensure owner-specific reconciliation if authenticated
      if (runtimeIdentity.getAuthState && runtimeIdentity.getAuthState() !== 'ANONYMOUS') {
        // AutomationStoreService already initialized earlier; force a reconcile
        automationStoreService.listAutomations();
        logger.info('INITIALIZE_SYNC', 'Automation Store reconciled');
      }
    } catch (e) {
      logger.warn('INITIALIZE_SYNC', `automation_sync_failed ${String(e)}`);
    }

    stateSync.setRuntimeLifecycle((stateSync as any).getRuntimeLifecycle ? (stateSync as any).getRuntimeLifecycle() : 'READY');
    logger.info('INITIALIZE_SYNC', 'Initial synchronization pass complete');
  }
}

export const initializeSyncRuntime = InitializeSyncRuntime.getInstance();
