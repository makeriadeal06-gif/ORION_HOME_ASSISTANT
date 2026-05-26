import { create } from 'zustand';
import { VoiceAuthorityState, VoiceRecoveryState, VoiceState, VoiceProfile } from '../types';
import { logger } from '@core/logger/Logger';
import { runtimeIdentity } from '@core/runtime/RuntimeIdentity';
import { getScopedStorageValue, setScopedStorageValue } from '@core/runtime/ScopedBrowserStorage';

const VOICE_PROFILE_STORAGE_KEY = 'orion.voice.profile.v1';
const VOICE_AUTHORITY_STORAGE_KEY = 'orion.voice.authority.v1';
const VOICE_AUTHORITY_SESSION_STORAGE_KEY = 'orion.voice.authority.session.v1';

type VoiceProfileUpdateOptions = {
  preservePreferredProvider?: boolean;
  recoveryState?: VoiceRecoveryState;
  failureReason?: string | null;
  persistAsStable?: boolean;
  lockProvider?: boolean;
  unlockProvider?: boolean;
  lockReason?: string | null;
  forceLockOverride?: boolean;
  voiceId?: string;
  pacing?: string;
  naturalizationConfig?: string;
  latencyProfile?: string;
  streamMode?: string;
  startupBufferMs?: number;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speakerBoost?: boolean;
  optimizeStreamingLatency?: number;
  modelId?: string;
  outputFormat?: string;
  temporaryFallbackLease?: boolean;
  fallbackLeaseStartedAt?: number | null;
  fallbackLeaseTTL?: number | null;
  fallbackLeaseReason?: string | null;
  fallbackLeaseReleasedAt?: number | null;
  restoringProvider?: VoiceProfile['provider'] | null;
  recoveredProvider?: VoiceProfile['provider'] | null;
  providerRecoveredAt?: number | null;
};

interface VoiceStore {
  state: VoiceState;
  activeProfile: VoiceProfile;
  authority: VoiceAuthorityState;
  lastRecognizedText: string | null;
  lastSpokenText: string | null;
  
  setState: (state: VoiceState) => void;
  setProfile: (profile: VoiceProfile, options?: VoiceProfileUpdateOptions) => void;
  setAuthorityRecoveryState: (providerRecoveryState: VoiceRecoveryState, providerFailureReason?: string | null) => void;
  markProviderFailure: (providerFailureReason: string) => void;
  lockProvider: (provider: VoiceProfile['provider'], voiceId: string, profileId: string, lockReason: string) => void;
  unlockProvider: (lockReason?: string | null) => void;
  setLastRecognized: (text: string) => void;
  setLastSpoken: (text: string) => void;
}

const DEFAULT_PROFILE: VoiceProfile = {
  id: 'eleven_rachel',
  name: 'Rachel (ElevenLabs)',
  pitch: 1.0,
  rate: 0.96,
  provider: 'elevenlabs'
};

function createDefaultAuthority(): VoiceAuthorityState {
  return {
    ownerId: runtimeIdentity.getOwnerId(),
    runtimeSessionId: runtimeIdentity.getRuntimeSessionId(),
    runtimeDeviceId: runtimeIdentity.getRuntimeDeviceId(),
    activeVoiceProvider: DEFAULT_PROFILE.provider,
    preferredVoiceProvider: DEFAULT_PROFILE.provider,
    lastStableVoiceProvider: DEFAULT_PROFILE.provider,
    activeVoiceProfileId: DEFAULT_PROFILE.id,
    activeVoiceId: DEFAULT_PROFILE.id,
    providerLocked: true,
    lockedProvider: DEFAULT_PROFILE.provider,
    lockedVoiceId: DEFAULT_PROFILE.id,
    lockedProfileId: DEFAULT_PROFILE.id,
    lockedAt: Date.now(),
    lockReason: 'default_elevenlabs_lock',
    providerRecoveryState: 'stable',
    providerFailureReason: null,
    temporaryFallbackLease: false,
    fallbackLeaseStartedAt: null,
    fallbackLeaseTTL: null,
    fallbackLeaseReason: null,
    fallbackLeaseReleasedAt: null,
    restoringProvider: null,
    recoveredProvider: DEFAULT_PROFILE.provider,
    providerRecoveredAt: Date.now(),
    speechRate: DEFAULT_PROFILE.rate,
    pacing: 'conversational_soft',
    naturalizationConfig: 'default_orion_naturalization',
    latencyProfile: 'stream_soft',
    streamMode: 'stream_soft',
    startupBufferMs: 160,
    stability: 0.64,
    similarityBoost: 0.78,
    style: 0.18,
    speakerBoost: true,
    optimizeStreamingLatency: 2,
    modelId: 'eleven_multilingual_v2',
    outputFormat: 'mp3_44100_128',
    updatedAt: Date.now(),
    lastStableAt: Date.now(),
    lastFailureAt: null,
  };
}

