import { androidRuntimeManager } from '@core/android-runtime/AndroidRuntimeManager';
import { automationStoreService } from '@core/automation-runtime/AutomationStore';
import { logger } from '@core/logger/Logger';
import { runtimeIdentity } from '@core/runtime/RuntimeIdentity';
import { getScopedStorageKey } from '@core/runtime/ScopedBrowserStorage';
import { triggerManager } from '@core/runtime/TriggerManager';
import { socketRuntime } from '@core/socket/SocketRuntime';
import { RuntimeLifecycle } from '@core/state/schemas/runtime.schema';
import { useAuthStore } from '@core/state/stores/useAuthStore';
import { useRuntimeStore } from '@core/state/stores/useRuntimeStore';
import { useSystemStore } from '@core/state/stores/useSystemStore';
import { stateSync } from '@core/state/synchronization/StateSync';
import { taskRuntime } from '@core/task-runtime/TaskRuntime';
import type { VoiceProfile } from '@core/voice-runtime/types';
import {
  EnvironmentKind,
  EnvironmentSnapshot,
  EnvironmentState,
  EnvironmentVoiceProfileResolution,
  RuntimeCapabilityDescriptor,
  RuntimeCapabilityProfile,
  RuntimeQualityProfile,
} from './types';

const SNAPSHOT_STORAGE_KEY = 'orion.environment.runtime.snapshot.v1';
const SNAPSHOT_BACKUP_STORAGE_KEY = 'orion.environment.runtime.snapshot.backup.v1';
const DEVICE_IDENTITY_STORAGE_KEY = 'orion.environment.device.identity.v1';
const SNAPSHOT_TTL_MS = 12 * 60 * 60 * 1000;
const RECONNECT_COOLDOWN_MS = 8_000;
const RECOVERY_WINDOW_MS = 30_000;

type RuntimeContextEvent = {
  type?: string;
  action?: string;
  payload?: Record<string, unknown>;
};

type DeviceIdentityRecord = {
  deviceId: string;
  createdAt: number;
  lastSeenAt: number;
};

class EnvironmentRuntime {
  private static instance: EnvironmentRuntime;

