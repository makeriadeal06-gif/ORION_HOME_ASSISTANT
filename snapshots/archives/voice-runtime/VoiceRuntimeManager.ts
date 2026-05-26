import { speechPipeline } from './pipeline/SpeechPipeline';
import { voiceStateEngine } from './state/VoiceStateEngine';
import { useVoiceStore } from './state/useVoiceStore';
import { logger } from '../logger/Logger';
import { VoiceProfile, VoiceState } from './types';
import { environmentRuntime } from '@core/environment-runtime/EnvironmentRuntime';
import { runtimeIdentity } from '@core/runtime/RuntimeIdentity';
import { useRuntimeStore } from '@core/state/stores/useRuntimeStore';
import { AuthState } from '@core/state/stores/useAuthStore';
import { socketRuntime } from '@core/socket/SocketRuntime';

const FALLBACK_LEASE_TTL_MS = 12000;

type VoiceRecoverySnapshot = {
  activeProvider: string;
  activeProfileId: string;
  preferredProvider: string;
  lockedProvider: string;
  lockedProfileId: string;
  expectedProvider: string;
  expectedProfileId: string;
  authStable: boolean;
  hydrationStable: boolean;
  socketHealthy: boolean;
  runtimeOperational: boolean;
  environmentRecovered: boolean;
  environmentDegraded: boolean;
  providerHealthy: boolean;
  providerValidationOk: boolean;
  recentFailure: boolean;
  fallbackLeaseActive: boolean;
  fallbackLeaseExpired: boolean;
  fallbackLeaseReason: string;
  fallbackLeaseRemainingMs: number;
  shouldRecoverFromBrowserFallback: boolean;
};

export class VoiceRuntimeManager {
  private static instance: VoiceRuntimeManager;
  private environmentAwareProfile: VoiceProfile | null = null;
  private environmentSubscriptionAttached = false;
  private authProtectionAttached = false;
  private recoverySubscriptionAttached = false;
  private browserFallbackSince: number | null = null;
  private browserFallbackDeadline: number | null = null;
  private initialized = false;
  private bootstrapReady = false;
  private bootstrapInFlight: Promise<void> | null = null;
  private fallbackRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSpeak: { text: string; intentId?: string; attempts: number } | null = null;

  private constructor() {}

  public static getInstance(): VoiceRuntimeManager {
    if (!VoiceRuntimeManager.instance) {
      VoiceRuntimeManager.instance = new VoiceRuntimeManager();
    }
    return VoiceRuntimeManager.instance;
  }

  public async init() {
    if (this.initialized) {
      await this.bootstrapVoiceRuntime('reinit');
      return;
    }

    this.initialized = true;
    logger.info('VOICE_RUNTIME', 'Voice Runtime Manager initialized in Calm Mode.');
    this.attachEnvironmentAwareness();
    this.attachAuthTransitionProtection();
    this.attachRecoveryObserver();
    await this.bootstrapVoiceRuntime('init');
    const profile = useVoiceStore.getState().activeProfile;
    logger.info('VOICE_PROFILE', `active_provider=${profile.provider}`);
    logger.info('VOICE_PROFILE', `active_voice_id=${profile.id}`);
    logger.info('VOICE_PROFILE', 'hydrated_profile=true');
    voiceStateEngine.resetToIdle();
  }

  public getState(): VoiceState {
    return useVoiceStore.getState().state;
  }