function getSessionAuthorityStorageKey(): string {
  return [
    VOICE_AUTHORITY_SESSION_STORAGE_KEY,
    runtimeIdentity.getOwnerId() || 'preview',
    runtimeIdentity.getRuntimeSessionId(),
    runtimeIdentity.getRuntimeDeviceId(),
  ].join('_');
}

function normalizeAuthority(authority: Partial<VoiceAuthorityState> | null | undefined, profile: VoiceProfile): VoiceAuthorityState {
  const baseline = createDefaultAuthority();
  return {
    ...baseline,
    ...authority,
    ownerId: runtimeIdentity.getOwnerId(),
    runtimeSessionId: runtimeIdentity.getRuntimeSessionId(),
    runtimeDeviceId: runtimeIdentity.getRuntimeDeviceId(),
    activeVoiceProvider: authority?.activeVoiceProvider || profile.provider,
    preferredVoiceProvider: authority?.preferredVoiceProvider || profile.provider,
    lastStableVoiceProvider: authority?.lastStableVoiceProvider || profile.provider,
    activeVoiceProfileId: authority?.activeVoiceProfileId || profile.id,
    activeVoiceId: authority?.activeVoiceId || profile.id,
    speechRate: authority?.speechRate || profile.rate,
    updatedAt: Date.now(),
  };
}

function rebuildProfileFromAuthority(authority: VoiceAuthorityState, fallbackProfile: VoiceProfile = DEFAULT_PROFILE): VoiceProfile {
  const provider = authority.lockedProvider || authority.activeVoiceProvider || authority.preferredVoiceProvider || fallbackProfile.provider;
  const profileId = authority.lockedProfileId || authority.activeVoiceProfileId || fallbackProfile.id;
  const voiceId = authority.lockedVoiceId || authority.activeVoiceId || profileId;
  const providerLabel = provider === 'elevenlabs' ? 'ElevenLabs' : provider === 'browser' ? 'Browser' : provider;
  return {
    id: profileId,
    name: profileId === fallbackProfile.id ? fallbackProfile.name : `${voiceId} (${providerLabel})`,
    pitch: fallbackProfile.pitch,
    rate: authority.speechRate || fallbackProfile.rate,
    provider,
  };
}

function sanitizeAuthorityForPersistence(authority: VoiceAuthorityState): VoiceAuthorityState {
  if (!authority.temporaryFallbackLease || !authority.activeVoiceProfileId.startsWith('browser_fallback_')) {
    return authority;
  }

  const restoredProvider = authority.lockedProvider || authority.preferredVoiceProvider || authority.lastStableVoiceProvider;
  const restoredProfileId = authority.lockedProfileId || authority.activeVoiceProfileId.replace(/^browser_fallback_/, '');
  const restoredVoiceId = authority.lockedVoiceId || authority.activeVoiceId.replace(/^browser_fallback_/, '');

  return normalizeAuthority({
    ...authority,
    activeVoiceProvider: restoredProvider,
    activeVoiceProfileId: restoredProfileId,
    activeVoiceId: restoredVoiceId,
    providerRecoveryState: restoredProvider === 'elevenlabs' ? 'recovering_provider' : 'stable',
    temporaryFallbackLease: false,
    fallbackLeaseStartedAt: null,
    fallbackLeaseTTL: null,
    fallbackLeaseReason: null,
  }, DEFAULT_PROFILE);
}

function writeAuthorityToStorage(authority: VoiceAuthorityState): void {
  const serialized = JSON.stringify(authority);
  setScopedStorageValue(VOICE_AUTHORITY_STORAGE_KEY, serialized);
  window.localStorage.setItem(getSessionAuthorityStorageKey(), serialized);
}

