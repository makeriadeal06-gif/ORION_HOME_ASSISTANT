import { logger } from '@core/logger/Logger';
import { runtimeIdentity } from '@core/runtime/RuntimeIdentity';
import { socketRuntime } from '@core/socket/SocketRuntime';
import { SocketStatus } from '@core/socket/SocketLifecycle';
import { triggerManager } from '@core/runtime/TriggerManager';
import { useAuthStore } from '@core/state/stores/useAuthStore';
import { useRuntimeStore } from '@core/state/stores/useRuntimeStore';
import { useVoiceStore } from '@core/voice-runtime/state/useVoiceStore';
import { VoiceState } from '@core/voice-runtime/types';
import {
  AndroidBridgeEvent,
  AndroidForegroundServicePayload,
  AndroidLifecycleState,
  AndroidPermissionState,
  AndroidRuntimeHealthSnapshot,
  AndroidRuntimeSnapshot,
} from './types';

const SNAPSHOT_STORAGE_KEY = 'orion.android.runtime.snapshot.v1';
const SNAPSHOT_BACKUP_STORAGE_KEY = 'orion.android.runtime.snapshot.backup.v1';

type ExecutionContinuityState = AndroidRuntimeSnapshot['continuity']['executionState'];
type RecoveryAction =
  | 'stt_restart'
  | 'playback_restart'
  | 'socket_reconnect'
  | 'socket_reset'
  | 'hydration_recovery'
  | 'foreground_recovery'
  | 'execution_guard'
  | 'audio_focus_recovery';

class AndroidRuntimeManager {
  private static instance: AndroidRuntimeManager;

