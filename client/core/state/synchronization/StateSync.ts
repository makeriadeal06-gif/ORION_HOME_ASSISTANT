import { useSystemStore } from '../stores/useSystemStore';
import { useRuntimeStore } from '../stores/useRuntimeStore';
import { AuthTransitionState, RuntimeLifecycle } from '../schemas/runtime.schema';
import { InfrastructureStatus, ModuleHealth } from '../schemas/system.schema';
import type { EnvironmentSnapshot, EnvironmentState } from '@core/environment-runtime/types';

/**
 * [SYNC]
 * Camada de sincronização entre o Runtime Core e as Stores de Estado.
 * Garante que as atualizações sejam validadas e centralizadas.
 */
class StateSync {
  private static instance: StateSync;

  private constructor() {}

  public static getInstance(): StateSync {
    if (!StateSync.instance) {
      StateSync.instance = new StateSync();
    }
    return StateSync.instance;
  }

  // Runtime Sync
  public setRuntimeLifecycle(lifecycle: RuntimeLifecycle) {
    console.log(`[SYNC] Runtime Lifecycle: ${lifecycle}`);
    useRuntimeStore.getState().setLifecycle(lifecycle);
  }

  public setAuthTransitionState(
    authTransitionState: AuthTransitionState,
    transitionOwnerId: string | null = null,
    options?: { hydrationBarrierActive?: boolean; runtimeUiLocked?: boolean }
  ) {
    useRuntimeStore.getState().setAuthTransitionState(authTransitionState, transitionOwnerId, options);
  }

  public releaseAuthTransition() {
    useRuntimeStore.getState().releaseAuthTransition();
  }

  public resetHydrationBarrier() {
    useRuntimeStore.getState().resetHydrationBarrier();
  }

  public unlockRuntimeUI() {
    useRuntimeStore.getState().unlockRuntimeUI();
  }

  public registerManager(name: string) {
    console.log(`[SYNC] Registering Manager: ${name}`);
    useRuntimeStore.getState().registerManager(name);
  }

  public updateEnvironmentState(environmentState: EnvironmentState, environmentSnapshot: EnvironmentSnapshot | null) {
    useRuntimeStore.getState().setEnvironmentState(environmentState, environmentSnapshot);
  }

  // Infrastructure Sync
  public updateInfrastructure(key: keyof InfrastructureStatus, status: any) {
    // console.log(`[SYNC] Infrastructure Update: ${key}`);
    useSystemStore.getState().updateInfraStatus(key, status);
  }

  public updateMqttHealth(health: Partial<InfrastructureStatus['mqtt']>) {
    useSystemStore.getState().updateInfraStatus('mqtt', health);
  }

  // Module Sync
  public updateModuleHealth(id: string, health: Partial<ModuleHealth>) {
    console.log(`[SYNC] Module Health Update: ${id}`);
    useSystemStore.getState().updateModuleHealth(id, health);
  }

  public setAuthenticating(status: boolean) {
    useSystemStore.getState().setAuthenticating(status);
  }

  public updateAuthState(linked: boolean) {
    useSystemStore.getState().updateInfraStatus('googleHome', { linked });
  }

  // Metrics Sync
  public setCPUPressure(pressure: 'LOW' | 'MODERATE' | 'HIGH') {
    useSystemStore.getState().setCPUPressure(pressure);
  }

  public trackEvent() {
    useSystemStore.getState().incrementEventQueue();
    setTimeout(() => useSystemStore.getState().decrementEventQueue(), 1000);
  }
}

export const stateSync = StateSync.getInstance();
