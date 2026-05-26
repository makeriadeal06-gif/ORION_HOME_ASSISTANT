import { runtimeOrchestrator } from './RuntimeInitializationOrchestrator';
import { stateSync } from '@core/state/synchronization/StateSync';
import { RuntimeLifecycle } from '@core/state/schemas/runtime.schema';
import { downloadLogsRuntime } from '@core/production/runtime/DownloadLogsRuntime';
import { diagnosticReportRuntime } from '@core/production/runtime/DiagnosticReportRuntime';
import { initializeSyncRuntime } from '@core/production/runtime/InitializeSyncRuntime';
import { logger } from '../../logger/Logger';

// Register a lightweight dashboard ops layer after core initialization.
// This is intentionally in a separate non-frozen module to avoid modifying frozen RuntimeManager.
void (async function registerDashboardOps() {
  try {
    // Wait until core orchestrator signals READY
    // We'll poll runtime lifecycle from stateSync
    const waitForReady = () => new Promise<void>((resolve) => {
      const check = () => {
        const lifecycle = (stateSync as any).getRuntimeLifecycle ? (stateSync as any).getRuntimeLifecycle() : RuntimeLifecycle.INITIALIZING;
        if (lifecycle === RuntimeLifecycle.READY) resolve();
        else setTimeout(check, 100);
      };
      check();
    });

    await waitForReady();

    await runtimeOrchestrator.orchestrate([
      {
        id: 'DASHBOARD_OPS',
        requires: ['HEALTH'],
        init: () => {
          logger.info('DASHBOARD_OPS', 'Initializing dashboard operations layer');
          downloadLogsRuntime.init();
          diagnosticReportRuntime.init();
          initializeSyncRuntime.init();
          // Fire-and-forget run
          void initializeSyncRuntime.run();
          stateSync.registerManager('DashboardOperations');
        }
      }
    ]);
  } catch (e) {
    logger.warn('DASHBOARD_OPS', `Failed to register dashboard ops: ${String(e)}`);
  }
})();
