import { logger } from '@core/logger/Logger';
import { useAuthStore, AuthState } from '@core/state/stores/useAuthStore';

const RUNTIME_DEVICE_ID_STORAGE_KEY = 'orion.runtime.device-id.v1';

type RuntimeScopeValidationInput = {
  ownerId?: string | null;
  runtimeSessionId?: string | null;
  runtimeDeviceId?: string | null;
  allowCrossSessionRestore?: boolean;
};

type RuntimeIdentitySnapshot = {
  ownerId: string | null;
  accountId: string | null;
  runtimeSessionId: string;
  runtimeDeviceId: string;
  authState: AuthState;
  authenticated: boolean;
  previewMode: boolean;
};

type RuntimeIdentityListener = (snapshot: RuntimeIdentitySnapshot, previousSnapshot: RuntimeIdentitySnapshot) => void;

class RuntimeIdentity {
  private static instance: RuntimeIdentity;

  private initialized = false;
  private listeners: RuntimeIdentityListener[] = [];
  private unsubscribeAuth: (() => void) | null = null;
  private runtimeDeviceId = '';
  private snapshot: RuntimeIdentitySnapshot = this.buildSnapshot(null, AuthState.IDLE);

  private constructor() {}

  public static getInstance(): RuntimeIdentity {
    if (!RuntimeIdentity.instance) {
      RuntimeIdentity.instance = new RuntimeIdentity();
    }

    return RuntimeIdentity.instance;
  }

  public init(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.runtimeDeviceId = this.restoreRuntimeDeviceId();

    let previousOwnerId = useAuthStore.getState().user?.uid || null;
    let previousAuthState = useAuthStore.getState().state;
    this.snapshot = this.buildSnapshot(previousOwnerId, previousAuthState);
    logger.info(
      'RUNTIME_AUTHORITY',
      `initialized owner=${previousOwnerId || 'preview'} session=${this.snapshot.runtimeSessionId} device=${this.snapshot.runtimeDeviceId} auth=${previousAuthState}`,
    );

    this.unsubscribeAuth = useAuthStore.subscribe((state) => {
      const nextOwnerId = state.user?.uid || null;
      const nextAuthState = state.state;
      if (nextOwnerId === previousOwnerId && nextAuthState === previousAuthState) {
        return;
      }

      if (nextOwnerId === previousOwnerId) {
        this.snapshot = {
          ...this.snapshot,
          authState: nextAuthState,
          authenticated: Boolean(nextOwnerId) && nextAuthState === AuthState.AUTHENTICATED,
          previewMode: !(Boolean(nextOwnerId) && nextAuthState === AuthState.AUTHENTICATED),
        };
        logger.info(
          'AUTH_TRANSITION',
          `auth_state_updated owner=${nextOwnerId || 'preview'} session_preserved=${this.snapshot.runtimeSessionId} auth=${nextAuthState}`,
        );
        previousAuthState = nextAuthState;
        return;
      }

      const previousSnapshot = this.snapshot;
      this.snapshot = this.buildSnapshot(nextOwnerId, nextAuthState);
      logger.info(
        'SESSION_RUNTIME',
        `session_rotated prev_owner=${previousOwnerId || 'preview'} next_owner=${nextOwnerId || 'preview'} session=${this.snapshot.runtimeSessionId} device=${this.snapshot.runtimeDeviceId} auth=${nextAuthState}`,
      );
      logger.info('PREVIEW_RUNTIME', `preview_mode=${String(!this.snapshot.authenticated)} owner=${nextOwnerId || 'preview'}`);
      for (const listener of this.listeners) {
        listener(this.snapshot, previousSnapshot);
      }
      previousOwnerId = nextOwnerId;
      previousAuthState = nextAuthState;
    });
  }

  public getSnapshot(): RuntimeIdentitySnapshot {
    return { ...this.snapshot };
  }

  public getOwnerId(): string | null {
    return this.snapshot.ownerId;
  }

  public getRuntimeSessionId(): string {
    return this.snapshot.runtimeSessionId;
  }

  public getRuntimeDeviceId(): string {
    return this.snapshot.runtimeDeviceId;
  }