export const useVoiceStore = create<VoiceStore>((set) => ({
  state: VoiceState.IDLE,
  activeProfile: DEFAULT_PROFILE,
  authority: createDefaultAuthority(),
  lastRecognizedText: null,
  lastSpokenText: null,

  setState: (state) => set({ state }),
  setProfile: (profile, options = {}) => set((currentState) => {
    const authority = currentState.authority;
    if (
      authority.providerLocked
      && !options.forceLockOverride
      && authority.lockedProvider
      && (authority.lockedProvider !== profile.provider || authority.lockedProfileId !== profile.id)
    ) {
      logger.warn(
        'PROVIDER_OVERRIDE',
        `blocked=true requested_provider=${profile.provider} requested_profile=${profile.id} locked_provider=${authority.lockedProvider} locked_profile=${authority.lockedProfileId || 'none'} reason=${authority.lockReason || 'provider_lock'}`
      );
      return currentState;
    }

    const shouldLockProvider = options.lockProvider ?? (profile.provider === 'elevenlabs');
    const unlockProvider = options.unlockProvider === true;

    const resolvedVoiceId = options.voiceId
      || (profile.provider === 'elevenlabs' && authority.lockedVoiceId && authority.lockedVoiceId !== 'eleven_rachel' && !authority.lockedVoiceId.startsWith('browser_fallback_') ? authority.lockedVoiceId : null)
      || (profile.provider === 'elevenlabs' && authority.activeVoiceId && authority.activeVoiceId !== 'eleven_rachel' && !authority.activeVoiceId.startsWith('browser_fallback_') ? authority.activeVoiceId : profile.id);

    const nextAuthority = normalizeAuthority({
      ...authority,
      activeVoiceProvider: profile.provider,
      activeVoiceProfileId: profile.id,
      activeVoiceId: resolvedVoiceId,
      providerLocked: unlockProvider ? false : (shouldLockProvider || authority.providerLocked),
      lockedProvider: unlockProvider ? null : (shouldLockProvider ? profile.provider : authority.lockedProvider),
      lockedVoiceId: unlockProvider ? null : (shouldLockProvider ? resolvedVoiceId : authority.lockedVoiceId),
      lockedProfileId: unlockProvider ? null : (shouldLockProvider ? profile.id : authority.lockedProfileId),
      lockedAt: unlockProvider ? null : (shouldLockProvider ? Date.now() : authority.lockedAt),
      lockReason: unlockProvider ? (options.lockReason || 'provider_unlock') : (shouldLockProvider ? (options.lockReason || 'provider_lock') : authority.lockReason),
      providerRecoveryState: options.recoveryState || (profile.provider === 'browser' ? 'temporary_browser_fallback' : 'stable'),
      providerFailureReason: options.failureReason ?? null,
      temporaryFallbackLease: options.temporaryFallbackLease ?? false,
      fallbackLeaseStartedAt: options.temporaryFallbackLease
        ? (options.fallbackLeaseStartedAt ?? Date.now())
        : null,
      fallbackLeaseTTL: options.temporaryFallbackLease
        ? (options.fallbackLeaseTTL ?? authority.fallbackLeaseTTL ?? 12000)
        : null,
      fallbackLeaseReason: options.temporaryFallbackLease
        ? (options.fallbackLeaseReason ?? options.failureReason ?? authority.providerFailureReason ?? null)
        : null,
      fallbackLeaseReleasedAt: options.fallbackLeaseReleasedAt
        ?? (options.temporaryFallbackLease ? authority.fallbackLeaseReleasedAt : Date.now()),
      restoringProvider: options.restoringProvider
        ?? ((options.recoveryState === 'recovering_provider' || options.temporaryFallbackLease) ? (authority.preferredVoiceProvider || profile.provider) : null),
      recoveredProvider: options.recoveredProvider
        ?? (!options.temporaryFallbackLease && profile.provider !== 'browser' ? profile.provider : authority.recoveredProvider),
      providerRecoveredAt: options.providerRecoveredAt
        ?? (!options.temporaryFallbackLease && profile.provider !== 'browser' ? Date.now() : authority.providerRecoveredAt),
      speechRate: profile.rate,
      pacing: options.pacing || authority.pacing || 'conversational_soft',
      naturalizationConfig: options.naturalizationConfig || authority.naturalizationConfig || 'default_orion_naturalization',
      latencyProfile: options.latencyProfile || authority.latencyProfile || (profile.provider === 'elevenlabs' ? 'stream_soft' : 'browser_native'),
      streamMode: options.streamMode || authority.streamMode || 'stream_soft',
      startupBufferMs: options.startupBufferMs ?? authority.startupBufferMs ?? 160,
      stability: options.stability ?? authority.stability ?? 0.64,
      similarityBoost: options.similarityBoost ?? authority.similarityBoost ?? 0.78,
      style: options.style ?? authority.style ?? 0.18,
      speakerBoost: options.speakerBoost ?? authority.speakerBoost ?? true,
      optimizeStreamingLatency: options.optimizeStreamingLatency ?? authority.optimizeStreamingLatency ?? 2,
      modelId: options.modelId || authority.modelId || 'eleven_multilingual_v2',
      outputFormat: options.outputFormat || authority.outputFormat || 'mp3_44100_128',
      preferredVoiceProvider: options.preservePreferredProvider
        ? authority.preferredVoiceProvider
        : profile.provider,
      lastStableVoiceProvider: options.persistAsStable === false || profile.provider === 'browser'
        ? authority.lastStableVoiceProvider
        : profile.provider,
      lastStableAt: options.persistAsStable === false || profile.provider === 'browser'
        ? authority.lastStableAt
        : Date.now(),
      lastFailureAt: options.failureReason ? Date.now() : (options.recoveryState === 'stable' ? null : authority.lastFailureAt),
    }, profile);
    logger.info(
      'PROVIDER_LOCK',
      `locked=${String(nextAuthority.providerLocked)} provider=${nextAuthority.lockedProvider || 'none'} voice=${nextAuthority.lockedVoiceId || 'none'} profile=${nextAuthority.lockedProfileId || 'none'} reason=${nextAuthority.lockReason || 'none'}`
    );
    return {
      activeProfile: profile,
      authority: nextAuthority,
    };
  }),
  setAuthorityRecoveryState: (providerRecoveryState, providerFailureReason = null) => set((currentState) => ({
    authority: normalizeAuthority({
      ...currentState.authority,
      providerRecoveryState,
      providerFailureReason,
      lastFailureAt: providerFailureReason ? Date.now() : currentState.authority.lastFailureAt,
    }, currentState.activeProfile),
  })),
  markProviderFailure: (providerFailureReason) => set((currentState) => ({
    authority: normalizeAuthority({
      ...currentState.authority,
      providerRecoveryState: 'provider_error',
      providerFailureReason,
      lastFailureAt: Date.now(),
    }, currentState.activeProfile),
  })),
  lockProvider: (provider, voiceId, profileId, lockReason) => set((currentState) => ({
    authority: normalizeAuthority({
      ...currentState.authority,
      providerLocked: true,
      lockedProvider: provider,
      lockedVoiceId: voiceId,
      lockedProfileId: profileId,
      lockedAt: Date.now(),
      lockReason,
    }, currentState.activeProfile),
  })),
  unlockProvider: (lockReason = 'provider_unlock') => set((currentState) => ({
    authority: normalizeAuthority({
      ...currentState.authority,
      providerLocked: false,
      lockedProvider: null,
      lockedVoiceId: null,
      lockedProfileId: null,
      lockedAt: null,
      lockReason,
    }, currentState.activeProfile),
  })),
  setLastRecognized: (text) => set({ lastRecognizedText: text }),
  setLastSpoken: (text) => set({ lastSpokenText: text })
}));

