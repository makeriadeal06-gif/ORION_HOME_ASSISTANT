import { androidRuntimeManager } from '@core/android-runtime/AndroidRuntimeManager';
import { automationStoreService } from '@core/automation-runtime/AutomationStore';
import { environmentRuntime } from '@core/environment-runtime/EnvironmentRuntime';
import { logger } from '@core/logger/Logger';
import { runtimeIdentity } from '@core/runtime/RuntimeIdentity';
import { getScopedStorageKey, getScopedStorageValue, removeScopedStorageValue, setScopedStorageValue } from '@core/runtime/ScopedBrowserStorage';
import { socketRuntime } from '@core/socket/SocketRuntime';
import { useAuthStore } from '@core/state/stores/useAuthStore';
import { useSystemStore } from '@core/state/stores/useSystemStore';
import { taskRuntime } from '@core/task-runtime/TaskRuntime';
import { useVoiceStore } from '@core/voice-runtime/state/useVoiceStore';
import { VoiceState } from '@core/voice-runtime/types';
import { usePresenceStore } from './state/usePresenceStore';
import {
  ConversationChainSnapshot,
  OrionBehaviorMode,
  OrionPresenceState,
  PresenceContextSnapshot,
  PresenceRecoverySnapshot,
  RecentCommandContext,
  ResponseStyleProfile,
} from './types';

const PRESENCE_STORAGE_KEY = 'orion.presence.snapshot.v1';
const PRESENCE_CHAIN_TTL_MS = 90_000;
const SNAPSHOT_INTERVAL_MS = 15_000;
const CONTEXT_WINDOW_LIMIT = 8;
const BEHAVIOR_MODE_STORAGE_KEY = 'orion.behavior.mode';
const FOCUS_MODE_STORAGE_KEY = 'orion.local.mode.focus';

class PresenceRuntime {
  private static instance: PresenceRuntime;

  private initialized = false;
  private snapshotInterval: number | null = null;
  private duplicateSnapshotKey = '';
  private lastInputAt = Date.now();
  private manualStateUntil = 0;
  private contextListenerAttached = false;
  private batteryLevelCache: number | null = null;
  private authListenerAttached = false;
  private currentOwnerId: string | null = null;
  private currentRuntimeSessionId = '';

  public static getInstance(): PresenceRuntime {
    if (!PresenceRuntime.instance) {
      PresenceRuntime.instance = new PresenceRuntime();
    }
    return PresenceRuntime.instance;
  }

  public init(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.currentOwnerId = runtimeIdentity.getOwnerId();
    this.currentRuntimeSessionId = runtimeIdentity.getRuntimeSessionId();
    this.restore();
    this.attachVoiceObserver();
    this.attachContextListener();
    this.attachEnvironmentListeners();
    this.attachAuthListener();
    this.hydrateEnvironmentalSensors();
    this.refreshSnapshot('init');
    this.snapshotInterval = window.setInterval(() => this.refreshSnapshot('interval'), SNAPSHOT_INTERVAL_MS);
    logger.info('PRESENCE_RUNTIME', 'presence_runtime_initialized=true');
  }

  public setCognitiveState(state: OrionPresenceState, reason: string): void {
    this.manualStateUntil = Date.now() + 1_500;
    usePresenceStore.getState().setCognitiveState(state);
    logger.info('COGNITIVE_STATE', `state=${state} reason=${reason}`);
    logger.info('ORION_PRESENCE', `state=${state} reason=${reason}`);
    this.persist();
  }

  public resolveFollowup(text: string): { resolvedText: string; chainId: string; followup: boolean } {
    const raw = text.trim();
    const chain = usePresenceStore.getState().chain;
    const recentValid = Boolean(chain.id && chain.lastUpdatedAt && Date.now() - chain.lastUpdatedAt <= PRESENCE_CHAIN_TTL_MS);
    const prefixMatch = raw.match(/^(e\s+depois|depois|e)\b\s*/i);
    const followup = Boolean(prefixMatch && recentValid);
    const stripped = prefixMatch ? raw.replace(prefixMatch[0], '').trim() : raw;
    const actionVerb = chain.lastActionVerb || 'abrir';
    const resolvedText = followup && stripped && !/^(abrir|ligar|ativar|desligar|desativar|executar)\b/i.test(stripped)
      ? `${actionVerb} ${stripped}`
      : (stripped || raw);
    const chainId = followup && chain.id ? chain.id : `chain_${Math.random().toString(36).slice(2)}_${Date.now()}`;

    if (followup) {
      logger.info('CONVERSATION_CHAIN', `chain_reused chainId=${chainId}`);
      logger.info('CONTEXTUAL_FOLLOWUP', `followup=true resolved="${resolvedText}" raw="${raw}"`);
    }

    return { resolvedText, chainId, followup };
  }