  public getAuthState(): AuthState {
    return this.snapshot.authState;
  }

  public isAuthenticated(): boolean {
    return this.snapshot.authenticated;
  }

  public isPreviewMode(): boolean {
    return this.snapshot.previewMode;
  }

  public requiresAuthenticatedRuntime(reason: string): boolean {
    const allowed = this.snapshot.authenticated;
    if (!allowed) {
      logger.warn('AUTH_EXECUTION', `requires_authenticated_runtime blocked=true reason=${reason} auth=${this.snapshot.authState} owner=${this.snapshot.ownerId || 'preview'}`);
    }
    return allowed;
  }

  public runtimeExecutionGuard(reason: string, scope: RuntimeScopeValidationInput = {}): boolean {
    if (!this.requiresAuthenticatedRuntime(reason)) {
      logger.warn('EXECUTION_GUARD', `blocked=true reason=${reason} guard=unauthenticated`);
      return false;
    }

    if (scope.ownerId && scope.ownerId !== this.snapshot.ownerId) {
      logger.warn('OWNER_VALIDATION', `blocked=true reason=${reason} owner=${scope.ownerId} active=${this.snapshot.ownerId || 'preview'}`);
      return false;
    }

    if (scope.runtimeSessionId && scope.runtimeSessionId !== this.snapshot.runtimeSessionId) {
      logger.warn('RUNTIME_SCOPE', `blocked=true reason=${reason} session=${scope.runtimeSessionId} active=${this.snapshot.runtimeSessionId}`);
      return false;
    }

    if (scope.runtimeDeviceId && scope.runtimeDeviceId !== this.snapshot.runtimeDeviceId) {
      logger.warn('RUNTIME_SCOPE', `blocked=true reason=${reason} device=${scope.runtimeDeviceId} active=${this.snapshot.runtimeDeviceId}`);
      return false;
    }

    logger.info('EXECUTION_GUARD', `allowed=true reason=${reason} owner=${this.snapshot.ownerId} session=${this.snapshot.runtimeSessionId} device=${this.snapshot.runtimeDeviceId}`);
    return true;
  }

  public requiresPersistentExecution(reason: string): boolean {
    return this.runtimeExecutionGuard(reason, { ownerId: this.snapshot.ownerId });
  }

  public requiresExecutionPermission(reason: string, ownerId?: string | null): boolean {
    return this.runtimeExecutionGuard(reason, { ownerId });
  }

  public hydrationOwnerValidation(reason: string, scope: RuntimeScopeValidationInput = {}): boolean {
    if (!this.requiresAuthenticatedRuntime(reason)) {
      logger.warn('HYDRATION_GUARD', `blocked=true reason=${reason} guard=unauthenticated`);
      return false;
    }

    if (scope.ownerId && scope.ownerId !== this.snapshot.ownerId) {
      logger.warn('OWNER_VALIDATION', `blocked=true reason=${reason} owner=${scope.ownerId} active=${this.snapshot.ownerId || 'preview'}`);
      return false;
    }

    if (!scope.allowCrossSessionRestore && scope.runtimeSessionId && scope.runtimeSessionId !== this.snapshot.runtimeSessionId) {
      logger.warn('HYDRATION_GUARD', `blocked=true reason=${reason} session=${scope.runtimeSessionId} active=${this.snapshot.runtimeSessionId}`);
      return false;
    }

    if (scope.runtimeDeviceId && scope.runtimeDeviceId !== this.snapshot.runtimeDeviceId) {
      logger.warn('HYDRATION_GUARD', `blocked=true reason=${reason} device=${scope.runtimeDeviceId} active=${this.snapshot.runtimeDeviceId}`);
      return false;
    }

    logger.info('HYDRATION_GUARD', `allowed=true reason=${reason} owner=${this.snapshot.ownerId} session=${scope.runtimeSessionId || 'rebind'} device=${scope.runtimeDeviceId || 'rebind'}`);
    return true;
  }

