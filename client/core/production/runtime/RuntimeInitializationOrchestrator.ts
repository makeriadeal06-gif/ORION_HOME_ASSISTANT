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
         await this.waitFor(layer.requires);
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
         // Decide if we should continue or stop
       }
     }

     stateSync.setRuntimeLifecycle(RuntimeLifecycle.READY);
     logger.info('RUNTIME_ORCHESTRATOR', 'ORION Core Fully Initialized');
  }

  private async waitFor(layerIds: string[]) {
    return new Promise<void>((resolve) => {
      const check = () => {
        const allReady = layerIds.every(id => this.readiness.get(id) === LayerReadiness.READY);
        if (allReady) resolve();
        else setTimeout(check, 50);
      };
      check();
    });
  }

  public getReadiness(layerId: string) {
    return this.readiness.get(layerId) || LayerReadiness.PENDING;
  }
}

export const runtimeOrchestrator = RuntimeInitializationOrchestrator.getInstance();