  public recordCommandContext(input: { id: string; chainId: string; rawText: string; normalizedText: string; action: string; target: string; followup: boolean }): void {
    const store = usePresenceStore.getState();
    const nextCommand: RecentCommandContext = {
      id: input.id,
      chainId: input.chainId,
      rawText: input.rawText,
      normalizedText: input.normalizedText,
      action: input.action,
      target: input.target,
      createdAt: Date.now(),
      followup: input.followup,
    };

    const nextCommands = [nextCommand, ...store.context.recentCommands].slice(0, CONTEXT_WINDOW_LIMIT);
    store.setChain({
      id: input.chainId,
      lastUpdatedAt: Date.now(),
      lastActionVerb: resolveActionVerb(input.action),
      lastTarget: input.target,
    });
    store.setContext({
      ...store.context,
      recentCommands: nextCommands,
      updatedAt: Date.now(),
    });
    logger.info('CONVERSATION_CHAIN', `chain_updated chainId=${input.chainId} followup=${input.followup}`);
    logger.info('COGNITIVE_CONTEXT', `recent_command action="${input.action}" target="${input.target}" chainId=${input.chainId}`);
    this.persist();
  }

  public getResponseProfile(): ResponseStyleProfile {
    return usePresenceStore.getState().responseProfile;
  }

  public selectAdaptiveAcknowledgment(intent: any, variants: string[]): string {
    const profile = usePresenceStore.getState().responseProfile;
    const context = usePresenceStore.getState().context;
    logger.info('ADAPTIVE_INTERACTION', `mode=${profile.mode} ack_style=${profile.acknowledgmentStyle} chatter=${profile.chatterLevel}`);
    logger.info('RESPONSE_PROFILE', `mode=${profile.mode} pacing=${profile.pacing} runtime_state=${context.connectivity}`);

    if (context.runtimeState.recovering) {
      return 'Recuperando o runtime e executando.';
    }
    if (context.runtimeState.reconnecting) {
      return 'Reconectando o runtime e seguindo com o comando.';
    }
    if (profile.acknowledgmentStyle === 'minimal') {
      return variants[0];
    }
    if (profile.acknowledgmentStyle === 'direct') {
      return variants[variants.length - 1];
    }
    if (profile.acknowledgmentStyle === 'calm') {
      return variants[Math.min(1, variants.length - 1)];
    }
    return variants[(intent?.id || '').length % variants.length] || variants[0];
  }

  public getSnapshot(): PresenceContextSnapshot {
    return usePresenceStore.getState().context;
  }

  private restore(): void {
    if (!runtimeIdentity.requiresAuthenticatedRuntime('presence_restore')) {
      usePresenceStore.getState().setContext(createDefaultPresenceContext());
      usePresenceStore.getState().setCognitiveState('idle');
      usePresenceStore.getState().setMode('Equilibrado');
      usePresenceStore.getState().setResponseProfile(resolveResponseProfile(createDefaultPresenceContext(), 'Equilibrado'));
      usePresenceStore.getState().setChain({ id: null, lastUpdatedAt: null, lastActionVerb: null, lastTarget: null });
      logger.info('SCOPED_MEMORY', 'presence_preview_reset=true');
      return;
    }

    try {
      const raw = getScopedStorageValue(PRESENCE_STORAGE_KEY, this.currentOwnerId);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as PresenceRecoverySnapshot;
      if (
        !parsed?.context
        || !parsed?.responseProfile
        || !runtimeIdentity.recoveryOwnershipGuard('presence_restore', {
          ownerId: parsed.ownerId,
          runtimeSessionId: parsed.runtimeSessionId,
          runtimeDeviceId: parsed.runtimeDeviceId,
          allowCrossSessionRestore: true,
        })
      ) {
        throw new Error('INVALID_PRESENCE_SNAPSHOT');
      }
      usePresenceStore.getState().setContext(parsed.context);
      usePresenceStore.getState().setCognitiveState(parsed.cognitiveState || 'idle');
      usePresenceStore.getState().setMode(parsed.mode || 'Equilibrado');
      usePresenceStore.getState().setResponseProfile(parsed.responseProfile);
      usePresenceStore.getState().setChain(parsed.chain || { id: null, lastUpdatedAt: null, lastActionVerb: null, lastTarget: null });
      logger.info('PRESENCE_RECOVERY', 'presence_snapshot_restored=true');
    } catch (error: any) {
      removeScopedStorageValue(PRESENCE_STORAGE_KEY, this.currentOwnerId);
      logger.warn('PRESENCE_RECOVERY', `presence_restore_failed error=${error?.message || error}`);
    }
  }

