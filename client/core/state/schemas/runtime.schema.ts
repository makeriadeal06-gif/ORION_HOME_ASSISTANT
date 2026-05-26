import type { EnvironmentSnapshot, EnvironmentState } from '@core/environment-runtime/types';

export enum RuntimeLifecycle {
  BOOTING = 'BOOTING',
  INITIALIZING = 'INITIALIZING',
  READY = 'READY',
  DEGRADED = 'DEGRADED',
  RECOVERING = 'RECOVERING',
  FAILED = 'FAILED'
}

export type AuthTransitionState = 'AUTH_SWITCHING' | 'AUTH_RESTORING' | 'AUTH_READY' | 'AUTH_FAILED' | 'PREVIEW_MODE';

export interface RuntimeState {
  lifecycle: RuntimeLifecycle;
  authTransitionState: AuthTransitionState;
  transitionOwnerId: string | null;
  authTransitionStartedAt: number | null;
  hydrationBarrierActive: boolean;
  runtimeUiLocked: boolean;
  lastUpdate: number;
  activeManagers: string[];
  environmentState: EnvironmentState | null;
  environmentSnapshot: EnvironmentSnapshot | null;
}