runtimeIdentity.init();

function restoreScopedVoiceProfile(): void {
  if (runtimeIdentity.isPreviewMode()) {
    useVoiceStore.setState({ activeProfile: DEFAULT_PROFILE, authority: createDefaultAuthority() });
    logger.info('STORAGE_SCOPE', 'voice_profile_preview_reset=true');
    return;
  }

  try {
    const authoritySources = [
      window.localStorage.getItem(getSessionAuthorityStorageKey()),
      getScopedStorageValue(VOICE_AUTHORITY_STORAGE_KEY),
    ].filter(Boolean) as string[];
    const restoredAuthority = authoritySources[0] ? normalizeAuthority(JSON.parse(authoritySources[0]), DEFAULT_PROFILE) : null;
    const raw = getScopedStorageValue(VOICE_PROFILE_STORAGE_KEY);
    if (!raw) {
      const authority = restoredAuthority || createDefaultAuthority();
      const restoredProfile = rebuildProfileFromAuthority(authority, DEFAULT_PROFILE);
      useVoiceStore.setState({ activeProfile: restoredProfile, authority });
      logger.info('PROFILE_RESTORE', `source=authority_only owner=${authority.ownerId || 'preview'} profile=${restoredProfile.id} provider=${restoredProfile.provider}`);
      return;
    }

    const parsed = JSON.parse(raw) as VoiceProfile;
    if (!parsed?.id || !parsed?.provider) {
      throw new Error('INVALID_VOICE_PROFILE');
    }
    const authority = restoredAuthority ? normalizeAuthority(restoredAuthority, parsed) : normalizeAuthority(null, parsed);
    const restoredProfile = authority.providerLocked
      || authority.preferredVoiceProvider !== parsed.provider
      || authority.temporaryFallbackLease
      || parsed.id.startsWith('browser_fallback_')
      ? rebuildProfileFromAuthority(authority, parsed)
      : parsed;
    useVoiceStore.setState({ activeProfile: restoredProfile, authority });
    logger.info('VOICE_PERSISTENCE', `authority_restored owner=${authority.ownerId || 'preview'} session=${authority.runtimeSessionId} device=${authority.runtimeDeviceId} provider=${authority.activeVoiceProvider} preferred=${authority.preferredVoiceProvider}`);
    logger.info('PROFILE_RESTORE', `source=profile_storage owner=${runtimeIdentity.getOwnerId() || 'preview'} profile=${restoredProfile.id} provider=${restoredProfile.provider}`);
    logger.info('PROVIDER_LOCK', `restored locked=${String(authority.providerLocked)} provider=${authority.lockedProvider || 'none'} profile=${authority.lockedProfileId || 'none'} reason=${authority.lockReason || 'none'}`);
    logger.info('STORAGE_SCOPE', `voice_profile_restored owner=${runtimeIdentity.getOwnerId() || 'preview'} profile=${restoredProfile.id}`);
  } catch (error: any) {
    useVoiceStore.setState({ activeProfile: DEFAULT_PROFILE, authority: createDefaultAuthority() });
    logger.warn('VOICE_REGRESSION', `restore_reset_to_default=true error=${error?.message || error}`);
    logger.warn('STORAGE_SCOPE', `voice_profile_restore_failed error=${error?.message || error}`);
  }
}