  private persist(): void {
    const state = usePresenceStore.getState();
    if (!runtimeIdentity.requiresPersistentExecution('presence_persist') || !this.currentOwnerId) {
      return;
    }
    const payload: PresenceRecoverySnapshot = {
      ownerId: this.currentOwnerId,
      runtimeSessionId: this.currentRuntimeSessionId,
      runtimeDeviceId: runtimeIdentity.getRuntimeDeviceId(),
      context: state.context,
      cognitiveState: state.cognitiveState,
      mode: state.mode,
      responseProfile: state.responseProfile,
      chain: state.chain,
    };
    const snapshotKey = JSON.stringify(payload);
    if (snapshotKey === this.duplicateSnapshotKey) {
      logger.info('CONTEXT_GUARD', 'duplicate_presence_snapshot_guard=true');
      return;
    }
    this.duplicateSnapshotKey = snapshotKey;
    setScopedStorageValue(PRESENCE_STORAGE_KEY, snapshotKey, this.currentOwnerId);
  }

  private refreshSnapshot(reason: string): void {
    const context = this.buildSnapshot();
    const store = usePresenceStore.getState();
    const chain = this.cleanupChain(store.chain);
    const resolvedMode = resolveBehaviorMode(context);
    const resolvedProfile = resolveResponseProfile(context, resolvedMode);
    const snapshotKey = JSON.stringify({ context, chain, mode: resolvedMode, profile: resolvedProfile, state: store.cognitiveState });
    if (snapshotKey === this.duplicateSnapshotKey && reason === 'interval') {
      logger.info('CONTEXT_GUARD', 'duplicate_context_snapshot_guard=true');
      return;
    }
    store.setChain(chain);
    store.setMode(resolvedMode);
    store.setResponseProfile(resolvedProfile);
    store.setContext(context);
    logger.info('COGNITIVE_CONTEXT', `snapshot reason=${reason} view=${context.currentView} commands=${context.recentCommands.length} time_of_day=${context.timeOfDay}`);
    logger.info('PRESENCE_RUNTIME', `snapshot reason=${reason} lifecycle=${context.androidLifecycle} connectivity=${context.connectivity} playback=${context.playbackActive}`);
    logger.info('RUNTIME_AWARENESS', `recovering=${context.runtimeState.recovering} disconnected=${context.runtimeState.disconnected} critical_automation=${context.runtimeState.criticalAutomationActive} long_task=${context.runtimeState.longRunningTaskActive}`);
    logger.info('ENVIRONMENT_CONTEXT', `battery=${context.environment.batteryLevel ?? 'unknown'} network=${context.environment.networkQuality} idle=${context.environment.idleState} fullscreen=${context.environment.fullscreenApp || 'none'}`);
    logger.info('DEVICE_AWARENESS', `audio_device=${context.environment.activeAudioDevice} foreground=${context.environment.foregroundApp} wifi_placeholder=${context.environment.wifiDiscoveryPlaceholder}`);
    this.persist();
  }