  private initialized = false;
  private bootId = `android_rt_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private snapshot: AndroidRuntimeSnapshot = this.createSnapshot('BOOTING');
  private healthSnapshot: AndroidRuntimeHealthSnapshot = this.createHealthSnapshot();
  private lastStateLogKey = '';
  private lifecycleObserversAttached = false;
  private bridgeAttached = false;
  private authObserverAttached = false;
  private activeRecoveryActions = new Set<RecoveryAction>();
  private persistedChecksum = '';
  private persistQueued = false;
  private transitionInFlight: Promise<void> | null = null;
  private hydrationRetryAttempts = 0;
  private socketRecoveryAttempts = 0;
  private lastVoiceState = useVoiceStore.getState().state;
  private lastVoiceStateAt = Date.now();
  private lastTtsStartedAt = 0;
  private lastPlaybackRecoveredAt = 0;
  private lastSttRecoveredAt = 0;
  private lastSocketRecoveredAt = 0;
  private lastHydrationRecoveredAt = 0;
  private lastForegroundRecoveredAt = 0;
  private lastAudioInterruptionAt = 0;
  private lastRuntimeHeartbeatAt = Date.now();
  private pendingAudioResume = false;
  private pendingMicrophoneRecovery = false;

  private constructor() {}

  public static getInstance(): AndroidRuntimeManager {
    if (!AndroidRuntimeManager.instance) {
      AndroidRuntimeManager.instance = new AndroidRuntimeManager();
    }

    return AndroidRuntimeManager.instance;
  }

  public async init(): Promise<void> {
    if (this.initialized) {
      logger.warn('RUNTIME_INTEGRITY', 'android_runtime_init_blocked duplicate=true');
      return;
    }

    this.initialized = true;
    this.restoreSnapshot();
    this.attachBridge();
    this.attachLifecycleObservers();
    this.attachAuthObserver();
    this.attachVoiceStateObserver();
    await this.refreshPermissionState();
    await this.transitionLifecycle(this.getInitialLifecycleState(), 'init');
    this.startHeartbeat();
    this.startWatchdog();

    logger.info('ANDROID_RUNTIME', `boot_completed platform=${this.snapshot.platform} boot_id=${this.bootId}`);
  }

  public async shutdown(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }

    await this.updateForegroundService(false);
    this.persistSnapshot();
    logger.info('ANDROID_RUNTIME', 'shutdown_completed=true');
  }

  private createSnapshot(lifecycle: AndroidLifecycleState): AndroidRuntimeSnapshot {
    return {
      version: 1,
      updatedAt: Date.now(),
      bootId: this.bootId,
      ownerId: runtimeIdentity.getOwnerId() || 'preview',
      runtimeSessionId: runtimeIdentity.getRuntimeSessionId(),
      runtimeDeviceId: runtimeIdentity.getRuntimeDeviceId(),
      platform: this.isAndroidRuntime() ? 'android' : 'web',
      lifecycle,
      route: this.getRoute(),
      foregroundServiceActive: false,
      permissions: {
        microphone: 'unknown',
        notifications: 'unknown',
      },
      continuity: {
        lastActiveAt: Date.now(),
        lastRecoveryAt: null,
        executionState: this.getExecutionState(),
      },
    };
  }

  private createHealthSnapshot(): AndroidRuntimeHealthSnapshot {
    return {
      updatedAt: Date.now(),
      runtimeHealthy: true,
      degradedReason: null,
      checks: {
        sttFrozen: false,
        playbackStuck: false,
        executionStuck: false,
        socketDead: false,
        ttsUnresponsive: false,
        hydrationIncomplete: false,
        recoveryIncomplete: false,
      },
    };
  }

  private restoreSnapshot(): void {
    if (!runtimeIdentity.requiresAuthenticatedRuntime('android_restore_snapshot')) {
      logger.info('PREVIEW_RUNTIME', 'android_restore_snapshot skipped=true');
      return;
    }

    const restored = this.readStoredSnapshot(SNAPSHOT_STORAGE_KEY) || this.readStoredSnapshot(SNAPSHOT_BACKUP_STORAGE_KEY);
    if (!restored) {
      return;
    }

    this.snapshot = {
      ...restored,
      bootId: this.bootId,
      updatedAt: Date.now(),
      platform: this.isAndroidRuntime() ? 'android' : 'web',
      lifecycle: 'RECOVERING',
      continuity: {
        ...restored.continuity,
        lastRecoveryAt: Date.now(),
      },
    };

    logger.info(
      'ANDROID_RECOVERY',
      `snapshot_restored route=${this.snapshot.route} execution=${this.snapshot.continuity.executionState} last_active_at=${restored.continuity.lastActiveAt}`
    );
  }

  private readStoredSnapshot(key: string): AndroidRuntimeSnapshot | null {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as { checksum?: string; data?: AndroidRuntimeSnapshot };
      if (!parsed?.data || parsed.data.version !== 1 || !parsed.checksum) {
        logger.warn('PERSISTENCE_RUNTIME', `snapshot_invalid key=${key}`);
        return null;
      }

      if (!runtimeIdentity.recoveryOwnershipGuard('android_read_snapshot', {
        ownerId: parsed.data.ownerId,
        runtimeSessionId: parsed.data.runtimeSessionId,
        runtimeDeviceId: parsed.data.runtimeDeviceId,
        allowCrossSessionRestore: true,
      })) {
        logger.warn('PERSISTENCE_RUNTIME', `snapshot_scope_rejected key=${key}`);
        return null;
      }

      const expectedChecksum = this.computeChecksum(parsed.data);
      if (expectedChecksum !== parsed.checksum) {
        logger.warn('PERSISTENCE_RUNTIME', `snapshot_checksum_mismatch key=${key}`);
        return null;
      }

      this.persistedChecksum = parsed.checksum;
      logger.info('PERSISTENCE_RUNTIME', `snapshot_validated key=${key}`);
      return parsed.data;
    } catch (error: any) {
      logger.warn('ANDROID_RECOVERY', `snapshot_restore_failed key=${key} error=${error?.message || error}`);
      return null;
    }
  }

  private attachBridge(): void {
    if (this.bridgeAttached) {
      logger.warn('RUNTIME_INTEGRITY', 'bridge_attach_blocked duplicate=true');
      return;
    }

    this.bridgeAttached = true;
    window.__ORION_ANDROID_DISPATCH__ = (event: AndroidBridgeEvent) => {
      void this.handleBridgeEvent(event);
    };

    window.addEventListener('orion:android-event', ((nativeEvent: Event) => {
      const detail = (nativeEvent as CustomEvent<AndroidBridgeEvent>).detail;
      if (detail) {
        void this.handleBridgeEvent(detail);
      }
    }) as EventListener);

    logger.info('ANDROID_RUNTIME', `bridge_attached native=${Boolean(window.AndroidOrionBridge)}`);
  }

  private attachLifecycleObservers(): void {
    if (this.lifecycleObserversAttached) {
      logger.warn('RUNTIME_INTEGRITY', 'lifecycle_attach_blocked duplicate=true');
      return;
    }

    this.lifecycleObserversAttached = true;

    document.addEventListener('visibilitychange', () => {
      const nextState: AndroidLifecycleState = document.visibilityState === 'visible' ? 'ACTIVE' : 'BACKGROUND';
      void this.transitionLifecycle(nextState, 'visibilitychange');
    });

    window.addEventListener('focus', () => {
      void this.transitionLifecycle('ACTIVE', 'focus');
    });

    window.addEventListener('blur', () => {
      if (document.visibilityState !== 'hidden') {
        void this.transitionLifecycle('BACKGROUND', 'blur');
      }
    });

    window.addEventListener('pagehide', () => {
      void this.transitionLifecycle('SUSPENDED', 'pagehide');
    });

    window.addEventListener('pageshow', () => {
      void this.transitionLifecycle('ACTIVE', 'pageshow');
    });
  }

  private attachVoiceStateObserver(): void {
    useVoiceStore.subscribe((state) => {
      const nextVoiceState = state.state;
      if (nextVoiceState !== this.lastVoiceState) {
        this.lastVoiceState = nextVoiceState;
        this.lastVoiceStateAt = Date.now();
        this.snapshot.continuity.executionState = this.getExecutionState();
        if (nextVoiceState === VoiceState.SPEAKING) {
          this.lastTtsStartedAt = Date.now();
        }
        this.persistSnapshot();
      }
    });
  }

  private attachAuthObserver(): void {
    if (this.authObserverAttached) {
      return;
    }

    this.authObserverAttached = true;
    let previousOwnerId = useAuthStore.getState().user?.uid || null;
    useAuthStore.subscribe((state) => {
      const nextOwnerId = state.user?.uid || null;
      this.snapshot.ownerId = nextOwnerId || 'preview';
      this.snapshot.runtimeSessionId = runtimeIdentity.getRuntimeSessionId();
      this.snapshot.runtimeDeviceId = runtimeIdentity.getRuntimeDeviceId();
      previousOwnerId = nextOwnerId;
    });
  }

  private async handleBridgeEvent(event: AndroidBridgeEvent): Promise<void> {
    logger.info('ANDROID_RUNTIME', `bridge_event type=${event.type} action=${event.action}`);
    this.emitRuntimeContext(event.type, event.action, event.payload);

    if (event.type === 'lifecycle') {
      if (event.action === 'resume') {
        await this.transitionLifecycle('ACTIVE', 'native_resume');
      } else if (event.action === 'pause') {
        await this.transitionLifecycle('BACKGROUND', 'native_pause');
      }
      return;
    }

    if (event.type === 'permission') {
      await this.refreshPermissionState();
      return;
    }

    if (event.type === 'execution') {
      await this.handleExecutionCommand(event.action);
      return;
    }

    if (event.type === 'service') {
      logger.info('ANDROID_SERVICE', `native_service_event action=${event.action}`);
      if (event.action === 'service_lost') {
        await this.runRecovery('foreground_recovery', () => this.updateForegroundService(true));
      }
      return;
    }

    if (event.type === 'audio') {
      await this.handleAudioEvent(event.action);
      return;
    }

    if (event.type === 'connectivity') {
      await this.handleConnectivityEvent(event.action);
    }
  }

  private async handleExecutionCommand(action: string): Promise<void> {
    logger.info('ANDROID_EXECUTION', `bridge_command=${action}`);
    const { voiceRuntimeManager } = await import('@core/voice-runtime/VoiceRuntimeManager');

    if (action === 'push_to_talk_start') {
      voiceRuntimeManager.startListening();
      this.snapshot.continuity.executionState = 'listening';
      this.persistSnapshot();
      return;
    }

    if (action === 'push_to_talk_stop') {
      voiceRuntimeManager.stopListening();
      this.snapshot.continuity.executionState = this.getExecutionState();
      this.persistSnapshot();
      return;
    }

    if (action === 'interrupt') {
      voiceRuntimeManager.interrupt();
      this.snapshot.continuity.executionState = 'idle';
      this.persistSnapshot();
    }
  }

  private async handleAudioEvent(action: string): Promise<void> {
    const { voiceRuntimeManager } = await import('@core/voice-runtime/VoiceRuntimeManager');
    this.lastAudioInterruptionAt = Date.now();

    if (action === 'audio_focus_lost' || action === 'playback_interrupted') {
      logger.info('ANDROID_AUDIO', `focus_lost action=${action} execution=${this.getExecutionState()}`);
      if (this.getExecutionState() === 'speaking') {
        this.pendingAudioResume = true;
        voiceRuntimeManager.interrupt();
        logger.info('VOICE_RECOVERY', 'playback_interrupted_safe_stop=true');
      }
      return;
    }

    if (action === 'audio_focus_regained') {
      logger.info('ANDROID_AUDIO', `focus_regained pending_resume=${this.pendingAudioResume}`);
      if (this.pendingAudioResume) {
        this.pendingAudioResume = false;
        await this.runRecovery('audio_focus_recovery', async () => {
          if (this.snapshot.continuity.executionState === 'listening') {
            voiceRuntimeManager.startListening();
          }
        });
      }
      return;
    }

    if (action === 'microphone_lost') {
      logger.warn('ANDROID_AUDIO', 'microphone_lost=true');
      this.pendingMicrophoneRecovery = this.getExecutionState() === 'listening';
      voiceRuntimeManager.stopListening();
      return;
    }

    if (action === 'microphone_regained') {
      logger.info('ANDROID_AUDIO', `microphone_regained pending_recovery=${this.pendingMicrophoneRecovery}`);
      if (this.pendingMicrophoneRecovery) {
        this.pendingMicrophoneRecovery = false;
        await this.recoverStt('microphone_regained');
      }
    }
  }

  private async handleConnectivityEvent(action: string): Promise<void> {
    logger.info('CONNECTIVITY_RUNTIME', `bridge_connectivity action=${action}`);
    if (action === 'network_restored') {
      await this.recoverSocket('network_restored');
      await this.recoverHydration('network_restored');
    }
  }

  private async transitionLifecycle(nextState: AndroidLifecycleState, source: string): Promise<void> {
    if (this.transitionInFlight) {
      logger.info('RUNTIME_INTEGRITY', `transition_coalesced target=${nextState} source=${source}`);
      await this.transitionInFlight;
    }

    this.transitionInFlight = (async () => {
      const previous = this.snapshot.lifecycle;
      if (previous === nextState && source !== 'watchdog') {
        return;
      }

      this.snapshot.lifecycle = nextState;
      this.snapshot.route = this.getRoute();
      this.snapshot.updatedAt = Date.now();
      this.snapshot.continuity.lastActiveAt = Date.now();
      this.snapshot.continuity.executionState = this.getExecutionState();

      logger.info('ANDROID_LIFECYCLE', `transition ${previous} -> ${nextState} source=${source}`);
      this.emitRuntimeContext('lifecycle', nextState.toLowerCase(), { source, previous, nextState });

      const serviceShouldBeActive = nextState === 'ACTIVE' || nextState === 'BACKGROUND' || nextState === 'RECOVERING';
      await this.updateForegroundService(serviceShouldBeActive);
      await this.pushStateToNative();
      this.persistSnapshot();

      if (nextState === 'ACTIVE' || nextState === 'RECOVERING') {
        await this.recoverSocket(`lifecycle_${source}`);
        await this.recoverHydration(`lifecycle_${source}`);
      }
    })();

    try {
      await this.transitionInFlight;
    } finally {
      this.transitionInFlight = null;
    }
  }

  private async updateForegroundService(active: boolean): Promise<void> {
    const bridge = window.AndroidOrionBridge;
    const payload: AndroidForegroundServicePayload = {
      active,
      lifecycle: this.snapshot.lifecycle,
      route: this.getRoute(),
    };

    try {
      if (active) {
        await bridge?.startForegroundService?.(payload);
      } else {
        await bridge?.stopForegroundService?.();
      }

      this.snapshot.foregroundServiceActive = active;
      logger.info('ANDROID_SERVICE', `foreground_service active=${active} native=${Boolean(bridge)}`);
    } catch (error: any) {
      logger.warn('ANDROID_SERVICE', `foreground_service_failed active=${active} error=${error?.message || error}`);
    }
  }

  private async pushStateToNative(): Promise<void> {
    try {
      await window.AndroidOrionBridge?.updateRuntimeState?.(this.snapshot);
      this.logStateIfChanged('state_pushed');
    } catch (error: any) {
      logger.warn('ANDROID_STATE', `state_push_failed error=${error?.message || error}`);
    }
  }

  private async refreshPermissionState(): Promise<void> {
    const microphone = await this.resolvePermission('microphone');
    const notifications = await this.resolvePermission('notifications');

    this.snapshot.permissions.microphone = microphone;
    this.snapshot.permissions.notifications = notifications;
    this.snapshot.updatedAt = Date.now();

    logger.info('ANDROID_PERMISSIONS', `microphone=${microphone} notifications=${notifications}`);
    this.persistSnapshot();
  }

  private async resolvePermission(permission: 'microphone' | 'notifications'): Promise<AndroidPermissionState> {
    try {
      const nativeState = await window.AndroidOrionBridge?.getPermissionState?.(permission);
      if (nativeState) {
        return nativeState;
      }

      if (permission === 'notifications' && typeof Notification !== 'undefined') {
        return Notification.permission === 'default' ? 'prompt' : (Notification.permission as AndroidPermissionState);
      }

      if (navigator.permissions?.query) {
        const status = await navigator.permissions.query({ name: permission === 'microphone' ? 'microphone' : 'notifications' } as PermissionDescriptor);
        return status.state as AndroidPermissionState;
      }
    } catch (error: any) {
      logger.warn('ANDROID_PERMISSIONS', `permission_probe_failed permission=${permission} error=${error?.message || error}`);
    }

    return 'unknown';
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.snapshot.route = this.getRoute();
      this.snapshot.updatedAt = Date.now();
      this.snapshot.continuity.executionState = this.getExecutionState();
      this.lastRuntimeHeartbeatAt = Date.now();
      this.persistSnapshot();
      void this.pushStateToNative();
      logger.info('ANDROID_RUNTIME', `heartbeat lifecycle=${this.snapshot.lifecycle} execution=${this.snapshot.continuity.executionState}`);
    }, 60000);
  }

  private startWatchdog(): void {
    this.watchdogTimer = setInterval(() => {
      void this.runWatchdogPass();
    }, 10000);
  }

  private async runWatchdogPass(): Promise<void> {
    const now = Date.now();
    const voiceState = useVoiceStore.getState().state;
    const voiceDuration = now - this.lastVoiceStateAt;
    const socketHealth = socketRuntime.getHealthMetrics();
    const runtimeState = useRuntimeStore.getState();
    const authUser = useAuthStore.getState().user;
    const triggerConfig = triggerManager.getConfig();

    const checks = {
      sttFrozen: voiceState === VoiceState.LISTENING && voiceDuration > 30000,
      playbackStuck: voiceState === VoiceState.SPEAKING && voiceDuration > 45000,
      executionStuck: voiceState === VoiceState.PROCESSING && voiceDuration > 20000,
      socketDead: Boolean(authUser) && (socketHealth.status === SocketStatus.ERROR || (!socketHealth.connected && now - Math.max(socketHealth.lastDisconnectedAt || 0, socketHealth.lastConnectedAt || 0, this.snapshot.updatedAt) > 15000)),
      ttsUnresponsive: voiceState === VoiceState.SPEAKING && this.lastTtsStartedAt > 0 && now - this.lastTtsStartedAt > 12000 && voiceDuration > 12000,
      hydrationIncomplete: Boolean(authUser && triggerConfig?.hasToken && triggerManager.getDevices().length === 0 && this.snapshot.lifecycle !== 'BOOTING'),
      recoveryIncomplete: (this.snapshot.lifecycle === 'RECOVERING' && now - (this.snapshot.continuity.lastRecoveryAt || now) > 30000) || (runtimeState.lifecycle === 'DEGRADED' && now - runtimeState.lastUpdate > 15000),
    };

    const degradedReason =
      (checks.sttFrozen && 'stt_frozen') ||
      (checks.playbackStuck && 'playback_stuck') ||
      (checks.executionStuck && 'execution_stuck') ||
      (checks.socketDead && 'socket_dead') ||
      (checks.ttsUnresponsive && 'tts_unresponsive') ||
      (checks.hydrationIncomplete && 'hydration_incomplete') ||
      (checks.recoveryIncomplete && 'recovery_incomplete') ||
      null;

    this.healthSnapshot = {
      updatedAt: now,
      runtimeHealthy: !degradedReason,
      degradedReason,
      checks,
    };

    logger.info(
      'ANDROID_HEALTH',
      `healthy=${this.healthSnapshot.runtimeHealthy} degraded_reason=${degradedReason || 'none'} voice=${voiceState} socket=${socketHealth.status} runtime=${runtimeState.lifecycle}`
    );
    logger.info('ANDROID_WATCHDOG', `pass degraded=${Boolean(degradedReason)} active_recoveries=${this.activeRecoveryActions.size}`);

    if (checks.sttFrozen) {
      await this.recoverStt('watchdog_stt_frozen');
    }
    if (checks.playbackStuck || checks.ttsUnresponsive) {
      await this.recoverPlayback(checks.playbackStuck ? 'watchdog_playback_stuck' : 'watchdog_tts_unresponsive');
    }
    if (checks.executionStuck) {
      await this.recoverExecutionGuard('watchdog_execution_stuck');
    }
    if (checks.socketDead) {
      await this.recoverSocket('watchdog_socket_dead');
    }
    if (checks.hydrationIncomplete) {
      await this.recoverHydration('watchdog_hydration_incomplete');
    }
    if (checks.recoveryIncomplete || !this.snapshot.foregroundServiceActive && this.snapshot.lifecycle !== 'SUSPENDED') {
      await this.recoverForegroundLifecycle(checks.recoveryIncomplete ? 'watchdog_recovery_incomplete' : 'watchdog_service_missing');
    }
  }

  private async recoverStt(reason: string): Promise<void> {
    await this.runRecovery('stt_restart', async () => {
      const { voiceRuntimeManager } = await import('@core/voice-runtime/VoiceRuntimeManager');
      logger.warn('ANDROID_WATCHDOG', `stt_restart reason=${reason}`);
      voiceRuntimeManager.stopListening();
      if (this.snapshot.permissions.microphone !== 'denied') {
        voiceRuntimeManager.startListening();
      }
      this.lastSttRecoveredAt = Date.now();
      this.lastVoiceStateAt = Date.now();
      logger.info('VOICE_RECOVERY', `stt_recovered reason=${reason}`);
    });
  }

  private async recoverPlayback(reason: string): Promise<void> {
    await this.runRecovery('playback_restart', async () => {
      const { voiceRuntimeManager } = await import('@core/voice-runtime/VoiceRuntimeManager');
      logger.warn('ANDROID_WATCHDOG', `playback_restart reason=${reason}`);
      voiceRuntimeManager.interrupt();
      this.snapshot.continuity.executionState = 'idle';
      this.lastPlaybackRecoveredAt = Date.now();
      logger.info('VOICE_RECOVERY', `playback_recovered reason=${reason}`);
      this.persistSnapshot();
    });
  }

  private async recoverSocket(reason: string): Promise<void> {
    const now = Date.now();
    if (now - this.lastSocketRecoveredAt < Math.min(30000, 5000 * Math.max(1, this.socketRecoveryAttempts))) {
      logger.info('SOCKET_RECOVERY', `reconnect_skipped cooldown=true reason=${reason}`);
      return;
    }

    await this.runRecovery('socket_reconnect', async () => {
      this.socketRecoveryAttempts += 1;
      logger.warn('SOCKET_RECOVERY', `reconnect_start reason=${reason} attempt=${this.socketRecoveryAttempts}`);
      socketRuntime.reconnect(reason);
      await this.delay(1200);
      if (!socketRuntime.getHealthMetrics().connected) {
        await this.runRecovery('socket_reset', async () => {
          socketRuntime.resetStaleConnection(reason);
        });
      }
      this.lastSocketRecoveredAt = Date.now();
      logger.info('CONNECTIVITY_RUNTIME', `socket_recovery_complete connected=${socketRuntime.getHealthMetrics().connected}`);
    });
  }

  private async recoverHydration(reason: string): Promise<void> {
    const userId = triggerManager.getUserId();
    if (!userId) {
      return;
    }

    await this.runRecovery('hydration_recovery', async () => {
      this.hydrationRetryAttempts += 1;
      logger.warn('ANDROID_RECOVERY', `hydration_recovery_start reason=${reason} attempt=${this.hydrationRetryAttempts}`);
      const config = await triggerManager.loadConfig();
      if (config?.hasToken) {
        await triggerManager.syncDevices();
      }
      this.lastHydrationRecoveredAt = Date.now();
      logger.info(
        'ANDROID_RECOVERY',
        `hydration_recovery_complete devices=${triggerManager.getDevices().length} status=${triggerManager.getConnectionStatus()}`
      );
    });
  }

  private async recoverForegroundLifecycle(reason: string): Promise<void> {
    await this.runRecovery('foreground_recovery', async () => {
      logger.warn('ANDROID_WATCHDOG', `foreground_recovery reason=${reason}`);
      await this.updateForegroundService(this.snapshot.lifecycle !== 'SUSPENDED');
      if (this.snapshot.lifecycle === 'RECOVERING') {
        await this.transitionLifecycle('ACTIVE', 'watchdog');
      }
      this.lastForegroundRecoveredAt = Date.now();
      logger.info('ANDROID_RECOVERY', `foreground_recovery_complete reason=${reason}`);
    });
  }

  private async recoverExecutionGuard(reason: string): Promise<void> {
    await this.runRecovery('execution_guard', async () => {
      const { voiceRuntimeManager } = await import('@core/voice-runtime/VoiceRuntimeManager');
      logger.warn('ANDROID_WATCHDOG', `execution_guard reason=${reason}`);
      voiceRuntimeManager.interrupt();
      this.snapshot.continuity.executionState = 'idle';
      this.persistSnapshot();
      logger.info('ANDROID_RECOVERY', `execution_guard_complete reason=${reason}`);
    });
  }

  private async runRecovery(action: RecoveryAction, task: () => Promise<void>): Promise<void> {
    if (!runtimeIdentity.runtimeExecutionGuard(`android_recovery_${action}`, {
      ownerId: runtimeIdentity.getOwnerId(),
      runtimeSessionId: runtimeIdentity.getRuntimeSessionId(),
      runtimeDeviceId: runtimeIdentity.getRuntimeDeviceId(),
    })) {
      logger.info('PREVIEW_RUNTIME', `android_recovery_skipped action=${action}`);
      return;
    }

    if (this.activeRecoveryActions.has(action)) {
      logger.info('RUNTIME_INTEGRITY', `recovery_blocked action=${action} concurrent=true`);
      return;
    }

    this.activeRecoveryActions.add(action);
    this.snapshot.continuity.lastRecoveryAt = Date.now();
    try {
      await task();
    } catch (error: any) {
      logger.warn('ANDROID_RECOVERY', `recovery_failed action=${action} error=${error?.message || error}`);
    } finally {
      this.activeRecoveryActions.delete(action);
      this.persistSnapshot();
    }
  }

  private persistSnapshot(): void {
    if (!runtimeIdentity.requiresPersistentExecution('android_persist_snapshot')) {
      logger.info('PREVIEW_RUNTIME', 'android_snapshot_persist_skipped=true');
      return;
    }

    try {
      this.snapshot.ownerId = runtimeIdentity.getOwnerId() || 'preview';
      this.snapshot.runtimeSessionId = runtimeIdentity.getRuntimeSessionId();
      this.snapshot.runtimeDeviceId = runtimeIdentity.getRuntimeDeviceId();
      const payload = {
        checksum: this.computeChecksum(this.snapshot),
        data: this.snapshot,
      };
      const serialized = JSON.stringify(payload);
      if (payload.checksum === this.persistedChecksum && !this.persistQueued) {
        return;
      }

      window.localStorage.setItem(SNAPSHOT_BACKUP_STORAGE_KEY, serialized);
      window.localStorage.setItem(SNAPSHOT_STORAGE_KEY, serialized);
      this.persistedChecksum = payload.checksum;
      this.persistQueued = false;
      logger.info('PERSISTENCE_RUNTIME', `snapshot_committed checksum=${payload.checksum}`);
      this.logStateIfChanged('snapshot_saved');
    } catch (error: any) {
      this.persistQueued = true;
      logger.warn('PERSISTENCE_RUNTIME', `snapshot_save_failed error=${error?.message || error}`);
    }
  }

  private computeChecksum(snapshot: AndroidRuntimeSnapshot): string {
    const input = JSON.stringify(snapshot);
    let hash = 0;
    for (let index = 0; index < input.length; index += 1) {
      hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
    }
    return hash.toString(16);
  }

  private logStateIfChanged(source: 'snapshot_saved' | 'state_pushed'): void {
    const stateKey = `${this.snapshot.lifecycle}:${this.snapshot.route}:${this.snapshot.continuity.executionState}:${this.snapshot.foregroundServiceActive}:${this.snapshot.permissions.microphone}:${this.snapshot.permissions.notifications}`;
    if (stateKey === this.lastStateLogKey) {
      return;
    }

    this.lastStateLogKey = stateKey;
    logger.info(
      'ANDROID_STATE',
      `${source} lifecycle=${this.snapshot.lifecycle} route=${this.snapshot.route} execution=${this.snapshot.continuity.executionState} service=${this.snapshot.foregroundServiceActive}`
    );
  }

  private getInitialLifecycleState(): AndroidLifecycleState {
    if (this.snapshot.lifecycle === 'RECOVERING') {
      return 'RECOVERING';
    }

    return document.visibilityState === 'visible' ? 'ACTIVE' : 'BACKGROUND';
  }

  private getExecutionState(): ExecutionContinuityState {
    const state = useVoiceStore.getState().state;
    switch (state) {
      case VoiceState.LISTENING:
        return 'listening';
      case VoiceState.PROCESSING:
        return 'processing';
      case VoiceState.SPEAKING:
        return 'speaking';
      default:
        return 'idle';
    }
  }

  private getRoute(): string {
    return typeof window !== 'undefined' ? window.location.pathname : '/';
  }

  private isAndroidRuntime(): boolean {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return false;
    }

    return Boolean(window.AndroidOrionBridge) || /android/i.test(navigator.userAgent || '');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private emitRuntimeContext(type: string, action: string, payload?: Record<string, unknown>): void {
    window.dispatchEvent(new CustomEvent('orion:runtime-context', {
      detail: {
        type,
        action,
        payload,
      },
    }));
  }

  public getSnapshot(): AndroidRuntimeSnapshot {
    return JSON.parse(JSON.stringify(this.snapshot)) as AndroidRuntimeSnapshot;
  }
}

export const androidRuntimeManager = AndroidRuntimeManager.getInstance();
