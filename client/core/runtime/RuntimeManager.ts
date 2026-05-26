import { socketRuntime } from '@core/socket/SocketRuntime';
import { SocketHealth } from '@core/socket/SocketHealth';
import { googleHomeRuntime } from '@core/google-home/runtime/GoogleHomeRuntime';
import { commandQueue } from '@core/command-runtime/execution/CommandExecutionQueue';
import { GoogleHomeAdapter } from '@core/command-runtime/adapters/GoogleHomeAdapter';
import { MqttCommandAdapter } from '@core/command-runtime/adapters/MqttCommandAdapter';
import { TriggerCmdAdapter } from '@core/command-runtime/adapters/TriggerCmdAdapter';
import { SystemCommandAdapter } from '@core/command-runtime/adapters/SystemCommandAdapter';
import { ContextAwarenessEngine } from '@core/cognitive-runtime/context/ContextAwarenessEngine';
import { BehaviorPatternEngine } from '@core/cognitive-runtime/patterns/BehaviorPatternEngine';
import { NodeLifecycleManager } from '@core/distributed-runtime/lifecycle/NodeLifecycleManager';
import { ConnectivityAwarenessEngine } from '@core/distributed-runtime/connectivity/ConnectivityAwarenessEngine';
import { DistributedSyncEngine } from '@core/distributed-runtime/synchronization/DistributedSyncEngine';
import { ProductionRecoveryEngine } from '@core/production/recovery/ProductionRecoveryEngine';
import { socketManager } from '@core/runtime/SocketManager';
import { mqttManager } from '@core/runtime/MqttManager';
import { triggerManager } from '@core/runtime/TriggerManager';
import { authManager } from '@core/auth/runtime/AuthManager';
import { heartbeatManager } from '@core/runtime/HeartbeatManager';
import { recoveryManager } from '@core/runtime/RecoveryManager';
import { stateSync } from '@core/state/synchronization/StateSync';
import { RuntimeLifecycle } from '@core/state/schemas/runtime.schema';
import { logger } from '../logger/Logger';
import { androidRuntimeManager } from '@core/android-runtime/AndroidRuntimeManager';
import { taskRuntime } from '@core/task-runtime/TaskRuntime';
import { automationStoreService } from '@core/automation-runtime/AutomationStore';
import { presenceRuntime } from '@core/presence/PresenceRuntime';
import { environmentRuntime } from '@core/environment-runtime/EnvironmentRuntime';
import { runtimeIdentity } from '@core/runtime/RuntimeIdentity';

import { runtimeOrchestrator } from '@core/production/runtime/RuntimeInitializationOrchestrator';

/**
 * [RUNTIME]
 * Orchestrator principal do núcleo do ORION.
 * Controla o ciclo de vida de todos os managers usando o Production Orchestrator.
 */
class RuntimeManager {
  private static instance: RuntimeManager;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): RuntimeManager {
    if (!RuntimeManager.instance) {
      RuntimeManager.instance = new RuntimeManager();
    }
    return RuntimeManager.instance;
  }

  public async bootstrap() {
    if (this.isInitialized) return;

    await runtimeOrchestrator.orchestrate([
      {
        id: 'INFRASTRUCTURE',
        init: () => {
          runtimeIdentity.init();
          ProductionRecoveryEngine.init();
          stateSync.registerManager('ProductionInfrastructure');
        }
      },
      {
        id: 'ANDROID_RUNTIME',
        requires: ['INFRASTRUCTURE'],
        init: async () => {
          await androidRuntimeManager.init();
          stateSync.registerManager('AndroidRuntime');
        }
      },
      {
        id: 'ENVIRONMENT',
        requires: ['ANDROID_RUNTIME'],
        init: () => {
          environmentRuntime.init();
          stateSync.registerManager('EnvironmentRuntime');
        }
      },
      {
        id: 'AUTH',
        requires: ['INFRASTRUCTURE', 'ANDROID_RUNTIME', 'ENVIRONMENT'],
        init: () => {
          authManager.init();
          stateSync.registerManager('AuthManager');
        }
      },
      {
        id: 'NETWORK',
        requires: ['AUTH'],
        init: () => {
          socketRuntime.connect();
          stateSync.registerManager('SocketRuntime');
        }
      },
      {
        id: 'DISTRIBUTION',
        requires: ['NETWORK'],
        init: () => {
          ConnectivityAwarenessEngine.init();
          NodeLifecycleManager.init();
          DistributedSyncEngine.init();
          stateSync.registerManager('DistributedRuntime');
        }
      },
      {
        id: 'COGNITIVE',
        requires: ['DISTRIBUTION'],
        init: () => {
          // Keep old engines
          ContextAwarenessEngine.start();
          BehaviorPatternEngine.init();
          
          // Import new cognitive layer singletons implicitly to warm them up
          import('@core/cognitive-runtime/bus/CognitiveEventBus');
          import('@core/cognitive-runtime/state/CognitiveStateEngine');
          import('@core/cognitive-runtime/pipeline/IntentPipeline');
          import('@core/cognitive-runtime/arbitration/ActionArbitration');
          
          stateSync.registerManager('CognitiveEngine');
        }
      },
      {
        id: 'VOICE',
        requires: ['COGNITIVE'],
        init: async () => {
          const { voiceRuntimeManager } = await import('@core/voice-runtime/VoiceRuntimeManager');
          await voiceRuntimeManager.init();
          stateSync.registerManager('VoiceEngine');
        }
      },
      {
        id: 'INTEGRATIONS',
        requires: ['VOICE'],
        init: () => {
          googleHomeRuntime.init();
          mqttManager.connect();
          triggerManager.init();
          
          commandQueue.registerAdapter(new GoogleHomeAdapter());
          commandQueue.registerAdapter(new MqttCommandAdapter());
          commandQueue.registerAdapter(new TriggerCmdAdapter());
          commandQueue.registerAdapter(new SystemCommandAdapter());
          stateSync.registerManager('ExternalIntegrations');
        }
      },
      {
        id: 'HEALTH',
        requires: ['INTEGRATIONS'],
        init: () => {
          taskRuntime.init();
          automationStoreService.init();
          presenceRuntime.init();
          stateSync.registerManager('TaskRuntime');
          stateSync.registerManager('AutomationStore');
          stateSync.registerManager('PresenceRuntime');
          heartbeatManager.start();
          recoveryManager.startWatchdog();
          stateSync.registerManager('SystemHealth');
        }
      }
      
    ]);

    this.isInitialized = true;
    logger.info('RUNTIME', 'ORION PLATFORM_OPERATIONAL');
  }

  public shutdown() {
    logger.info('RUNTIME', 'Orderly shutdown initiated');
    environmentRuntime.shutdown();
    void androidRuntimeManager.shutdown();
    socketManager.disconnect();
    mqttManager.disconnect();
    heartbeatManager.stop();
    this.isInitialized = false;
  }
}

export const runtimeManager = RuntimeManager.getInstance();