restoreScopedVoiceProfile();

useVoiceStore.subscribe((state, previousState) => {
  if (
    state.activeProfile.id === previousState.activeProfile.id
    && state.activeProfile.provider === previousState.activeProfile.provider
    && JSON.stringify(state.authority) === JSON.stringify(previousState.authority)
  ) {
    return;
  }

  if (runtimeIdentity.isPreviewMode()) {
    return;
  }

  try {
    const persistedAuthority = sanitizeAuthorityForPersistence(normalizeAuthority(state.authority, state.activeProfile));
    const persistedProfile = persistedAuthority.activeVoiceProfileId !== state.activeProfile.id || state.authority.temporaryFallbackLease
      ? rebuildProfileFromAuthority(persistedAuthority, state.activeProfile)
      : state.activeProfile;
    if (setScopedStorageValue(VOICE_PROFILE_STORAGE_KEY, JSON.stringify(persistedProfile))) {
      logger.info('STORAGE_SCOPE', `voice_profile_persisted owner=${runtimeIdentity.getOwnerId() || 'preview'} profile=${persistedProfile.id}`);
    }
    writeAuthorityToStorage(persistedAuthority);
    logger.info('VOICE_PERSISTENCE', `authority_persisted owner=${runtimeIdentity.getOwnerId() || 'preview'} session=${runtimeIdentity.getRuntimeSessionId()} device=${runtimeIdentity.getRuntimeDeviceId()} provider=${persistedAuthority.activeVoiceProvider} preferred=${persistedAuthority.preferredVoiceProvider} stable=${persistedAuthority.lastStableVoiceProvider} temporary_fallback=${String(state.authority.temporaryFallbackLease)}`);
  } catch (error: any) {
    logger.warn('STORAGE_SCOPE', `voice_profile_persist_failed error=${error?.message || error}`);
  }
});

runtimeIdentity.subscribe((snapshot, previousSnapshot) => {
  if (snapshot.runtimeSessionId === previousSnapshot.runtimeSessionId) {
    return;
  }
  restoreScopedVoiceProfile();
});