  public sessionRecoveryValidation(reason: string, runtimeSessionId?: string | null): boolean {
    if (!this.requiresAuthenticatedRuntime(reason)) {
      logger.warn('SESSION_RECOVERY', `blocked=true reason=${reason} guard=unauthenticated`);
      return false;
    }

    if (!runtimeSessionId || !runtimeSessionId.trim()) {
      logger.warn('SESSION_RECOVERY', `blocked=true reason=${reason} guard=missing_session`);
      return false;
    }

    logger.info('SESSION_RECOVERY', `allowed=true reason=${reason} restored_session=${runtimeSessionId} active_session=${this.snapshot.runtimeSessionId}`);
    return true;
  }

  public recoveryOwnershipGuard(reason: string, scope: RuntimeScopeValidationInput = {}): boolean {
    if (!this.sessionRecoveryValidation(reason, scope.runtimeSessionId)) {
      return false;
    }

    const allowed = this.hydrationOwnerValidation(reason, scope);
    if (!allowed) {
      logger.warn('MULTI_TENANT_GUARD', `blocked=true reason=${reason}`);
    }
    return allowed;
  }

  public taskOwnershipGuard(reason: string, task: { ownerId?: string | null; runtimeSessionId?: string | null; runtimeDeviceId?: string | null }): boolean {
    const allowed = this.runtimeExecutionGuard(reason, {
      ownerId: task.ownerId,
      runtimeSessionId: task.runtimeSessionId,
      runtimeDeviceId: task.runtimeDeviceId,
    });
    if (!allowed) {
      logger.warn('MULTI_TENANT_GUARD', `blocked=true target=task reason=${reason}`);
    }
    return allowed;
  }

  public automationOwnershipGuard(reason: string, automation: { ownerId?: string | null; runtimeSessionId?: string | null; runtimeDeviceId?: string | null }): boolean {
    const allowed = this.runtimeExecutionGuard(reason, {
      ownerId: automation.ownerId,
      runtimeSessionId: automation.runtimeSessionId,
      runtimeDeviceId: automation.runtimeDeviceId,
    });
    if (!allowed) {
      logger.warn('MULTI_TENANT_GUARD', `blocked=true target=automation reason=${reason}`);
    }
    return allowed;
  }

  public orphanSnapshotCleanup(reason: string, namespaces: string[], ownerId?: string | null): void {
    const scopedOwnerId = ownerId || this.snapshot.ownerId;
    if (!scopedOwnerId) {
      return;
    }

    for (const namespace of namespaces) {
      try {
        window.localStorage.removeItem(`${namespace}_${scopedOwnerId}`);
        logger.info('ORPHAN_RUNTIME', `cleanup=true reason=${reason} owner=${scopedOwnerId} namespace=${namespace}`);
      } catch (error: any) {
        logger.warn('ORPHAN_RUNTIME', `cleanup_failed reason=${reason} owner=${scopedOwnerId} namespace=${namespace} error=${error?.message || error}`);
      }
    }
  }

  public subscribe(listener: RuntimeIdentityListener): () => void {
    this.listeners.push(listener);
    listener(this.getSnapshot(), this.getSnapshot());
    return () => {
      this.listeners = this.listeners.filter((entry) => entry !== listener);
    };
  }

  private buildSnapshot(ownerId: string | null, authState: AuthState): RuntimeIdentitySnapshot {
    const authenticated = Boolean(ownerId) && authState === AuthState.AUTHENTICATED;
    return {
      ownerId,
      accountId: ownerId,
      runtimeSessionId: `runtime_session_${ownerId || 'preview'}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      runtimeDeviceId: this.runtimeDeviceId || this.restoreRuntimeDeviceId(),
      authState,
      authenticated,
      previewMode: !authenticated,
    };
  }

  private restoreRuntimeDeviceId(): string {
    try {
      const restored = window.localStorage.getItem(RUNTIME_DEVICE_ID_STORAGE_KEY);
      if (restored) {
        return restored;
      }
    } catch {
      // Ignore storage failures and rotate a local device id.
    }

    const deviceId = `runtime_device_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
    try {
      window.localStorage.setItem(RUNTIME_DEVICE_ID_STORAGE_KEY, deviceId);
    } catch {
      // Ignore storage failures and keep the in-memory device id.
    }
    return deviceId;
  }
}

export const runtimeIdentity = RuntimeIdentity.getInstance();