  private initialized = false;
  private initializedAt = Date.now();
  private sessionId = `env_session_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  private reconnectCooldownUntil = 0;
  private lastRecoveredAt: number | null = null;
  private recoveryUntil = 0;
  private deviceId = '';
  private lastSnapshotKey = '';
  private lastMode = '';
  private lastQuality = '';
  private snapshot: EnvironmentSnapshot | null = null;
  private unsubscribeAuth: (() => void) | null = null;
  private unsubscribeRuntime: (() => void) | null = null;
  private unsubscribeTriggerStatus: (() => void) | null = null;
  private currentOwnerId: string | null = null;

  private constructor() {}

  public static getInstance(): EnvironmentRuntime {
    if (!EnvironmentRuntime.instance) {
      EnvironmentRuntime.instance = new EnvironmentRuntime();
    }

    return EnvironmentRuntime.instance;
  }

  public init(): void {
    if (this.initialized) {
      logger.warn('ENVIRONMENT_RUNTIME', 'environment_init_blocked duplicate=true');
      return;
    }

    this.initialized = true;
    this.currentOwnerId = runtimeIdentity.getOwnerId();
    this.restoreDeviceIdentity();
    this.restoreSnapshot();
    this.attachListeners();
    this.refresh('init');
    logger.info('ENVIRONMENT_RUNTIME', `initialized environment=${this.getState().environment} device=${this.deviceId}`);
  }

  public shutdown(): void {
    this.persist('shutdown');
    this.unsubscribeAuth?.();
    this.unsubscribeRuntime?.();
    this.unsubscribeTriggerStatus?.();
    this.unsubscribeAuth = null;
    this.unsubscribeRuntime = null;
    this.unsubscribeTriggerStatus = null;
    this.initialized = false;
  }

  public getState(): EnvironmentState {
    return this.snapshot?.state || this.buildState();
  }

  public getSnapshot(): EnvironmentSnapshot | null {
    return this.snapshot ? { ...this.snapshot, state: this.cloneState(this.snapshot.state) } : null;
  }

  public isOffline(): boolean {
    return this.getState().modes.offline;
  }

  public isDegraded(): boolean {
    const state = this.getState();
    return state.modes.degraded || state.modes.offline || state.modes.recovery;
  }

  public resolveVoiceProfile(profile: VoiceProfile): EnvironmentVoiceProfileResolution {
    const state = this.getState();
    if (
      profile.provider === 'elevenlabs'
      && (state.modes.offline || state.modes.degraded)
      && state.capabilities.browserSpeech.available
    ) {
      return {
        profile: {
          ...profile,
          id: `browser_fallback_${profile.id}`,
          name: `${profile.name} Browser Fallback`,
          provider: 'browser',
        },
        degraded: true,
        reason: state.modes.offline ? 'offline_voice_fallback' : 'degraded_voice_fallback',
      };
    }

    return {
      profile,
      degraded: false,
      reason: null,
    };
  }

  private restoreDeviceIdentity(): void {
    const authorityDeviceId = runtimeIdentity.getRuntimeDeviceId();
    if (authorityDeviceId) {
      this.deviceId = authorityDeviceId;
      this.persistDeviceIdentity(Date.now());
      logger.info('RUNTIME_AUTHORITY', `device_identity_bound device=${this.deviceId}`);
      return;
    }

    const environment = detectEnvironmentKind();

    try {
      const raw = window.localStorage.getItem(DEVICE_IDENTITY_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DeviceIdentityRecord;
        if (parsed?.deviceId && typeof parsed.createdAt === 'number') {
          this.deviceId = parsed.deviceId;
          this.persistDeviceIdentity(parsed.createdAt);
          logger.info('DEVICE_CONTEXT', `device_identity_restored device=${this.deviceId} environment=${environment}`);
          return;
        }
      }
    } catch (error: any) {
      logger.warn('DEVICE_CONTEXT', `device_identity_corrupted recovery=true error=${error?.message || error}`);
    }

    this.deviceId = `device_${environment}_${Math.random().toString(36).slice(2, 10)}`;
    this.persistDeviceIdentity(Date.now());
    logger.info('DEVICE_CONTEXT', `device_identity_created device=${this.deviceId} environment=${environment}`);
  }

  private persistDeviceIdentity(createdAt: number): void {
    try {
      const payload: DeviceIdentityRecord = {
        deviceId: this.deviceId,
        createdAt,
        lastSeenAt: Date.now(),
      };
      window.localStorage.setItem(DEVICE_IDENTITY_STORAGE_KEY, JSON.stringify(payload));
    } catch (error: any) {
      logger.warn('DEVICE_CONTEXT', `device_identity_persist_failed error=${error?.message || error}`);
    }
  }

  private restoreSnapshot(): void {
    if (!runtimeIdentity.requiresAuthenticatedRuntime('environment_restore_snapshot')) {
      this.snapshot = null;
      logger.info('USER_RUNTIME', 'environment_preview_mode restore_skipped=true');
      return;
    }

    const restored = this.readSnapshot(SNAPSHOT_STORAGE_KEY) || this.readSnapshot(SNAPSHOT_BACKUP_STORAGE_KEY);
    if (!restored) {
      return;
    }

    if (!runtimeIdentity.recoveryOwnershipGuard('environment_restore_snapshot', {
      ownerId: restored.ownerId,
      runtimeSessionId: restored.runtimeSessionId,
      runtimeDeviceId: restored.runtimeDeviceId,
      allowCrossSessionRestore: true,
    })) {
      runtimeIdentity.orphanSnapshotCleanup('environment_restore_snapshot_rejected', [SNAPSHOT_STORAGE_KEY, SNAPSHOT_BACKUP_STORAGE_KEY], this.currentOwnerId);
      return;
    }

    this.lastRecoveredAt = restored.state.continuity.lastRecoveredAt || Date.now();
    this.recoveryUntil = Date.now() + RECOVERY_WINDOW_MS;
    this.snapshot = {
      ...restored,
      ownerId: this.currentOwnerId ?? restored.ownerId,
      runtimeSessionId: runtimeIdentity.getRuntimeSessionId(),
      persistedAt: Date.now(),
      expiresAt: Date.now() + SNAPSHOT_TTL_MS,
      state: {
        ...restored.state,
        initializedAt: this.initializedAt,
        updatedAt: Date.now(),
        deviceSession: {
          ...restored.state.deviceSession,
          sessionId: this.sessionId,
          activeDeviceId: this.deviceId,
        },
      },
    };
    logger.info('SESSION_CONTINUITY', `environment_snapshot_restored device=${this.deviceId} mode=${restored.state.activeMode}`);
  }

  private readSnapshot(key: string): EnvironmentSnapshot | null {
    try {
      const scopedKey = getScopedStorageKey(key, this.currentOwnerId);
      if (!scopedKey) {
        return null;
      }
      const raw = window.localStorage.getItem(scopedKey);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as EnvironmentSnapshot;
      if (!isValidSnapshot(parsed)) {
        logger.warn('ENVIRONMENT_RECOVERY', `environment_snapshot_invalid key=${scopedKey}`);
        window.localStorage.removeItem(scopedKey);
        return null;
      }

      if (!runtimeIdentity.hydrationOwnerValidation('environment_read_snapshot', {
        ownerId: parsed.ownerId,
        runtimeSessionId: parsed.runtimeSessionId,
        runtimeDeviceId: parsed.runtimeDeviceId,
        allowCrossSessionRestore: true,
      })) {
        logger.warn('SESSION_ISOLATION', `environment_snapshot_scope_rejected key=${scopedKey} owner=${parsed.ownerId} active=${this.currentOwnerId || 'preview'}`);
        return null;
      }

      if (parsed.expiresAt < Date.now()) {
        logger.warn('ENVIRONMENT_RECOVERY', `stale_environment_snapshot_cleanup key=${scopedKey}`);
        window.localStorage.removeItem(scopedKey);
        return null;
      }

      if (computeChecksum(parsed.state) !== parsed.checksum) {
        logger.warn('ENVIRONMENT_RECOVERY', `environment_snapshot_checksum_mismatch key=${scopedKey}`);
        window.localStorage.removeItem(scopedKey);
        return null;
      }

      return parsed;
    } catch (error: any) {
      logger.warn('ENVIRONMENT_RECOVERY', `environment_corruption_recovery key=${key} error=${error?.message || error}`);
      return null;
    }
  }

  private attachListeners(): void {
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    window.addEventListener('focus', this.handleFocus);
    window.addEventListener('blur', this.handleBlur);
    window.addEventListener('pageshow', this.handlePageShow);
    window.addEventListener('pagehide', this.handlePageHide);
    window.addEventListener('beforeunload', this.handleBeforeUnload);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('orion:runtime-context', this.handleRuntimeContext as EventListener);

    let previousOwnerId = this.currentOwnerId;
    let previousAuthState = useAuthStore.getState().state;
    let pendingAuthTransition = false;
    this.unsubscribeAuth = useAuthStore.subscribe((state) => {
      const nextOwnerId = state.user?.uid || null;
      const nextAuthState = state.state;
      if (nextAuthState === 'AUTHENTICATING' || nextAuthState === 'RESTORING_SESSION') {
        pendingAuthTransition = true;
        logger.info('AUTH_TRANSITION', `environment_transition_wait auth=${nextAuthState} owner=${previousOwnerId || 'preview'}`);
        previousAuthState = nextAuthState;
        return;
      }

      if (nextOwnerId !== previousOwnerId) {
        this.handleOwnerChange(previousOwnerId, nextOwnerId);
        previousOwnerId = nextOwnerId;
        previousAuthState = nextAuthState;
        return;
      }
      if (pendingAuthTransition) {
        pendingAuthTransition = false;
        this.refresh('auth_resume');
        previousAuthState = nextAuthState;
        logger.info('HYDRATION_RUNTIME', `environment_runtime_resumed owner=${nextOwnerId || 'preview'} auth=${nextAuthState}`);
        return;
      }
      this.refresh('auth_change');
    });
    this.unsubscribeRuntime = useRuntimeStore.subscribe((state, previousState) => {
      if (state.lifecycle !== previousState.lifecycle) {
        this.refresh(`runtime_${String(state.lifecycle).toLowerCase()}`);
      }
    });
    this.unsubscribeTriggerStatus = triggerManager.subscribeStatus(() => {
      this.refresh('trigger_status');
    });
  }

  private readonly handleOnline = (): void => {
    logger.info('OFFLINE_RUNTIME', 'connectivity_restored=true');
    this.revalidateRuntime('online');
  };

  private readonly handleOffline = (): void => {
    this.refresh('offline');
    this.dispatchRuntimeContext('environment_offline', { deviceId: this.deviceId });
    logger.warn('OFFLINE_RUNTIME', 'connectivity_lost=true');
  };

  private readonly handleFocus = (): void => {
    this.refresh('focus');
  };

  private readonly handleBlur = (): void => {
    this.refresh('blur');
  };

  private readonly handlePageShow = (): void => {
    this.revalidateRuntime('pageshow');
  };

  private readonly handlePageHide = (): void => {
    this.persist('pagehide');
  };

  private readonly handleBeforeUnload = (): void => {
    this.persist('beforeunload');
  };

  private readonly handleVisibilityChange = (): void => {
    this.refresh(document.visibilityState === 'visible' ? 'visible' : 'hidden');
  };

  private readonly handleRuntimeContext = (nativeEvent: Event): void => {
    const detail = (nativeEvent as CustomEvent<RuntimeContextEvent>).detail;
    if (!detail?.action) {
      return;
    }

    if (detail.action === 'recovery') {
      this.lastRecoveredAt = Date.now();
      this.recoveryUntil = Date.now() + RECOVERY_WINDOW_MS;
    }

    if (detail.action === 'socket_disconnected') {
      this.reconnectCooldownUntil = Math.max(this.reconnectCooldownUntil, Date.now() + 2_000);
    }

    this.refresh(`runtime_context_${detail.action}`);
  };

  private revalidateRuntime(reason: string): void {
    if (!runtimeIdentity.runtimeExecutionGuard(`environment_revalidate_${reason}`, {
      ownerId: this.currentOwnerId,
      runtimeDeviceId: runtimeIdentity.getRuntimeDeviceId(),
    })) {
      logger.info('PREVIEW_RUNTIME', `environment_revalidate_skipped reason=${reason}`);
      return;
    }

    this.refresh(`revalidate_${reason}`);
    const state = this.getState();
    if (!state.coordination.reconnectEligible) {
      logger.info('ENVIRONMENT_RECOVERY', `reconnect_skipped reason=${reason} eligible=false`);
      return;
    }

    this.reconnectCooldownUntil = Date.now() + RECONNECT_COOLDOWN_MS;
    socketRuntime.reconnect(`environment_${reason}`);
    this.lastRecoveredAt = Date.now();
    this.recoveryUntil = Date.now() + RECOVERY_WINDOW_MS;
    this.dispatchRuntimeContext('environment_reconnect', { reason, deviceId: this.deviceId });
    logger.info('ENVIRONMENT_RECOVERY', `contextual_reconnect reason=${reason} cooldown_ms=${RECONNECT_COOLDOWN_MS}`);
    this.refresh(`reconnect_${reason}`);
  }

  private refresh(reason: string): void {
    const state = this.buildState();
    const snapshotKey = JSON.stringify(state);
    if (snapshotKey === this.lastSnapshotKey && reason !== 'init') {
      return;
    }

    const previousMode = this.snapshot?.state.activeMode || this.lastMode;
    const previousQuality = this.snapshot?.state.runtimeQuality.profile || this.lastQuality;
    this.lastSnapshotKey = snapshotKey;
    this.lastMode = state.activeMode;
    this.lastQuality = state.runtimeQuality.profile;
    this.snapshot = this.createSnapshot(state);

    stateSync.updateEnvironmentState(state, this.snapshot);
    this.persist(reason);

    logger.info('ENVIRONMENT_PROFILE', `reason=${reason} environment=${state.environment} mode=${state.activeMode} quality=${state.runtimeQuality.profile}`);
    logger.info('RUNTIME_HEALTH', `classification=${state.health.classification} score=${state.health.operationalScore} critical_capabilities=${state.health.criticalCapabilitiesHealthy}`);
    logger.info('RUNTIME_CAPABILITIES', `microphone=${state.capabilities.microphone.state} browser_speech=${state.capabilities.browserSpeech.state} elevenlabs=${state.capabilities.elevenLabsAvailability.state} websocket=${state.capabilities.websocketConnectivity.state}`);
    logger.info('DEVICE_STATE', `device=${state.deviceSession.activeDeviceId} session=${state.deviceSession.sessionId} user=${state.deviceSession.userId || 'guest'} tasks=${state.activeTaskCount} automations=${state.activeAutomationCount}`);
    logger.info('CONTEXT_COORDINATION', `voice_mode=${state.coordination.voiceMode} automation_mode=${state.coordination.automationMode} online=${state.coordination.connectivityOnline} trigger=${state.coordination.triggerCmdStatus}`);

    if (state.activeMode === 'background') {
      logger.info('BACKGROUND_RUNTIME', `healthy_background=true low_focus=${state.modes.lowFocus}`);
    }

    if (state.modes.degraded || state.modes.offline) {
      logger.warn('DEGRADED_RUNTIME', `reason=${state.runtimeQuality.reason} limitations=${state.limitations.join('|') || 'none'}`);
    }

    if (state.modes.offline) {
      logger.warn('OFFLINE_RUNTIME', `voice_mode=${state.coordination.voiceMode} automation_mode=${state.coordination.automationMode}`);
    }

    if (previousMode !== state.activeMode || previousQuality !== state.runtimeQuality.profile) {
      logger.info('ENVIRONMENT_TRANSITION', `mode=${previousMode || 'none'}->${state.activeMode} quality=${previousQuality || 'none'}->${state.runtimeQuality.profile} reason=${reason}`);
      this.dispatchRuntimeContext('environment_state_changed', {
        mode: state.activeMode,
        quality: state.runtimeQuality.profile,
        reason,
      });
      logger.info('MULTI_ENVIRONMENT', `transition mode=${previousMode || 'none'}->${state.activeMode} quality=${previousQuality || 'none'}->${state.runtimeQuality.profile}`);
    }
  }

  private buildState(): EnvironmentState {
    const environment = detectEnvironmentKind();
    const runtimeLifecycle = useRuntimeStore.getState().lifecycle;
    const socketHealth = socketRuntime.getHealthMetrics();
    const triggerStatus = triggerManager.getConnectionStatus();
    const currentView = useSystemStore.getState().currentView;
    const route = typeof window !== 'undefined' ? window.location.pathname : '/';
    const userId = useAuthStore.getState().user?.uid || null;
    const online = navigator.onLine;
    const androidSnapshot = androidRuntimeManager.getSnapshot?.() || null;
    const tasks = taskRuntime.getTasks();
    const automations = automationStoreService.listAutomations();
    const activeTaskIds = tasks
      .filter((task) => !['completed', 'failed', 'cancelled', 'expired'].includes(task.status))
      .map((task) => task.taskId)
      .slice(0, 20);
    const activeAutomationIds = automations
      .filter((automation) => automation.enabled && ['running', 'waiting', 'scheduled'].includes(automation.state))
      .map((automation) => automation.id)
      .slice(0, 20);
    const capabilities = this.buildCapabilities(environment, online, socketHealth.connected, triggerStatus);
    const modes = {
      background: document.visibilityState !== 'visible' || ['BACKGROUND', 'SUSPENDED'].includes(androidSnapshot?.lifecycle || ''),
      lowFocus: document.visibilityState === 'visible' && !document.hasFocus(),
      degraded: false,
      offline: !online,
      recovery: runtimeLifecycle === RuntimeLifecycle.RECOVERING || (androidSnapshot?.lifecycle === 'RECOVERING') || this.recoveryUntil > Date.now(),
    };

    const criticalCapabilitiesHealthy = capabilities.microphone.available && capabilities.browserSpeech.available;
    const providerAvailable = online || capabilities.browserSpeech.available;
    const voiceMode = modes.offline
      ? (capabilities.browserSpeech.available ? 'degraded' : 'offline')
      : (capabilities.elevenLabsAvailability.available ? 'full' : (capabilities.browserSpeech.available ? 'degraded' : 'offline'));
    const automationMode = (!modes.offline && socketHealth.connected) ? 'full' : 'degraded';
    const limitations = buildLimitations(capabilities, modes.offline);
    const operationalFailure = !modes.offline && (
      !socketHealth.connected
      || runtimeLifecycle === RuntimeLifecycle.DEGRADED
      || !criticalCapabilitiesHealthy
      || !providerAvailable
    );
    modes.degraded = operationalFailure;
    const activeMode = resolveActiveMode(modes);
    const runtimeQuality = resolveRuntimeQuality(activeMode, limitations.length, socketHealth.connected);
    const health = {
      classification: activeMode === 'recovery'
        ? 'recovering'
        : activeMode === 'offline'
          ? 'offline'
          : activeMode === 'degraded'
            ? 'degraded'
            : activeMode === 'background'
              ? 'background'
              : 'healthy',
      operationalScore: runtimeQuality.score,
      criticalCapabilitiesHealthy,
    } as EnvironmentState['health'];

    logger.info('ENVIRONMENT_POLICY', `background=${modes.background} low_focus=${modes.lowFocus} degraded=${modes.degraded} offline=${modes.offline} recovery=${modes.recovery}`);
    logger.info('ENVIRONMENT_CORRECTION', `background_isolated_from_degraded=${String(modes.background && !modes.degraded)}`);

    return {
      initializedAt: this.initializedAt,
      updatedAt: Date.now(),
      environment,
      activeMode,
      modes,
      deviceSession: {
        sessionId: this.sessionId,
        activeDeviceId: this.deviceId,
        userId,
        continuityKey: `${this.deviceId}:${userId || 'guest'}`,
        currentEnvironment: environment,
        multiDeviceReady: true,
      },
      capabilities,
      runtimeQuality,
      health,
      limitations,
      coordination: {
        connectivityOnline: online,
        websocketConnected: socketHealth.connected,
        triggerCmdStatus: triggerStatus,
        voiceMode,
        automationMode,
        reconnectEligible: online && !socketHealth.connected && Date.now() >= this.reconnectCooldownUntil,
      },
      continuity: {
        lastRoute: route,
        lastView: currentView,
        activeTaskIds,
        activeAutomationIds,
        lastRecoveredAt: this.lastRecoveredAt,
      },
      activeTaskCount: activeTaskIds.length,
      activeAutomationCount: activeAutomationIds.length,
      runtimeSingleInstance: true,
    };
  }

  private buildCapabilities(
    environment: EnvironmentKind,
    online: boolean,
    websocketConnected: boolean,
    triggerStatus: string,
  ): RuntimeCapabilityProfile {
    const now = Date.now();
    const browserSpeechAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;
    const microphoneAvailable = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
    const notificationSupported = typeof window !== 'undefined' && 'Notification' in window;
    const notificationPermission = notificationSupported ? Notification.permission : 'unsupported';
    const embedded = environment === 'embedded_webview';
    const backgroundCapable = environment === 'android' || environment === 'mobile_web' || embedded || isStandaloneDisplayMode();
    const localExecutionAvailable = environment === 'desktop' || environment === 'android' || environment === 'browser' || environment === 'embedded_webview';

    return {
      microphone: capability(now, microphoneAvailable ? 'available' : 'unavailable', microphoneAvailable ? 'ready' : 'media_devices_missing'),
      notifications: capability(
        now,
        !notificationSupported ? 'unavailable' : (notificationPermission === 'granted' ? 'available' : 'degraded'),
        notificationSupported ? notificationPermission : 'unsupported',
      ),
      localExecution: capability(now, localExecutionAvailable ? 'available' : 'degraded', environment),
      triggerCmdAvailability: capability(
        now,
        triggerStatus === 'connected' ? 'available' : (triggerStatus === 'syncing' || triggerStatus === 'disconnected' ? 'degraded' : 'unavailable'),
        triggerStatus,
      ),
      browserSpeech: capability(now, browserSpeechAvailable ? 'available' : 'unavailable', browserSpeechAvailable ? 'ready' : 'speech_synthesis_missing'),
      elevenLabsAvailability: capability(now, online ? 'available' : 'unavailable', online ? 'network_ready' : 'offline'),
      backgroundExecution: capability(now, backgroundCapable ? 'available' : 'degraded', backgroundCapable ? 'supported' : 'limited_foreground_only'),
      automationExecution: capability(now, 'available', 'local_runtime_ready'),
      websocketConnectivity: capability(now, websocketConnected ? 'available' : (online ? 'degraded' : 'unavailable'), websocketConnected ? 'connected' : (online ? 'reconnecting' : 'offline')),
    };
  }

  private createSnapshot(state: EnvironmentState): EnvironmentSnapshot {
    return {
      version: 1,
      ownerId: this.currentOwnerId || 'preview',
      runtimeSessionId: runtimeIdentity.getRuntimeSessionId(),
      runtimeDeviceId: runtimeIdentity.getRuntimeDeviceId(),
      persistedAt: Date.now(),
      expiresAt: Date.now() + SNAPSHOT_TTL_MS,
      checksum: computeChecksum(state),
      state,
    };
  }

  private persist(reason: string): void {
    if (!this.snapshot || !runtimeIdentity.requiresPersistentExecution(`environment_persist_${reason}`) || !this.currentOwnerId) {
      return;
    }

    try {
      const payload = JSON.stringify(this.snapshot);
      const primaryKey = getScopedStorageKey(SNAPSHOT_STORAGE_KEY, this.currentOwnerId);
      const backupKey = getScopedStorageKey(SNAPSHOT_BACKUP_STORAGE_KEY, this.currentOwnerId);
      if (!primaryKey || !backupKey) {
        return;
      }
      window.localStorage.setItem(primaryKey, payload);
      window.localStorage.setItem(backupKey, payload);
      logger.info('SESSION_CONTINUITY', `environment_snapshot_persisted reason=${reason}`);
    } catch (error: any) {
      logger.warn('SESSION_CONTINUITY', `environment_serialization_guard reason=${reason} error=${error?.message || error}`);
    }
  }

  private handleOwnerChange(previousOwnerId: string | null, nextOwnerId: string | null): void {
    logger.info('SESSION_ISOLATION', `environment_owner_change prev=${previousOwnerId || 'preview'} next=${nextOwnerId || 'preview'}`);
    this.currentOwnerId = nextOwnerId;
    this.snapshot = null;
    this.lastSnapshotKey = '';
    this.lastMode = '';
    this.lastQuality = '';
    this.reconnectCooldownUntil = 0;
    this.restoreSnapshot();
    this.refresh('owner_change');
  }

  private dispatchRuntimeContext(action: string, payload?: Record<string, unknown>): void {
    window.dispatchEvent(new CustomEvent('orion:runtime-context', {
      detail: {
        type: 'environment',
        action,
        payload,
      },
    }));
  }

  private cloneState(state: EnvironmentState): EnvironmentState {
    return {
      ...state,
      modes: { ...state.modes },
      deviceSession: { ...state.deviceSession },
      capabilities: { ...state.capabilities },
      runtimeQuality: { ...state.runtimeQuality },
      health: { ...state.health },
      limitations: [...state.limitations],
      coordination: { ...state.coordination },
      continuity: {
        ...state.continuity,
        activeTaskIds: [...state.continuity.activeTaskIds],
        activeAutomationIds: [...state.continuity.activeAutomationIds],
      },
    };
  }
}

function detectEnvironmentKind(): EnvironmentKind {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
  const androidBridge = typeof window !== 'undefined' && Boolean((window as Window & { AndroidOrionBridge?: unknown }).AndroidOrionBridge);
  const embedded = androidBridge || userAgent.includes(' wv') || userAgent.includes('; wv') || userAgent.includes('webview') || window.self !== window.top;
  const mobile = /android|iphone|ipad|ipod|mobile/i.test(userAgent);

  if (embedded) return 'embedded_webview';
  if (androidBridge || userAgent.includes('android')) return 'android';
  if (mobile) return 'mobile_web';
  if (typeof window !== 'undefined' && window.innerWidth >= 1024) return 'desktop';
  return 'browser';
}

function isStandaloneDisplayMode(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(display-mode: standalone)').matches);
}

function capability(lastCheckedAt: number, state: RuntimeCapabilityDescriptor['state'], detail: string): RuntimeCapabilityDescriptor {
  return {
    available: state === 'available',
    state,
    detail,
    lastCheckedAt,
  };
}

function resolveActiveMode(modes: EnvironmentState['modes']): EnvironmentState['activeMode'] {
  if (modes.recovery) return 'recovery';
  if (modes.offline) return 'offline';
  if (modes.degraded) return 'degraded';
  if (modes.background) return 'background';
  return 'active';
}

function resolveRuntimeQuality(
  mode: EnvironmentState['activeMode'],
  limitationCount: number,
  websocketConnected: boolean,
): EnvironmentState['runtimeQuality'] {
  let profile: RuntimeQualityProfile = 'stable';
  let score = 82;
  let reason = 'steady_runtime';

  if (mode === 'recovery') {
    profile = 'recovering';
    score = 42;
    reason = 'runtime_recovery_active';
  } else if (mode === 'offline') {
    profile = 'offline';
    score = 34;
    reason = 'offline_mode_active';
  } else if (mode === 'degraded') {
    profile = 'degraded';
    score = 56;
    reason = websocketConnected ? 'capability_degraded' : 'websocket_degraded';
  } else if (mode === 'background') {
    profile = 'limited';
    score = 68;
    reason = 'background_mode';
  } else if (limitationCount === 0) {
    profile = 'optimal';
    score = 96;
    reason = 'all_capabilities_ready';
  }

  return { profile, score, reason };
}

function buildLimitations(capabilities: RuntimeCapabilityProfile, offline: boolean): string[] {
  const limitations: string[] = [];
  if (offline) limitations.push('offline_connectivity');
  if (!capabilities.websocketConnectivity.available) limitations.push(`websocket_${capabilities.websocketConnectivity.detail}`);
  if (!capabilities.triggerCmdAvailability.available) limitations.push(`triggercmd_${capabilities.triggerCmdAvailability.detail}`);
  if (!capabilities.elevenLabsAvailability.available) limitations.push(`elevenlabs_${capabilities.elevenLabsAvailability.detail}`);
  if (!capabilities.microphone.available) limitations.push(`microphone_${capabilities.microphone.detail}`);
  return limitations;
}

function isValidSnapshot(snapshot: EnvironmentSnapshot | null | undefined): snapshot is EnvironmentSnapshot {
  return Boolean(
    snapshot
    && snapshot.version === 1
    && typeof snapshot.ownerId === 'string'
    && typeof snapshot.runtimeSessionId === 'string'
    && snapshot.state
    && typeof snapshot.persistedAt === 'number'
    && typeof snapshot.expiresAt === 'number'
    && typeof snapshot.checksum === 'string'
  );
}

function computeChecksum(state: EnvironmentState): string {
  const raw = JSON.stringify(state);
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(index);
    hash |= 0;
  }
  return String(hash);
}

export const environmentRuntime = EnvironmentRuntime.getInstance();
