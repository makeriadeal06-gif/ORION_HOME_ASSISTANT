import { create } from 'zustand';
import { AuthTransitionState, RuntimeLifecycle, RuntimeState } from '../schemas/runtime.schema';
import type { EnvironmentSnapshot, EnvironmentState } from '@core/environment-runtime/types';

interface RuntimeActions {
  setLifecycle: (lifecycle: RuntimeLifecycle) => void;
  setAuthTransitionState: (authTransitionState: AuthTransitionState, transitionOwnerId?: string | null, options?: { hydrationBarrierActive?: boolean; runtimeUiLocked?: boolean }) => void;
  releaseAuthTransition: () => void;
  resetHydrationBarrier: () => void;
  unlockRuntimeUI: () => void;
  registerManager: (name: string) => void;
  unregisterManager: (name: string) => void;
  setEnvironmentState: (environmentState: EnvironmentState, environmentSnapshot: EnvironmentSnapshot | null) => void;
}

export const useRuntimeStore = create<RuntimeState & RuntimeActions>((set) => ({
  lifecycle: RuntimeLifecycle.BOOTING,
  authTransitionState: 'AUTH_RESTORING',
  transitionOwnerId: null,
  authTransitionStartedAt: Date.now(),
  hydrationBarrierActive: true,
  runtimeUiLocked: false,
  lastUpdate: Date.now(),
  activeManagers: [],
  environmentState: null,
  environmentSnapshot: null,

  setLifecycle: (lifecycle) => set({ lifecycle, lastUpdate: Date.now() }),
  setAuthTransitionState: (authTransitionState, transitionOwnerId = null, options = {}) => set((state) => ({
    authTransitionState,
    transitionOwnerId,
    authTransitionStartedAt: authTransitionState === state.authTransitionState ? state.authTransitionStartedAt : Date.now(),
    hydrationBarrierActive: options.hydrationBarrierActive ?? (authTransitionState === 'AUTH_SWITCHING' || authTransitionState === 'AUTH_RESTORING'),
    runtimeUiLocked: options.runtimeUiLocked ?? false,
    lastUpdate: Date.now(),
  })),
  releaseAuthTransition: () => set({ authTransitionState: 'AUTH_READY', authTransitionStartedAt: null, hydrationBarrierActive: false, runtimeUiLocked: false, lastUpdate: Date.now() }),
  resetHydrationBarrier: () => set({ hydrationBarrierActive: false, lastUpdate: Date.now() }),
  unlockRuntimeUI: () => set({ runtimeUiLocked: false, lastUpdate: Date.now() }),
  registerManager: (name) => set((state) => ({ 
    activeManagers: state.activeManagers.includes(name) 
      ? state.activeManagers 
      : [...state.activeManagers, name] 
  })),
  unregisterManager: (name) => set((state) => ({ 
    activeManagers: state.activeManagers.filter((m) => m !== name) 
  })),
  setEnvironmentState: (environmentState, environmentSnapshot) => set({
    environmentState,
    environmentSnapshot,
    lastUpdate: Date.now(),
  }),
}));