  private buildSnapshot(): PresenceContextSnapshot {
    const automations = automationStoreService.listAutomations();
    const tasks = taskRuntime.getTasks();
    const currentView = useSystemStore.getState().currentView;
    const voiceState = useVoiceStore.getState().state;
    const socketHealth = socketRuntime.getHealthMetrics();
    const androidSnapshot = androidRuntimeManager.getSnapshot?.() || null;
    const environmentState = environmentRuntime.getState();
    const recentCommands = usePresenceStore.getState().context.recentCommands.filter((entry) => Date.now() - entry.createdAt <= 10 * 60_000);
    const focusActive = getScopedStorageValue(FOCUS_MODE_STORAGE_KEY, this.currentOwnerId) === 'active';
    const activeAutomations = automations.filter((automation) => automation.enabled && ['running', 'waiting', 'scheduled'].includes(automation.state)).length;
    const criticalAutomationActive = automations.some((automation) => automation.enabled && automation.schedule.priority >= 2 && ['running', 'waiting', 'scheduled'].includes(automation.state));
    const longRunningTaskActive = tasks.some((task) => task.timestamps.startedAt && Date.now() - task.timestamps.startedAt > 60_000 && ['running', 'waiting'].includes(task.status));
    const lastFailedTask = tasks.slice().sort((left, right) => (right.timestamps.failedAt || 0) - (left.timestamps.failedAt || 0)).find((task) => task.status === 'failed');
    const route = typeof window !== 'undefined' ? window.location.pathname : '/';
    const environment = buildEnvironmentContext(currentView, route, this.lastInputAt, this.batteryLevelCache, environmentState);

    return {
      updatedAt: Date.now(),
      timeOfDay: resolveTimeOfDay(),
      focusActive,
      activeAutomations,
      playbackActive: voiceState === VoiceState.SPEAKING,
      runtimeState: {
        recovering: environmentState.modes.recovery || androidSnapshot?.lifecycle === 'RECOVERING',
        disconnected: !socketHealth.connected,
        reconnecting: !socketHealth.connected && socketHealth.lastDisconnectedAt > 0,
        degraded: environmentState.modes.degraded,
        offline: environmentState.modes.offline,
        criticalAutomationActive,
        longRunningTaskActive,
        recentRuntimeError: lastFailedTask?.lastError || automations.find((automation) => automation.lastError)?.lastError || null,
      },
      androidLifecycle: androidSnapshot?.lifecycle || (document.visibilityState === 'visible' ? 'ACTIVE' : 'BACKGROUND'),
      connectivity: environmentState.modes.offline
        ? 'disconnected'
        : (socketHealth.connected ? 'connected' : (socketHealth.lastDisconnectedAt > 0 ? 'reconnecting' : 'disconnected')),
      currentView,
      recentCommands,
      route,
      environment,
    };
  }

  private cleanupChain(chain: ConversationChainSnapshot): ConversationChainSnapshot {
    if (!chain.id || !chain.lastUpdatedAt) {
      return chain;
    }
    if (Date.now() - chain.lastUpdatedAt <= PRESENCE_CHAIN_TTL_MS) {
      return chain;
    }
    logger.info('CONTEXT_GUARD', `stale_conversation_chain_cleanup chainId=${chain.id}`);
    return {
      id: null,
      lastUpdatedAt: null,
      lastActionVerb: null,
      lastTarget: null,
    };
  }

  private attachVoiceObserver(): void {
    useVoiceStore.subscribe((state) => {
      const now = Date.now();
      if (now < this.manualStateUntil && (state.state === VoiceState.PROCESSING || state.state === VoiceState.IDLE)) {
        return;
      }
      const next = mapVoiceStateToPresenceState(state.state);
      usePresenceStore.getState().setCognitiveState(next);
      logger.info('COGNITIVE_STATE', `state=${next} reason=voice_state_${state.state.toLowerCase()}`);
    });
  }

  private attachContextListener(): void {
    if (this.contextListenerAttached) {
      return;
    }
    this.contextListenerAttached = true;
    window.addEventListener('orion:runtime-context', ((nativeEvent: Event) => {
      const detail = (nativeEvent as CustomEvent<{ action?: string }>).detail;
      if (!detail?.action) {
        return;
      }
      if (detail.action === 'recovery') {
        this.setCognitiveState('recovering', 'runtime_context_recovery');
      }
      if (detail.action === 'socket_disconnected') {
        this.setCognitiveState('reconnecting', 'runtime_context_socket_disconnected');
      }
      this.refreshSnapshot(`runtime_context_${detail.action}`);
    }) as EventListener);
  }