  /**
   * Called typically by a UI button (Push-to-Talk)
   */
  public startListening() {
    if (!this.ensureVoiceBootstrapReady('voice_start_listening')) {
      logger.info('VOICE_BOOTSTRAP', 'start_listening_blocked waiting_for_bootstrap=true');
      return;
    }

    if (!runtimeIdentity.runtimeExecutionGuard('voice_start_listening')) {
      logger.info('PREVIEW_RUNTIME', 'voice_start_listening skipped=true');
      return;
    }

    // Warm up TTS engines during user gesture to unlock autoplay policies
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
      }
    } catch (e) {}
    try {
      if (typeof window !== 'undefined') {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
        ctx.close();
      }
    } catch (e) {}
    speechPipeline.startListening();
  }

  /**
   * Called typically on mouse up / touch end for Push-to-Talk
   */
  public stopListening() {
    speechPipeline.stopListening();
  }

  /**
   * External explicit interrupt (e.g., user hits a "Stop" button)
   */
  public interrupt() {
    speechPipeline.interrupt();
  }

  public speak(text: string, intentId?: string) {
    if (!this.ensureVoiceBootstrapReady('voice_speak')) {
      this.deferSpeakUntilReady(text, intentId, 'voice_speak');
      return;
    }

    if (!runtimeIdentity.runtimeExecutionGuard('voice_speak')) {
      logger.info('PREVIEW_RUNTIME', 'voice_speak skipped=true');
      return;
    }

    this.applyEnvironmentVoicePolicy();
    this.validatePlaybackAuthority('runtime_speak');
    speechPipeline.speak(text, intentId);
  }

  private attachEnvironmentAwareness() {
    if (this.environmentSubscriptionAttached) {
      return;
    }

    this.environmentSubscriptionAttached = true;
    useRuntimeStore.subscribe((state, previousState) => {
      if (state.environmentState !== previousState.environmentState) {
        this.applyEnvironmentVoicePolicy();
        this.validateVoiceProviderHealth('environment_change');
      }

      if (state.authTransitionState !== previousState.authTransitionState) {
        logger.info('VOICE_AUTH_TRANSITION', `state=${state.authTransitionState} owner=${state.transitionOwnerId || 'preview'}`);
        if (state.authTransitionState === 'AUTH_SWITCHING' || state.authTransitionState === 'AUTH_RESTORING') {
          this.bootstrapReady = false;
        }
        this.validateVoiceProviderHealth(`auth_state_${state.authTransitionState.toLowerCase()}`);
      }
    });
  }

  private attachRecoveryObserver() {
    if (this.recoverySubscriptionAttached) {
      return;
    }

    this.recoverySubscriptionAttached = true;
    useVoiceStore.subscribe((state, previousState) => {
      if (
        state.activeProfile.provider !== previousState.activeProfile.provider
        || state.authority.providerRecoveryState !== previousState.authority.providerRecoveryState
        || state.authority.preferredVoiceProvider !== previousState.authority.preferredVoiceProvider
      ) {
        this.updateFallbackRecoveryLoop();
      }
    });
  }

  private attachAuthTransitionProtection() {
    if (this.authProtectionAttached) {
      return;
    }

    this.authProtectionAttached = true;
    runtimeIdentity.subscribe((snapshot, previousSnapshot) => {
      if (snapshot.authState === previousSnapshot.authState && snapshot.runtimeSessionId === previousSnapshot.runtimeSessionId) {
        return;
      }

      if (snapshot.authState === AuthState.AUTHENTICATING || snapshot.authState === AuthState.RESTORING_SESSION) {
        this.bootstrapReady = false;
        useVoiceStore.getState().setAuthorityRecoveryState('auth_transition_hold');
        logger.info('VOICE_PROVIDER', `auth_transition_hold=true owner=${snapshot.ownerId || 'preview'} session=${snapshot.runtimeSessionId}`);
        return;
      }

      logger.info('VOICE_RECOVERY', `auth_transition_resume owner=${snapshot.ownerId || 'preview'} session=${snapshot.runtimeSessionId}`);
      void this.bootstrapVoiceRuntime('auth_resume');
    });
  }

  private applyEnvironmentVoicePolicy() {
    const voiceStore = useVoiceStore.getState();
    const activeProfile = voiceStore.activeProfile;
    const resolution = environmentRuntime.resolveVoiceProfile(activeProfile);
    const fallbackLeaseReason = resolution.reason || 'temporary_environment_fallback';

    if (resolution.degraded) {
      if (!this.environmentAwareProfile) {
        this.environmentAwareProfile = activeProfile;
      }
      if (resolution.profile.id !== activeProfile.id) {
        const leaseStartedAt = Date.now();
        this.browserFallbackSince = leaseStartedAt;
        this.browserFallbackDeadline = leaseStartedAt + FALLBACK_LEASE_TTL_MS;
        voiceStore.setProfile(resolution.profile, {
          preservePreferredProvider: true,
          recoveryState: 'temporary_browser_fallback',
          failureReason: resolution.reason,
          persistAsStable: false,
          forceLockOverride: true,
          lockProvider: false,
          lockReason: 'temporary_browser_fallback',
          voiceId: voiceStore.authority.activeVoiceId || this.environmentAwareProfile?.id || activeProfile.id,
          pacing: 'conversational_soft',
          naturalizationConfig: 'environment_degraded_fallback',
          latencyProfile: 'browser_native',
          streamMode: 'browser_native',
          startupBufferMs: 0,
          temporaryFallbackLease: true,
          fallbackLeaseStartedAt: leaseStartedAt,
          fallbackLeaseTTL: FALLBACK_LEASE_TTL_MS,
          fallbackLeaseReason,
          restoringProvider: voiceStore.authority.preferredVoiceProvider,
        });
        logger.warn('FALLBACK_LEASE', `state=granted provider=browser reason=${fallbackLeaseReason} ttl_ms=${FALLBACK_LEASE_TTL_MS} expected_provider=${voiceStore.authority.preferredVoiceProvider}`);
        logger.info('VOICE_PROVIDER_STATE', `active=${resolution.profile.provider} profile=${resolution.profile.id} preferred=${voiceStore.authority.preferredVoiceProvider} locked=${voiceStore.authority.lockedProvider || 'none'} temporary_fallback=true`);
        logger.warn('VOICE_DEGRADATION', `provider=browser reason=${resolution.reason} preferred=${voiceStore.authority.preferredVoiceProvider}`);
        logger.warn('DEGRADED_RUNTIME', `voice_profile_fallback provider=${activeProfile.provider} reason=${resolution.reason}`);
      }
      return;
    }

    if (this.environmentAwareProfile && activeProfile.id.startsWith('browser_fallback_')) {
      logger.info('ENVIRONMENT_VOICE_COORDINATION', `degraded=false active=${activeProfile.id} expected=${this.environmentAwareProfile.id} lease_active=${String(voiceStore.authority.temporaryFallbackLease)}`);
      logger.info('VOICE_RECOVERY', `environment_recovery_detected provider=${this.environmentAwareProfile.provider}`);
      this.restorePreferredVoice('environment_recovery');
    }
  }

  public restoreElevenLabsProvider(reason = 'manual_recovery'): boolean {
    const voiceStore = useVoiceStore.getState();
    const authority = voiceStore.authority;
    if (authority.preferredVoiceProvider !== 'elevenlabs' && authority.lastStableVoiceProvider !== 'elevenlabs') {
      return false;
    }

    const validation = this.getVoiceRecoverySnapshot(reason);
    if (!validation.providerValidationOk) {
      if (validation.environmentDegraded && validation.authStable && validation.runtimeOperational && validation.providerHealthy) {
        logger.info('PROVIDER_RECOVERY', `degraded_temporary_restore_pending provider=elevenlabs reason=${reason} failure=${authority.providerFailureReason || 'none'} socket_healthy=${String(validation.socketHealthy)} hydration_stable=${String(validation.hydrationStable)}`);
      } else {
        logger.warn('PROVIDER_RESTORE', `restore_blocked provider=elevenlabs reason=${reason} failure=${authority.providerFailureReason || 'none'}`);
      }
      return false;
    }

    const restoredVoiceId = authority.activeVoiceId.startsWith('browser_fallback_')
      ? authority.activeVoiceId.replace(/^browser_fallback_/, '')
      : authority.activeVoiceId;
    const restoreProfile = this.environmentAwareProfile || {
      ...voiceStore.activeProfile,
      id: authority.activeVoiceProfileId.startsWith('browser_fallback_')
        ? (restoredVoiceId || authority.activeVoiceProfileId.replace(/^browser_fallback_/, ''))
        : (authority.activeVoiceProfileId || 'eleven_rachel'),
      provider: 'elevenlabs',
      rate: authority.speechRate || voiceStore.activeProfile.rate,
      name: voiceStore.activeProfile.name.includes('Fallback') ? 'Rachel (ElevenLabs)' : voiceStore.activeProfile.name,
    };
    voiceStore.setProfile(restoreProfile, {
      recoveryState: 'recovering_provider',
      failureReason: null,
      persistAsStable: true,
      forceLockOverride: true,
      lockProvider: true,
      lockReason: reason,
      voiceId: restoredVoiceId || restoreProfile.id,
      pacing: authority.pacing,
      naturalizationConfig: authority.naturalizationConfig,
      latencyProfile: 'stream_soft',
      streamMode: authority.streamMode || 'stream_soft',
      startupBufferMs: authority.startupBufferMs || 160,
      stability: authority.stability,
      similarityBoost: authority.similarityBoost,
      style: authority.style,
      speakerBoost: authority.speakerBoost,
      optimizeStreamingLatency: authority.optimizeStreamingLatency,
      modelId: authority.modelId,
      outputFormat: authority.outputFormat,
      temporaryFallbackLease: false,
      fallbackLeaseReleasedAt: Date.now(),
      restoringProvider: 'elevenlabs',
      recoveredProvider: 'elevenlabs',
      providerRecoveredAt: Date.now(),
    });
    logger.info('FALLBACK_RELEASE', `state=released provider=browser reason=${reason} expected_provider=elevenlabs lease_reason=${authority.fallbackLeaseReason || 'none'}`);
    this.browserFallbackSince = null;
    this.browserFallbackDeadline = null;
    this.environmentAwareProfile = null;
    useVoiceStore.getState().setAuthorityRecoveryState('stable');
    this.recoverVoiceProfile(`${reason}_profile`);
    this.recoverNaturalization(`${reason}_naturalization`);
    this.recoverStreamingProfile(`${reason}_stream`);
    logger.info('ELEVENLABS_RESTORE', `provider=elevenlabs restored=true reason=${reason} profile=${restoreProfile.id} voice=${restoredVoiceId || restoreProfile.id} naturalization=${authority.naturalizationConfig} pacing=${authority.pacing} stream=${authority.streamMode} latency=${authority.latencyProfile}`);
    logger.info('PROVIDER_RECOVERY', `provider=elevenlabs restored=true reason=${reason} active=${restoreProfile.id}`);
    logger.info('VOICE_PROVIDER_STATE', `active=elevenlabs profile=${restoreProfile.id} preferred=${authority.preferredVoiceProvider} locked=${authority.lockedProvider || 'none'} temporary_fallback=false`);
    logger.info('PROVIDER_RESTORE', `provider=elevenlabs restored=true reason=${reason} voice=${restoreProfile.id}`);
    logger.info('ELEVENLABS_RUNTIME', `provider_restore reason=${reason} voice=${restoreProfile.id}`);
    return true;
  }

  public restorePreferredVoice(reason = 'voice_recovery'): boolean {
    const voiceStore = useVoiceStore.getState();
    const authority = voiceStore.authority;

    if (authority.preferredVoiceProvider === 'elevenlabs') {
      return this.restoreElevenLabsProvider(reason);
    }

    if (this.environmentAwareProfile && authority.preferredVoiceProvider === this.environmentAwareProfile.provider) {
      voiceStore.setProfile(this.environmentAwareProfile, {
        recoveryState: 'stable',
        failureReason: null,
        persistAsStable: true,
        forceLockOverride: true,
        lockProvider: authority.providerLocked,
        lockReason: reason,
        voiceId: authority.activeVoiceId,
        pacing: authority.pacing,
        naturalizationConfig: authority.naturalizationConfig,
        latencyProfile: authority.latencyProfile,
        streamMode: authority.streamMode,
        startupBufferMs: authority.startupBufferMs,
        stability: authority.stability,
        similarityBoost: authority.similarityBoost,
        style: authority.style,
        speakerBoost: authority.speakerBoost,
        optimizeStreamingLatency: authority.optimizeStreamingLatency,
        modelId: authority.modelId,
        outputFormat: authority.outputFormat,
        temporaryFallbackLease: false,
        fallbackLeaseReleasedAt: Date.now(),
        restoringProvider: authority.preferredVoiceProvider,
        recoveredProvider: authority.preferredVoiceProvider,
        providerRecoveredAt: Date.now(),
      });
      logger.info('FALLBACK_RELEASE', `state=released provider=browser reason=${reason} expected_provider=${authority.preferredVoiceProvider}`);
      this.environmentAwareProfile = null;
      logger.info('PROVIDER_RESTORE', `provider=${authority.preferredVoiceProvider} restored=true reason=${reason}`);
      return true;
    }

    return false;
  }

  public validateVoiceProviderHealth(reason = 'health_check'): boolean {
    const snapshot = this.getVoiceRecoverySnapshot(reason);

    logger.info(
      'PROVIDER_HEALTH_RUNTIME',
      `reason=${reason} active=${snapshot.activeProvider} preferred=${snapshot.preferredProvider} expected=${snapshot.expectedProvider} auth_stable=${String(snapshot.authStable)} hydration_stable=${String(snapshot.hydrationStable)} socket_healthy=${String(snapshot.socketHealthy)} runtime_operational=${String(snapshot.runtimeOperational)} provider_healthy=${String(snapshot.providerHealthy)} env_recovered=${String(snapshot.environmentRecovered)} lease_active=${String(snapshot.fallbackLeaseActive)} lease_expired=${String(snapshot.fallbackLeaseExpired)}`
    );

    if (!snapshot.authStable) {
      logger.info('VOICE_RECOVERY', `auth_transition_protected=true reason=${reason}`);
      return false;
    }

    if (snapshot.shouldRecoverFromBrowserFallback && snapshot.providerValidationOk) {
      logger.warn('RUNTIME_VOICE_RECOVERY', `browser_fallback_stuck=true reason=${reason} active=${snapshot.activeProfileId} expected=${snapshot.expectedProfileId}`);
      this.restorePreferredVoice(`auto_${reason}`);
      return true;
    }

    return snapshot.providerValidationOk;
  }

  public validatePlaybackAuthority(reason = 'playback_validation'): boolean {
    const snapshot = this.getVoiceRecoverySnapshot(reason);
    logger.info('PLAYBACK_AUTHORITY', `reason=${reason} active=${snapshot.activeProvider} locked=${snapshot.lockedProvider} expected=${snapshot.expectedProvider} provider_healthy=${String(snapshot.providerHealthy)} lease_expired=${String(snapshot.fallbackLeaseExpired)}`);

    if (snapshot.shouldRecoverFromBrowserFallback && snapshot.providerValidationOk) {
      logger.warn('PROVIDER_RECOVERY', `playback_promote_back provider=${snapshot.expectedProvider} reason=${reason}`);
      this.restoreStableProvider(`playback_${reason}`);
    }

    const profile = useVoiceStore.getState().activeProfile;
    logger.info('PLAYBACK_PROVIDER', `provider=${profile.provider} profile=${profile.id} expected=${snapshot.expectedProfileId}`);
    return profile.provider !== 'browser' || !snapshot.providerValidationOk || !snapshot.shouldRecoverFromBrowserFallback;
  }

  public restoreStableProvider(reason = 'stable_provider_recovery'): boolean {
    const authority = useVoiceStore.getState().authority;
    if (authority.lastStableVoiceProvider === 'elevenlabs') {
      return this.restoreElevenLabsProvider(reason);
    }
    return this.restorePreferredVoice(reason);
  }

  public recoverVoiceProfile(reason = 'voice_profile_recovery'): boolean {
    const voiceStore = useVoiceStore.getState();
    const { activeProfile, authority } = voiceStore;
    const expectedProfileId = authority.lockedProfileId || authority.activeVoiceProfileId;
    const expectedVoiceId = authority.lockedVoiceId || authority.activeVoiceId;
    if (!expectedProfileId || (activeProfile.id === expectedProfileId && authority.activeVoiceId === expectedVoiceId)) {
      return false;
    }

    logger.warn('VOICE_REGRESSION', `profile_mismatch=true reason=${reason} active=${activeProfile.id} expected=${expectedProfileId}`);
    voiceStore.setProfile({
      ...activeProfile,
      id: expectedProfileId,
      provider: authority.lockedProvider || authority.activeVoiceProvider,
      rate: authority.speechRate || activeProfile.rate,
    }, {
      forceLockOverride: true,
      lockProvider: authority.providerLocked,
      lockReason: reason,
      preservePreferredProvider: true,
      persistAsStable: true,
      voiceId: expectedVoiceId,
      pacing: authority.pacing,
      naturalizationConfig: authority.naturalizationConfig,
      latencyProfile: authority.latencyProfile,
      streamMode: authority.streamMode,
      startupBufferMs: authority.startupBufferMs,
      stability: authority.stability,
      similarityBoost: authority.similarityBoost,
      style: authority.style,
      speakerBoost: authority.speakerBoost,
      optimizeStreamingLatency: authority.optimizeStreamingLatency,
      modelId: authority.modelId,
      outputFormat: authority.outputFormat,
    });
    logger.info('PROFILE_RESTORE', `reason=${reason} profile=${expectedProfileId} voice=${expectedVoiceId}`);
    return true;
  }

  public recoverNaturalization(reason = 'naturalization_recovery'): boolean {
    const voiceStore = useVoiceStore.getState();
    const { activeProfile, authority } = voiceStore;
    if (authority.naturalizationConfig && authority.pacing && authority.speechRate) {
      logger.info('NATURALIZATION_RUNTIME', `reason=${reason} profile=${activeProfile.id} pacing=${authority.pacing} rate=${authority.speechRate.toFixed(2)} stability=${authority.stability}`);
      return false;
    }

    voiceStore.setProfile(activeProfile, {
      forceLockOverride: true,
      lockProvider: authority.providerLocked,
      lockReason: reason,
      preservePreferredProvider: true,
      persistAsStable: activeProfile.provider !== 'browser',
      voiceId: authority.activeVoiceId || activeProfile.id,
      pacing: authority.pacing || 'conversational_soft',
      naturalizationConfig: authority.naturalizationConfig || 'default_orion_naturalization',
      latencyProfile: authority.latencyProfile || (activeProfile.provider === 'elevenlabs' ? 'stream_soft' : 'browser_native'),
      streamMode: authority.streamMode || (activeProfile.provider === 'elevenlabs' ? 'stream_soft' : 'browser_native'),
      startupBufferMs: authority.startupBufferMs || (activeProfile.provider === 'elevenlabs' ? 160 : 0),
      stability: authority.stability || 0.64,
      similarityBoost: authority.similarityBoost || 0.78,
      style: authority.style || 0.18,
      speakerBoost: authority.speakerBoost ?? true,
      optimizeStreamingLatency: authority.optimizeStreamingLatency || 2,
      modelId: authority.modelId || 'eleven_multilingual_v2',
      outputFormat: authority.outputFormat || 'mp3_44100_128',
    });
    logger.info('NATURALIZATION_RUNTIME', `recovered=true reason=${reason} profile=${activeProfile.id}`);
    return true;
  }

  public recoverStreamingProfile(reason = 'stream_profile_recovery'): boolean {
    const voiceStore = useVoiceStore.getState();
    const { activeProfile, authority } = voiceStore;
    if (authority.streamMode && authority.latencyProfile && authority.outputFormat) {
      logger.info('STREAM_PROFILE', `reason=${reason} mode=${authority.streamMode} latency=${authority.latencyProfile} output=${authority.outputFormat} buffer_ms=${authority.startupBufferMs}`);
      return false;
    }

    voiceStore.setProfile(activeProfile, {
      forceLockOverride: true,
      lockProvider: authority.providerLocked,
      lockReason: reason,
      preservePreferredProvider: true,
      persistAsStable: activeProfile.provider !== 'browser',
      voiceId: authority.activeVoiceId || activeProfile.id,
      pacing: authority.pacing || 'conversational_soft',
      naturalizationConfig: authority.naturalizationConfig || 'default_orion_naturalization',
      latencyProfile: authority.latencyProfile || (activeProfile.provider === 'elevenlabs' ? 'stream_soft' : 'browser_native'),
      streamMode: authority.streamMode || (activeProfile.provider === 'elevenlabs' ? 'stream_soft' : 'browser_native'),
      startupBufferMs: authority.startupBufferMs || (activeProfile.provider === 'elevenlabs' ? 160 : 0),
      stability: authority.stability || 0.64,
      similarityBoost: authority.similarityBoost || 0.78,
      style: authority.style || 0.18,
      speakerBoost: authority.speakerBoost ?? true,
      optimizeStreamingLatency: authority.optimizeStreamingLatency || 2,
      modelId: authority.modelId || 'eleven_multilingual_v2',
      outputFormat: authority.outputFormat || 'mp3_44100_128',
    });
    logger.info('STREAM_PROFILE', `recovered=true reason=${reason} profile=${activeProfile.id}`);
    return true;
  }

  private async bootstrapVoiceRuntime(reason: string): Promise<void> {
    if (this.bootstrapInFlight) {
      await this.bootstrapInFlight;
      return;
    }

    this.bootstrapInFlight = (async () => {
      const runtimeState = useRuntimeStore.getState();
      logger.info('VOICE_BOOTSTRAP', `start reason=${reason} auth=${runtimeIdentity.getAuthState()} transition=${runtimeState.authTransitionState}`);
      this.bootstrapReady = false;

      try {
        const configResp = await fetch('/api/voice/config');
        if (configResp.ok) {
          const voiceCfg = await configResp.json();
          const configuredVoiceId = voiceCfg.configuredVoiceId;
          if (configuredVoiceId && configuredVoiceId !== 'eleven_rachel') {
            const voiceStore = useVoiceStore.getState();
            if (voiceStore.authority.activeVoiceId === 'eleven_rachel' || voiceStore.authority.activeVoiceId.startsWith('browser_fallback_')) {
              logger.info('VOICE_PERSISTENCE', `Hydrating activeVoiceId to real providerVoiceId: ${configuredVoiceId}`);
              voiceStore.setProfile(voiceStore.activeProfile, {
                voiceId: configuredVoiceId,
                forceLockOverride: true
              });
            }
          }
        }
      } catch (err) {
        logger.warn('VOICE_PERSISTENCE', 'Failed to fetch voice config from backend', err);
      }

      this.applyEnvironmentVoicePolicy();
      this.recoverVoiceProfile(`${reason}_profile`);
      this.recoverNaturalization(`${reason}_naturalization`);
      this.recoverStreamingProfile(`${reason}_stream`);
      this.validateVoiceProviderHealth(`${reason}_health`);
      this.restoreStableProvider(`${reason}_stable`);
      this.bootstrapReady = true;
      this.flushDeferredSpeak();
      logger.info('VOICE_BOOTSTRAP', `ready=true reason=${reason} provider=${useVoiceStore.getState().activeProfile.provider} profile=${useVoiceStore.getState().activeProfile.id}`);
    })().finally(() => {
      this.bootstrapInFlight = null;
    });

    await this.bootstrapInFlight;
  }

  private ensureVoiceBootstrapReady(reason: string): boolean {
    if (!this.initialized || !this.bootstrapReady) {
      logger.info('VOICE_BOOTSTRAP', `waiting=true reason=${reason} initialized=${String(this.initialized)} ready=${String(this.bootstrapReady)}`);
      void this.bootstrapVoiceRuntime(reason);
      return false;
    }
    return true;
  }

  private deferSpeakUntilReady(text: string, intentId: string | undefined, reason: string): void {
    this.pendingSpeak = {
      text,
      intentId,
      attempts: (this.pendingSpeak?.attempts || 0) + 1,
    };
    logger.warn('VOICE_BOOTSTRAP', `deferred_speak=true reason=${reason} attempts=${this.pendingSpeak.attempts}`);
    if (this.pendingSpeak.attempts > 20) {
      logger.error('VOICE_REGRESSION', `deferred_speak_dropped=true reason=${reason}`);
      this.pendingSpeak = null;
      return;
    }
    window.setTimeout(() => {
      if (this.pendingSpeak) {
        void this.bootstrapVoiceRuntime(`${reason}_retry`);
      }
    }, 75);
  }

  private flushDeferredSpeak(): void {
    if (!this.pendingSpeak || !this.bootstrapReady) {
      return;
    }

    const pendingSpeak = this.pendingSpeak;
    this.pendingSpeak = null;
    logger.info('VOICE_BOOTSTRAP', `deferred_speak_flushed=true attempts=${pendingSpeak.attempts}`);
    this.speak(pendingSpeak.text, pendingSpeak.intentId);
  }

  private updateFallbackRecoveryLoop(): void {
    const { activeProfile, authority } = useVoiceStore.getState();
    const shouldRecover = activeProfile.provider === 'browser' && authority.preferredVoiceProvider === 'elevenlabs';
    if (!shouldRecover) {
      this.stopFallbackRecoveryLoop();
      return;
    }

    if (this.fallbackRecoveryTimer) {
      return;
    }

    const runRecovery = () => {
      this.fallbackRecoveryTimer = null;
      const now = Date.now();
      const ttlExpired = Boolean(this.browserFallbackDeadline && now >= this.browserFallbackDeadline);
      const snapshot = this.getVoiceRecoverySnapshot('fallback_monitor');
      logger.info('RUNTIME_VOICE_RECOVERY', `watchdog_tick ttl_expired=${String(ttlExpired)} active=${snapshot.activeProfileId} expected=${snapshot.expectedProfileId} socket_healthy=${String(snapshot.socketHealthy)}`);
      if (snapshot.shouldRecoverFromBrowserFallback) {
        logger.warn('VOICE_RECOVERY', `browser_fallback_stuck=true reason=fallback_monitor active=${snapshot.activeProfileId} expected=${snapshot.expectedProfileId}`);
      }
      if (ttlExpired || snapshot.providerValidationOk) {
        this.restoreStableProvider(ttlExpired ? 'fallback_ttl_expired' : 'fallback_monitor');
      }
      if (useVoiceStore.getState().activeProfile.provider === 'browser' && useVoiceStore.getState().authority.preferredVoiceProvider === 'elevenlabs') {
        this.fallbackRecoveryTimer = window.setTimeout(runRecovery, 2000);
      }
    };

    this.fallbackRecoveryTimer = window.setTimeout(runRecovery, 2000);
  }

  private stopFallbackRecoveryLoop(): void {
    if (!this.fallbackRecoveryTimer) {
      return;
    }
    clearTimeout(this.fallbackRecoveryTimer);
    this.fallbackRecoveryTimer = null;
  }

  private getVoiceRecoverySnapshot(reason: string): VoiceRecoverySnapshot {
    const { activeProfile, authority } = useVoiceStore.getState();
    const runtimeState = useRuntimeStore.getState();
    const authState = runtimeIdentity.getAuthState();
    const environmentState = runtimeState.environmentState;
    const socketHealth = socketRuntime.getHealthMetrics();
    const now = Date.now();
    const authStable = runtimeState.authTransitionState !== 'AUTH_SWITCHING'
      && runtimeState.authTransitionState !== 'AUTH_RESTORING'
      && authState !== AuthState.AUTHENTICATING
      && authState !== AuthState.RESTORING_SESSION;
    const hydrationStable = !runtimeState.hydrationBarrierActive;
    const socketHealthy = Boolean(environmentState?.coordination.websocketConnected ?? socketHealth.connected);
    const runtimeOperational = runtimeState.lifecycle !== 'BOOTING';
    const environmentDegraded = Boolean(environmentState?.modes.degraded || environmentState?.modes.offline || environmentState?.modes.recovery);
    const environmentRecovered = Boolean(environmentState && !environmentState.modes.offline && (!environmentState.modes.degraded || (authStable && hydrationStable && socketHealthy)));
    const recentFailure = authority.lastFailureAt ? (now - authority.lastFailureAt) < FALLBACK_LEASE_TTL_MS : false;
    const providerHealthy = authority.preferredVoiceProvider !== 'elevenlabs'
      || (!environmentState?.modes.offline && Boolean(environmentState?.capabilities.elevenLabsAvailability.available ?? true));
    const fallbackLeaseActive = authority.temporaryFallbackLease && activeProfile.id.startsWith('browser_fallback_');
    const fallbackLeaseDeadline = authority.fallbackLeaseStartedAt && authority.fallbackLeaseTTL
      ? authority.fallbackLeaseStartedAt + authority.fallbackLeaseTTL
      : this.browserFallbackDeadline;
    const fallbackLeaseRemainingMs = fallbackLeaseDeadline ? Math.max(0, fallbackLeaseDeadline - now) : 0;
    const fallbackLeaseExpired = fallbackLeaseActive && fallbackLeaseDeadline !== null ? now >= fallbackLeaseDeadline : false;
    const expectedProvider = authority.lockedProvider || authority.preferredVoiceProvider || authority.lastStableVoiceProvider;
    const expectedProfileId = authority.lockedProfileId
      || authority.activeVoiceProfileId.replace(/^browser_fallback_/, '')
      || this.environmentAwareProfile?.id
      || activeProfile.id.replace(/^browser_fallback_/, '');
    const providerValidationOk = authStable
      && hydrationStable
      && runtimeOperational
      && providerHealthy
      && !recentFailure
      && !environmentState?.modes.offline
      && (socketHealthy || environmentDegraded);
    const shouldRecoverFromBrowserFallback = activeProfile.provider === 'browser'
      && expectedProvider === 'elevenlabs'
      && activeProfile.id.startsWith('browser_fallback_')
      && (fallbackLeaseExpired || (providerValidationOk && fallbackLeaseRemainingMs <= FALLBACK_LEASE_TTL_MS - 1500));

    logger.info('PROVIDER_VALIDATION', `reason=${reason} auth_stable=${String(authStable)} hydration_stable=${String(hydrationStable)} socket_healthy=${String(socketHealthy)} runtime_operational=${String(runtimeOperational)} provider_healthy=${String(providerHealthy)} env_recovered=${String(environmentRecovered)} env_degraded=${String(environmentDegraded)} recent_failure=${String(recentFailure)}`);
    logger.info('VOICE_PROVIDER_STATE', `active=${activeProfile.provider} profile=${activeProfile.id} preferred=${authority.preferredVoiceProvider} locked=${authority.lockedProvider || 'none'} expected=${expectedProvider} expected_profile=${expectedProfileId} temporary_fallback=${String(fallbackLeaseActive)} lease_remaining_ms=${fallbackLeaseRemainingMs}`);
    logger.info('ENVIRONMENT_VOICE_COORDINATION', `reason=${reason} mode=${environmentState?.activeMode || 'unknown'} degraded=${String(environmentDegraded)} offline=${String(environmentState?.modes.offline || false)} recovery=${String(environmentState?.modes.recovery || false)} socket=${String(socketHealthy)} auth=${String(authStable)} runtime=${String(runtimeOperational)}`);

    return {
      activeProvider: activeProfile.provider,
      activeProfileId: activeProfile.id,
      preferredProvider: authority.preferredVoiceProvider,
      lockedProvider: authority.lockedProvider || 'none',
      lockedProfileId: authority.lockedProfileId || 'none',
      expectedProvider,
      expectedProfileId,
      authStable,
      hydrationStable,
      socketHealthy,
      runtimeOperational,
      environmentRecovered,
      environmentDegraded,
      providerHealthy,
      providerValidationOk,
      recentFailure,
      fallbackLeaseActive,
      fallbackLeaseExpired,
      fallbackLeaseReason: authority.fallbackLeaseReason || authority.providerFailureReason || 'none',
      fallbackLeaseRemainingMs,
      shouldRecoverFromBrowserFallback,
    };
  }
}

export const voiceRuntimeManager = VoiceRuntimeManager.getInstance();
