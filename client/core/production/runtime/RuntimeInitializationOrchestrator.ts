import { logger } from '../../logger/Logger';
import { stateSync } from '@core/state/synchronization/StateSync';
import { RuntimeLifecycle } from '@core/state/schemas/runtime.schema';

export enum LayerReadiness {
  PENDING = 'PENDING',
  INITIALIZING = 'INITIALIZING',
  READY = 'READY',
  FAILED = 'FAILED'
}

class RuntimeInitializationOrchestrator {
  private static instance: RuntimeInitializationOrchestrator;
  private readiness: Map<string, LayerReadiness> = new Map();

  private constructor() {}

  public static getInstance(): RuntimeInitializationOrchestrator {
    if (!RuntimeInitializationOrchestrator.instance) {
      RuntimeInitializationOrchestrator.instance = new RuntimeInitializationOrchestrator();
    }
    return RuntimeInitializationOrchestrator.instance;
  }

  public async orchestrate(layers: { id: string, init: () => Promise<void> | void, requires?: string[] }[]) {
     logger.info('RUNTIME_ORCHESTRATOR', 'Starting deterministic boot sequence...');
     stateSync.setRuntimeLifecycle(RuntimeLifecycle.INITIALIZING);

     for (const layer of layers) {
       this.readiness.set(layer.id, LayerReadiness.PENDING);
     }

      for (const layer of layers) {
        if (layer.requires) {
          try {
            await this.waitFor(layer.requires);
          } catch (err) {
            // A dependency failed to become READY. Do not abort the entire
            // orchestrator — log and continue so the runtime can surface a
            // degraded UI instead of hanging indefinitely.
            logger.error('RUNTIME_ORCHESTRATOR', `Dependency wait failed for layer ${layer.id}: ${String(err)} — continuing boot in degraded mode.`);
          }
        }

        try {
          logger.info('RUNTIME_ORCHESTRATOR', `Initializing Layer: ${layer.id}`);
          this.readiness.set(layer.id, LayerReadiness.INITIALIZING);
          await layer.init();
          this.readiness.set(layer.id, LayerReadiness.READY);
          logger.info('RUNTIME_ORCHESTRATOR', `Layer ${layer.id} is READY`);
        } catch (error) {
          logger.error('RUNTIME_ORCHESTRATOR', `Layer ${layer.id} FAILED during boot: ${error}`);
          this.readiness.set(layer.id, LayerReadiness.FAILED);
          // Continue to next layer to allow partial startup and degrade gracefully
        }
      }

     stateSync.setRuntimeLifecycle(RuntimeLifecycle.READY);
     logger.info('RUNTIME_ORCHESTRATOR', 'ORION Core Fully Initialized');
  }

  private async waitFor(layerIds: string[]) {
    return new Promise<void>((resolve, reject) => {
      const check = () => {
        const statuses = layerIds.map(id => ({ id, status: this.readiness.get(id) }));
        const allReady = statuses.every(s => s.status === LayerReadiness.READY);
        const anyFailed = statuses.find(s => s.status === LayerReadiness.FAILED);

        if (allReady) {
          resolve();
        } else if (anyFailed) {
          logger.error('RUNTIME_ORCHESTRATOR', `Dependency_Failure: Layer ${anyFailed.id} failed. Breaking wait chain.`);
          reject(new Error(`Dependency failure: ${anyFailed.id}`));
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  }

  public getReadiness(layerId: string) {
    return this.readiness.get(layerId) || LayerReadiness.PENDING;
  }
}

export const runtimeOrchestrator = RuntimeInitializationOrchestrator.getInstance();