  private attachEnvironmentListeners(): void {
    const markInteraction = () => {
      this.lastInputAt = Date.now();
    };
    window.addEventListener('mousemove', markInteraction, { passive: true });
    window.addEventListener('keydown', markInteraction, { passive: true });
    window.addEventListener('touchstart', markInteraction, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') {
        this.setCognitiveState('suspended', 'document_hidden');
      } else {
        this.refreshSnapshot('visibility_change');
      }
    });
  }

  private hydrateEnvironmentalSensors(): void {
    const batteryApi = navigator as Navigator & { getBattery?: () => Promise<{ level: number }> };
    void batteryApi.getBattery?.().then((battery) => {
      this.batteryLevelCache = Math.round((battery.level || 0) * 100);
      logger.info('DEVICE_AWARENESS', `battery_probe level=${this.batteryLevelCache}`);
      this.refreshSnapshot('battery_probe');
    }).catch(() => null);
  }

  private attachAuthListener(): void {
    if (this.authListenerAttached) {
      return;
    }

    this.authListenerAttached = true;
    let previousOwnerId = this.currentOwnerId;
    let previousAuthState = useAuthStore.getState().state;
    let pendingAuthTransition = false;
    useAuthStore.subscribe((state) => {
      const nextOwnerId = state.user?.uid || null;
      const nextAuthState = state.state;
      if (nextAuthState === 'AUTHENTICATING' || nextAuthState === 'RESTORING_SESSION') {
        pendingAuthTransition = true;
        logger.info('AUTH_TRANSITION', `presence_transition_wait auth=${nextAuthState} owner=${previousOwnerId || 'preview'}`);
        previousAuthState = nextAuthState;
        return;
      }

      if (nextOwnerId === previousOwnerId && nextAuthState === previousAuthState) {
        return;
      }

      if (nextOwnerId !== previousOwnerId) {
        this.currentOwnerId = nextOwnerId;
        this.currentRuntimeSessionId = runtimeIdentity.getRuntimeSessionId();
        this.duplicateSnapshotKey = '';
        usePresenceStore.getState().setChain({ id: null, lastUpdatedAt: null, lastActionVerb: null, lastTarget: null });
        this.restore();
        this.refreshSnapshot('owner_change');
        logger.info('SESSION_ISOLATION', `presence_owner_change prev=${previousOwnerId || 'preview'} next=${nextOwnerId || 'preview'}`);
        previousOwnerId = nextOwnerId;
      } else if (pendingAuthTransition) {
        pendingAuthTransition = false;
        this.currentRuntimeSessionId = runtimeIdentity.getRuntimeSessionId();
        this.refreshSnapshot('auth_resume');
        logger.info('HYDRATION_RUNTIME', `presence_runtime_resumed owner=${nextOwnerId || 'preview'} auth=${nextAuthState}`);
      }
      previousAuthState = nextAuthState;
    });
  }
}

function mapVoiceStateToPresenceState(state: VoiceState): OrionPresenceState {
  if (state === VoiceState.LISTENING) return 'listening';
  if (state === VoiceState.PROCESSING) return 'processing';
  if (state === VoiceState.SPEAKING) return 'speaking';
  return 'idle';
}

function resolveActionVerb(action: string): string {
  const lowered = action.toLowerCase();
  if (/^(abrir|open)/.test(lowered)) return 'abrir';
  if (/^(ligar|ativar)/.test(lowered)) return 'ativar';
  if (/^(desligar|desativar)/.test(lowered)) return 'desligar';
  return 'executar';
}

function resolveTimeOfDay(): PresenceContextSnapshot['timeOfDay'] {
  const hour = new Date().getHours();
  if (hour < 6) return 'madrugada';
  if (hour < 12) return 'manha';
  if (hour < 18) return 'tarde';
  return 'noite';
}

function buildEnvironmentContext(
  currentView: string,
  route: string,
  lastInputAt: number,
  batteryLevel: number | null,
  environmentState = environmentRuntime.getState(),
): PresenceContextSnapshot['environment'] {
  const connection = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
  return {
    batteryLevel,
    networkQuality: environmentState.modes.offline ? 'offline' : (connection?.effectiveType || 'unknown'),
    activeAudioDevice: 'default',
    fullscreenApp: document.fullscreenElement ? route : null,
    idleState: Date.now() - lastInputAt > 60_000 ? 'idle' : 'active',
    foregroundApp: currentView,
    wifiDiscoveryPlaceholder: 'not_active',
    environmentType: environmentState.environment,
    runtimeQuality: environmentState.runtimeQuality.profile,
    operationalMode: environmentState.activeMode,
    deviceId: environmentState.deviceSession.activeDeviceId,
  };
}

function resolveBehaviorMode(context: PresenceContextSnapshot): OrionBehaviorMode {
  const storedMode = window.localStorage.getItem('orion.behavior.mode') as OrionBehaviorMode | null;
  const scopedMode = getScopedStorageValue(BEHAVIOR_MODE_STORAGE_KEY, runtimeIdentity.getOwnerId()) as OrionBehaviorMode | null;
  const allowedModes: OrionBehaviorMode[] = ['Equilibrado', 'Silencioso', 'Profissional', 'Casual', 'Foco'];
  if (scopedMode && allowedModes.includes(scopedMode)) {
    return scopedMode;
  }
  if (context.focusActive) {
    return 'Foco';
  }
  return 'Equilibrado';
}

function resolveResponseProfile(context: PresenceContextSnapshot, mode: OrionBehaviorMode): ResponseStyleProfile {
  const safeMode = ['Equilibrado', 'Silencioso', 'Profissional', 'Casual', 'Foco'].includes(mode) ? mode : 'Equilibrado';
  if (safeMode !== mode) {
    logger.warn('ADAPTIVE_RUNTIME', `adaptive_mode_fallback from=${mode} to=${safeMode}`);
  }
  if (context.runtimeState.criticalAutomationActive || context.runtimeState.longRunningTaskActive) {
    return { mode: safeMode, acknowledgmentStyle: 'minimal', pacing: 'compact', chatterLevel: 'low' };
  }
  if (context.runtimeState.offline || context.runtimeState.degraded) {
    return { mode: safeMode, acknowledgmentStyle: 'calm', pacing: 'compact', chatterLevel: 'low' };
  }
  if (context.timeOfDay === 'madrugada') {
    return { mode: safeMode, acknowledgmentStyle: 'calm', pacing: 'calm', chatterLevel: 'low' };
  }
  if (safeMode === 'Silencioso' || safeMode === 'Foco') {
    return { mode: safeMode, acknowledgmentStyle: 'minimal', pacing: 'compact', chatterLevel: 'low' };
  }
  if (safeMode === 'Profissional') {
    return { mode: safeMode, acknowledgmentStyle: 'direct', pacing: 'steady', chatterLevel: 'low' };
  }
  if (safeMode === 'Casual') {
    return { mode: safeMode, acknowledgmentStyle: 'natural', pacing: 'steady', chatterLevel: 'high' };
  }
  return { mode: safeMode, acknowledgmentStyle: 'natural', pacing: 'steady', chatterLevel: 'medium' };
}

export const presenceRuntime = PresenceRuntime.getInstance();

function createDefaultPresenceContext(): PresenceContextSnapshot {
  return {
    updatedAt: Date.now(),
    timeOfDay: resolveTimeOfDay(),
    focusActive: false,
    activeAutomations: 0,
    playbackActive: false,
    runtimeState: {
      recovering: false,
      disconnected: false,
      reconnecting: false,
      degraded: false,
      offline: false,
      criticalAutomationActive: false,
      longRunningTaskActive: false,
      recentRuntimeError: null,
    },
    androidLifecycle: 'BOOTING',
    connectivity: 'disconnected',
    currentView: 'dashboard',
    recentCommands: [],
    route: '/',
    environment: {
      batteryLevel: null,
      networkQuality: 'unknown',
      activeAudioDevice: 'default',
      fullscreenApp: null,
      idleState: 'active',
      foregroundApp: 'dashboard',
      wifiDiscoveryPlaceholder: 'pending',
      environmentType: 'browser',
      runtimeQuality: 'stable',
      operationalMode: 'active',
      deviceId: 'unknown',
    },
  };
}
