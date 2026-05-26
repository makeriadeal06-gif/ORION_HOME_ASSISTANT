import { BrowserSTTAdapter } from '../adapters/stt/BrowserSTTAdapter';
import { BrowserTTSAdapter } from '../adapters/tts/BrowserTTSAdapter';
import { ElevenLabsTTSAdapter } from '../adapters/tts/ElevenLabsTTSAdapter';
import { ISTTAdapter, ITTSAdapter, VoiceState } from '../types';
import { voiceStateEngine } from '../state/VoiceStateEngine';
import { speechSessionManager } from '../session/SpeechSessionManager';
import { useVoiceStore } from '../state/useVoiceStore';
import { cognitiveEventBus } from '../../cognitive-runtime/bus/CognitiveEventBus';
import { logger } from '../../logger/Logger';
import { triggerManager } from '../../runtime/TriggerManager';
import { findBestMatch, normalizeText, MATCH_CONFIDENCE_THRESHOLD } from '../utils/voiceMatcher';
import { parseTaskTimingDirective } from '@core/task-runtime/TaskIntentTiming';
import { automationStoreService } from '@core/automation-runtime/AutomationStore';
import { presenceRuntime } from '@core/presence/PresenceRuntime';

type VoiceLatencySnapshot = {
  listeningStartedAt: number;
  sttFinalizedAt?: number;
  intentResolvedAt?: number;
  executionStartedAt?: number;
  executionFinishedAt?: number;
  ttsRequestStartedAt?: number;
  ttsResponseReadyAt?: number;
  ttsFirstAudioAt?: number;
  playbackStartedAt?: number;
};

export class SpeechPipeline {
  private static instance: SpeechPipeline;
  
  private sttAdapter: ISTTAdapter;
  private ttsAdapter: ITTSAdapter;
  private elevenLabsAdapter: ITTSAdapter;
  private currentAdapter: ITTSAdapter | null = null;
  private isQueueProcessing = false;
  private activePlaybackSessionId: string | null = null;
  private activeIntentId: string | null = null;
  private lastHandledExecutionIntentId: string | null = null;
  private shouldAutoRestartListening = false;
  private restartListeningTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastListeningStartedAt = 0;
  private readonly latencyByIntent = new Map<string, VoiceLatencySnapshot>();
  private readonly intentPipelinePromise = import('@core/cognitive-runtime/pipeline/IntentPipeline');
  private readonly diagnosticElevenLabsOnly =
    typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_VOICE_PROVIDER_DIAGNOSTIC === 'true';

  private constructor() {
    this.sttAdapter = new BrowserSTTAdapter();
    this.ttsAdapter = new BrowserTTSAdapter();
    this.elevenLabsAdapter = new ElevenLabsTTSAdapter();
    
    cognitiveEventBus.on('cognition:execution_finished', (payload) => {
      const intent = payload?.intent || payload;
      if (!intent || intent.type !== 'COMMAND') {
        return;
      }

      if (!this.activeIntentId || intent.id !== this.activeIntentId) {
        logger.info('VOICE_TTS', `stale_execution_ignored intent=${intent?.id || 'none'} activeIntent=${this.activeIntentId || 'none'}`);
        return;
      }

      if (this.lastHandledExecutionIntentId === intent.id) {
        logger.info('VOICE_TTS', `duplicate_execution_ignored intent=${intent.id}`);
        return;
      }

      this.lastHandledExecutionIntentId = intent.id;

      const latency = this.latencyByIntent.get(intent.id);
      if (latency) {
        latency.executionStartedAt = payload?.metrics?.executionStartedAt || latency.executionStartedAt || Date.now();
        latency.executionFinishedAt = payload?.metrics?.executionFinishedAt || Date.now();
      }

      const message = this.buildExecutionAckMessage(intent);
      logger.info('VOICE_TTS', 'speaking: ' + message);
      this.speak(message, intent.id);
    });

    cognitiveEventBus.on('cognition:aborted', () => {
      this.interrupt();
    });
  }

  public static getInstance(): SpeechPipeline {
    if (!SpeechPipeline.instance) {
      SpeechPipeline.instance = new SpeechPipeline();
    }
    return SpeechPipeline.instance;
  }

  /**
   * Push-to-talk trigger.
   */
  public startListening() {
    this.shouldAutoRestartListening = true;
    this.clearPendingRestart();

    if (this.activePlaybackSessionId || this.isQueueProcessing || voiceStateEngine.getState() === VoiceState.PROCESSING) {
      logger.info(
        'VOICE_PIPELINE',
        `start_listening_deferred activePlayback=${this.activePlaybackSessionId || 'none'} queueProcessing=${this.isQueueProcessing} state=${voiceStateEngine.getState()}`
      );
      return;
    }

    if (voiceStateEngine.getState() === VoiceState.SPEAKING) {
      // Explicit user restart while speaking still interrupts current playback.
      this.interrupt();
    }

    this.lastListeningStartedAt = Date.now();
    voiceStateEngine.transitionTo(VoiceState.LISTENING, 15000); // 15s timeout
    logger.trace('VOICE_PIPELINE', 'Listening started.');

    this.sttAdapter.startListening(
      (text) => this.onSpeechDetected(text),
      (err) => this.onSpeechError(err)
    );
  }

  public stopListening() {
    this.shouldAutoRestartListening = false;
    this.clearPendingRestart();
    this.sttAdapter.stopListening();
    if (voiceStateEngine.getState() === VoiceState.LISTENING) {
      voiceStateEngine.resetToIdle();
    }
  }

  private onSpeechDetected(text: string) {
    const sttFinalizedAt = Date.now();
    logger.info('VOICE_INPUT', `transcript="${text}"`);
    useVoiceStore.getState().setLastRecognized(text);
    presenceRuntime.setCognitiveState('understanding', 'speech_detected');
    
    this.sttAdapter.stopListening();
    voiceStateEngine.transitionTo(VoiceState.PROCESSING, 5000);

    const currentUserId = triggerManager.getUserId();
    const followupResolution = presenceRuntime.resolveFollowup(text);
    const taskTiming = parseTaskTimingDirective(followupResolution.resolvedText);
    const normalizedText = normalizeText(taskTiming.cleanedText || followupResolution.resolvedText || text);
    const devices = triggerManager.getDevices();
    logger.info(
      'VOICE_TEMPORAL',
      `timing_kind=${taskTiming.timingKind || 'none'} delayed=${taskTiming.isDelayed} matched="${taskTiming.matchedText || 'none'}" cleaned="${taskTiming.cleanedText}" followup=${followupResolution.followup} chainId=${followupResolution.chainId}`
    );
    logger.info(
      'VOICE_NORMALIZE',
      `normalized="${normalizedText}" currentUserId=${currentUserId || 'none'} deviceCount=${devices.length} delayed=${taskTiming.isDelayed}`
    );

    const matchResult = findBestMatch(normalizedText, devices);
    const candidateSummary = matchResult.candidates
      .map((candidate) => `${candidate.name}:${candidate.confidence}:${candidate.matchType}`)
      .join(', ');

    logger.info(
      'VOICE_INTENT',
      `action_candidate="${matchResult.resolvedInput || normalizedText}" aliasApplied=${matchResult.aliasApplied} delayed=${taskTiming.isDelayed}`
    );
    logger.info(
      'VOICE_MATCH',
      `candidates_found=${matchResult.candidates.length} confidence=${matchResult.confidence} type=${matchResult.matchType} candidates=[${candidateSummary}]`
    );

    if (!currentUserId) {
      logger.warn('VOICE_DISPATCH', 'dispatch_skipped reason=no_authenticated_user');
      this.activeIntentId = null;
      voiceStateEngine.resetToIdle();
      this.scheduleListeningRestart();
      return;
    }

    const voiceAutomation = automationStoreService.matchVoiceTriggeredAutomation(normalizedText, currentUserId);
    if (voiceAutomation) {
      logger.info('AUTOMATION_EXECUTION', `voice_trigger_matched automationId=${voiceAutomation.id} phrase="${normalizedText}"`);
      automationStoreService.runAutomation(voiceAutomation.id, 'voice_trigger');
      this.activeIntentId = null;
      voiceStateEngine.resetToIdle();
      this.scheduleListeningRestart();
      return;
    }

    if (matchResult.matchType === 'multiple_matches') {
      logger.warn('VOICE_MATCH', `ambiguous_candidates=${matchResult.candidates.length}`);
      logger.warn('VOICE_DISPATCH', 'dispatch_skipped reason=multiple_matches');
      this.activeIntentId = null;
      voiceStateEngine.resetToIdle();
      this.scheduleListeningRestart();
      return;
    }

    if (!matchResult.device || matchResult.confidence < MATCH_CONFIDENCE_THRESHOLD) {
      logger.warn('VOICE_DISPATCH', `dispatch_skipped reason=low_confidence confidence=${matchResult.confidence}`);
      this.activeIntentId = null;
      voiceStateEngine.resetToIdle();
      this.scheduleListeningRestart();
      return;
    }

    const action = matchResult.device.name;
    const deviceId = matchResult.device.id;
    const deviceName = matchResult.device.name;

    logger.info(
      'VOICE_DISPATCH',
      `trigger="${deviceName}" deviceId=${deviceId} confidence=${matchResult.confidence} matchType=${matchResult.matchType}`
    );
     
    const mockIntent = {
      id: Math.random().toString(36).substring(7),
      type: 'COMMAND',
      status: 'PENDING',
      source: 'VOICE',
      payload: { 
        deviceId: deviceId, 
        deviceName: deviceName,
        action: action, 
        rawText: text,
        chainId: followupResolution.chainId,
        normalizedText: normalizedText,
        resolvedText: matchResult.resolvedInput,
        matchConfidence: matchResult.confidence,
        matchType: matchResult.matchType,
        matchCandidates: matchResult.candidates,
        triggerUserId: currentUserId,
        taskTiming,
        followup: followupResolution.followup,
      },
      timestamp: Date.now()
    };
    presenceRuntime.recordCommandContext({
      id: mockIntent.id,
      chainId: followupResolution.chainId,
      rawText: text,
      normalizedText,
      action,
      target: deviceName,
      followup: followupResolution.followup,
    });
    this.activeIntentId = mockIntent.id;
    this.latencyByIntent.set(mockIntent.id, {
      listeningStartedAt: this.lastListeningStartedAt || sttFinalizedAt,
      sttFinalizedAt,
      intentResolvedAt: Date.now(),
    });
    logger.info('VOICE_STT_SESSION', `intent_session_bound intent=${mockIntent.id}`);
    
    this.intentPipelinePromise.then(async ({ intentPipeline }) => {
       presenceRuntime.setCognitiveState('processing', 'intent_forward');
       logger.info('VOICE_INTENT', `intent_type=COMMAND trigger="${deviceName}"`);
       logger.info('VOICE_DISPATCH', `intent_forwarded id=${mockIntent.id}`);
        await intentPipeline.receive(mockIntent as any);
    }).catch(err => {
       logger.error('VOICE_PIPELINE', `Failed to load IntentPipeline: ${err}`);
       this.latencyByIntent.delete(mockIntent.id);
       this.activeIntentId = null;
       voiceStateEngine.resetToIdle();
       this.scheduleListeningRestart();
    });
  }

  private onSpeechError(err: any) {
    if (err !== 'no-speech' && err !== 'aborted') {
      logger.error('VOICE_PIPELINE', `STT Error: ${err}`);
    }
    if (this.activeIntentId) {
      this.latencyByIntent.delete(this.activeIntentId);
    }
    this.activeIntentId = null;
    voiceStateEngine.resetToIdle();
    this.scheduleListeningRestart();
  }

  /**
   * Speaks text using the current Voice Profile.
   * Enqueues the session and plays it.
   */
  public speak(text: string, intentId?: string) {
    // Suspend STT to prevent anti-self-listening
    this.sttAdapter.pauseListening();

    const naturalizedText = this.naturalizeSpeechText(text);

    const session = speechSessionManager.enqueueSession(naturalizedText);
    const resolvedIntentId = intentId || this.activeIntentId || undefined;
    if (resolvedIntentId) {
      const latency = this.latencyByIntent.get(resolvedIntentId);
      if (latency) {
        latency.ttsRequestStartedAt = Date.now();
      }
    }
    logger.info('VOICE_TTS', `response_flow enqueue session=${session.id}`);
    void this.processSpeechQueue(resolvedIntentId);
  }

  private processSpeechQueue(intentId?: string) {
    if (this.isQueueProcessing) {
      logger.info('VOICE_TTS', `queue_busy=true activeSession=${this.activePlaybackSessionId || 'none'}`);
      return;
    }

    const session = speechSessionManager.getNextSession();
    if (!session) {
      this.isQueueProcessing = false;
      this.activePlaybackSessionId = null;
      // Queue empty, restore listening capability
      this.sttAdapter.resumeListening();
      voiceStateEngine.resetToIdle();
      logger.info('VOICE_TTS', 'queue_idle=true');
      return;
    }

    this.isQueueProcessing = true;
    this.activePlaybackSessionId = session.id;
    const requestId = `${session.id}_${Date.now()}`;

    voiceStateEngine.transitionTo(VoiceState.SPEAKING, 30000); // Max 30s speaking
    useVoiceStore.getState().setLastSpoken(session.text);

    const profile = useVoiceStore.getState().activeProfile;
    const authority = useVoiceStore.getState().authority;
    logger.info('VOICE_PROFILE', `active_provider=${profile.provider}`);
    logger.info('VOICE_PROFILE', `active_voice_id=${profile.id}`);
    logger.info('VOICE_PROFILE', 'hydrated_profile=true');
    logger.info('PLAYBACK_AUTHORITY', `session=${session.id} provider=${profile.provider} profile=${profile.id} active_voice_id=${authority.activeVoiceId} preferred=${authority.preferredVoiceProvider} locked=${authority.lockedProvider || 'none'} recovery=${authority.providerRecoveryState} temporary_fallback=${String(authority.temporaryFallbackLease)}`);

    // Check if session was aborted before starting
    if (session.abortController.signal.aborted) {
      this.finishSession(session.id);
      this.processSpeechQueue();
      return;
    }

    const provider = profile.provider;
    logger.info('VOICE_PROVIDER', `selected=${provider}`);
    logger.info('PLAYBACK_PROVIDER', `provider=${provider} profile=${profile.id}`);
    if (this.diagnosticElevenLabsOnly) {
      logger.info('VOICE_PROVIDER', 'diagnostic_mode=elevenlabs_only');
    }

    let adapter: ITTSAdapter;
    if (provider === 'elevenlabs') {
      adapter = this.elevenLabsAdapter;
      this.ttsAdapter.stopSpeaking();
    } else {
      adapter = this.ttsAdapter;
      this.elevenLabsAdapter.stopSpeaking();
    }

    this.currentAdapter = adapter;
    logger.info('VOICE_PLAYBACK', `source=${provider}`);

    adapter.speak(
      session.text,
      profile,
      () => {
        if (this.activePlaybackSessionId !== session.id) {
          logger.info('VOICE_TTS', `stale_onEnd_ignored session=${session.id}`);
          return;
        }
        logger.info('VOICE_PIPELINE', `Session ${session.id} completed via ${profile.provider}`);
        if (profile.provider !== 'browser') {
          useVoiceStore.getState().setAuthorityRecoveryState('stable');
          logger.info('ELEVENLABS_RUNTIME', `playback_completed provider=${profile.provider} session=${session.id}`);
        }
        this.finishSession(session.id, intentId);
        this.processSpeechQueue();
      },
      (err) => {
        if (this.activePlaybackSessionId !== session.id) {
          logger.info('VOICE_TTS', `stale_onError_ignored session=${session.id}`);
          return;
        }

        const errorMessage = err?.message || String(err || 'unknown_error');
        const fallbackReason = err?.code || err?.name || 'unknown_error';
        const fallbackEligible = Boolean(err?.fallbackEligible);
        logger.error('VOICE_PIPELINE', `TTS error session=${session.id} provider=${profile.provider}: ${errorMessage}`);
        logger.error('PLAYBACK_FAILED', `session=${session.id} provider=${profile.provider} request=${requestId} fallback_eligible=${String(fallbackEligible)} reason=${fallbackReason} message=${errorMessage}`);
        useVoiceStore.getState().markProviderFailure(fallbackReason);
        logger.warn('VOICE_PROVIDER_HEALTH', `provider=${profile.provider} degraded=true reason=${fallbackReason}`);

        if (profile.provider === 'elevenlabs' && this.shouldFallbackToBrowser(err)) {
          if (this.diagnosticElevenLabsOnly) {
            logger.warn('VOICE_PROVIDER', `fallback_blocked diagnostic=true reason=${fallbackReason}`);
            this.finishSession(session.id, intentId);
            this.processSpeechQueue();
            return;
          }

          logger.warn('BROWSER_FALLBACK_TRIGGER', `session=${session.id} request=${requestId} previous_provider=elevenlabs reason=${fallbackReason} message=${errorMessage}`);
          logger.warn('FALLBACK_REASON', `provider=elevenlabs session=${session.id} request=${requestId} reason=${fallbackReason}`);
          logger.warn('VOICE_PROVIDER', `fallback_triggered reason=${fallbackReason}`);
          logger.warn('VOICE_PROVIDER', `fallback_reason=${fallbackReason}`);
          logger.info('VOICE_PROVIDER', 'fallback=browser');
          logger.warn('VOICE_DEGRADATION', `provider=browser reason=${fallbackReason} previous=elevenlabs`);
          useVoiceStore.getState().setAuthorityRecoveryState('temporary_browser_fallback', fallbackReason);

          const fallbackAdapter = this.ttsAdapter;
          this.currentAdapter = fallbackAdapter;
          fallbackAdapter.speak(
            session.text,
            { ...profile, provider: 'browser' },
            () => {
              if (this.activePlaybackSessionId !== session.id) {
                logger.info('VOICE_TTS', `stale_browser_onEnd_ignored session=${session.id}`);
                return;
              }
              logger.info('PLAYBACK_FINISHED', `session=${session.id} provider=browser request=${requestId}_browser_fallback`);
              logger.info('VOICE_PLAYBACK', 'source=browser (fallback completed)');
              this.finishSession(session.id, intentId);
              this.processSpeechQueue();
            },
            (fallbackErr) => {
              if (this.activePlaybackSessionId !== session.id) {
                logger.info('VOICE_TTS', `stale_browser_onError_ignored session=${session.id}`);
                return;
              }
              logger.error('PLAYBACK_FAILED', `session=${session.id} provider=browser request=${requestId}_browser_fallback reason=${fallbackErr?.message || fallbackErr || 'unknown_error'}`);
              logger.error('VOICE_PROVIDER', `browser_fallback_error ${(fallbackErr?.message || fallbackErr || 'unknown_error')}`);
              this.finishSession(session.id, intentId);
              this.processSpeechQueue();
            },
            {
              sessionId: session.id,
              requestId: `${requestId}_browser_fallback`,
              intentId,
              onPlaybackStart: (timestamp) => this.recordPlaybackStart(intentId, timestamp),
            }
          );
          return;
        }

        if (profile.provider === 'elevenlabs' && !fallbackEligible) {
          logger.info('VOICE_PROVIDER', `fallback_skipped reason=${fallbackReason}`);
        }

        this.finishSession(session.id, intentId);
        this.processSpeechQueue();
      },
      {
        sessionId: session.id,
        requestId,
        intentId,
        onResponseReady: (timestamp) => this.recordTtsResponseReady(intentId, timestamp),
        onFirstAudioByte: (timestamp) => this.recordFirstAudioByte(intentId, timestamp),
        onPlaybackStart: (timestamp) => this.recordPlaybackStart(intentId, timestamp),
      }
    );
  }

  /**
   * IMMEDIATE TTS INTERRUPTION SYSTEM
   * Aborts all sessions, clears queues, stops TTS, and resets state.
   */
  public interrupt() {
    logger.trace('VOICE_PIPELINE', 'Interrupt requested. Purging TTS and queues.');
    this.shouldAutoRestartListening = false;
    this.latencyByIntent.clear();
    this.activeIntentId = null;
    this.lastHandledExecutionIntentId = null;
    this.clearPendingRestart();
    
    // 1. Stop audio playback immediately
    // Stop whichever TTS adapter is currently speaking
    if (this.currentAdapter) {
      this.currentAdapter.stopSpeaking();
      this.currentAdapter = null;
    } else {
      this.ttsAdapter.stopSpeaking();
      this.elevenLabsAdapter.stopSpeaking();
    }
    
    // 2. Clear sessions
    speechSessionManager.abortAllSessions();
    
    // 3. Reset guards
    this.sttAdapter.resumeListening();
    
    // 4. Force Idle
    this.isQueueProcessing = false;
    this.activePlaybackSessionId = null;
    voiceStateEngine.resetToIdle();
  }

  private finishSession(sessionId: string, intentId?: string) {
    if (this.activePlaybackSessionId !== sessionId) {
      return;
    }

    speechSessionManager.completeCurrentSession();
    this.currentAdapter = null;
    this.activePlaybackSessionId = null;
    this.isQueueProcessing = false;

    if (speechSessionManager.getQueueLength() === 0) {
      if (intentId) {
        this.logLatency(intentId);
      }
      this.activeIntentId = null;
      this.lastHandledExecutionIntentId = null;
      this.scheduleListeningRestart();
    }
  }

  private shouldFallbackToBrowser(err: any): boolean {
    const code = err?.code || err?.name || '';
    return ['NETWORK', 'UNAUTHORIZED', 'RATE_LIMIT', 'TIMEOUT', 'INVALID_AUDIO', 'PLAYBACK_FAILED', 'AUTOPLAY_BLOCKED'].includes(code);
  }

  private scheduleListeningRestart() {
    if (!this.shouldAutoRestartListening) {
      return;
    }

    this.clearPendingRestart();
    this.restartListeningTimeout = setTimeout(() => {
      this.restartListeningTimeout = null;
      if (!this.shouldAutoRestartListening) {
        return;
      }

      if (this.activePlaybackSessionId || this.isQueueProcessing || this.activeIntentId) {
        logger.info(
          'VOICE_PIPELINE',
          `restart_postponed activePlayback=${this.activePlaybackSessionId || 'none'} queueProcessing=${this.isQueueProcessing} activeIntent=${this.activeIntentId || 'none'}`
        );
        this.scheduleListeningRestart();
        return;
      }

      logger.info('VOICE_PIPELINE', 'restart_listening_after_playback=true');
      this.startListening();
    }, 40);
  }

  private clearPendingRestart() {
    if (this.restartListeningTimeout) {
      clearTimeout(this.restartListeningTimeout);
      this.restartListeningTimeout = null;
    }
  }

  private buildExecutionAckMessage(intent: any): string {
    const rawAction = String(intent?.payload?.action || intent?.payload?.deviceName || 'comando').trim();
    const normalized = rawAction.replace(/\s+/g, ' ').trim().replace(/\.+$/, '');
    const actionLower = normalized.toLowerCase();

    if (/^abrir\b/i.test(normalized)) {
      const target = normalized.replace(/^abrir\b\s*/i, '');
      const object = this.withNaturalArticle(target || 'isso');
      return presenceRuntime.selectAdaptiveAcknowledgment(intent, [
        `Ok, abrindo ${object}.`,
        `Já estou abrindo ${object}.`,
        `Certo, abrindo ${object}.`,
      ]);
    }

    if (/^(ligar|ativar)\b/i.test(normalized)) {
      const target = normalized.replace(/^(ligar|ativar)\b\s*/i, '');
      const object = this.withNaturalArticle(target || 'isso');
      return presenceRuntime.selectAdaptiveAcknowledgment(intent, [
        `Ok, ativando ${object}.`,
        `Certo, ligando ${object}.`,
        `Já estou ativando ${object}.`,
      ]);
    }

    if (/^(desligar|desativar)\b/i.test(normalized)) {
      const target = normalized.replace(/^(desligar|desativar)\b\s*/i, '');
      const object = this.withNaturalArticle(target || 'isso');
      return presenceRuntime.selectAdaptiveAcknowledgment(intent, [
        `Ok, desligando ${object}.`,
        `Certo, desativando ${object}.`,
        `Já estou desligando ${object}.`,
      ]);
    }

    return presenceRuntime.selectAdaptiveAcknowledgment(intent, [
      `Ok, executando ${actionLower}.`,
      `Certo, ${actionLower}.`,
      `Já estou executando ${actionLower}.`,
    ]);
  }

  private naturalizeSpeechText(text: string): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    const withSpacing = normalized
      .replace(/,\s*/g, ', ')
      .replace(/\.\s*/g, '. ')
      .replace(/\?\s*/g, '? ')
      .replace(/!\s*/g, '! ')
      .replace(/\s+([,?.!])/g, '$1')
      .trim();

    return withSpacing;
  }

  private withNaturalArticle(target: string): string {
    const cleanTarget = target.trim();
    if (!cleanTarget) {
      return 'isso';
    }

    if (/^(o|a|os|as|um|uma)\b/i.test(cleanTarget)) {
      return cleanTarget;
    }

    const feminineHints = /(?:a|ora|eira|ica|agem|dade|ção|são|ora)$/i;
    const article = feminineHints.test(cleanTarget) ? 'a' : 'o';
    return `${article} ${cleanTarget}`;
  }

  private getDeterministicVariantIndex(seed: string, size: number): number {
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
      hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
    }

    return size > 0 ? hash % size : 0;
  }

  private recordTtsResponseReady(intentId: string | undefined, timestamp: number) {
    if (!intentId) {
      return;
    }

    const latency = this.latencyByIntent.get(intentId);
    if (latency && !latency.ttsResponseReadyAt) {
      latency.ttsResponseReadyAt = timestamp;
    }
  }

  private recordFirstAudioByte(intentId: string | undefined, timestamp: number) {
    if (!intentId) {
      return;
    }

    const latency = this.latencyByIntent.get(intentId);
    if (latency && !latency.ttsFirstAudioAt) {
      latency.ttsFirstAudioAt = timestamp;
    }
  }

  private recordPlaybackStart(intentId: string | undefined, timestamp: number) {
    if (!intentId) {
      return;
    }

    const latency = this.latencyByIntent.get(intentId);
    if (latency && !latency.playbackStartedAt) {
      latency.playbackStartedAt = timestamp;
    }
  }

  private logLatency(intentId: string) {
    const latency = this.latencyByIntent.get(intentId);
    if (!latency) {
      return;
    }

    const sttFinalizeMs = (latency.sttFinalizedAt || 0) - latency.listeningStartedAt;
    const intentResolveMs = (latency.intentResolvedAt || 0) - (latency.sttFinalizedAt || latency.listeningStartedAt);
    const executionMs = latency.executionFinishedAt && latency.executionStartedAt
      ? latency.executionFinishedAt - latency.executionStartedAt
      : 0;
    const ttsRequestMs = latency.ttsResponseReadyAt && latency.ttsRequestStartedAt
      ? latency.ttsResponseReadyAt - latency.ttsRequestStartedAt
      : 0;
    const ttsFirstAudioMs = latency.ttsFirstAudioAt && latency.ttsRequestStartedAt
      ? latency.ttsFirstAudioAt - latency.ttsRequestStartedAt
      : 0;
    const playbackStartMs = latency.playbackStartedAt && latency.executionFinishedAt
      ? latency.playbackStartedAt - latency.executionFinishedAt
      : 0;
    const totalResponseMs = latency.playbackStartedAt && latency.sttFinalizedAt
      ? latency.playbackStartedAt - latency.sttFinalizedAt
      : 0;

    logger.info(
      'VOICE_LATENCY',
      `[VOICE_LATENCY] intent=${intentId} stt_finalize_ms=${Math.max(0, sttFinalizeMs)} intent_resolve_ms=${Math.max(0, intentResolveMs)} execution_ms=${Math.max(0, executionMs)} tts_request_ms=${Math.max(0, ttsRequestMs)} tts_first_audio_ms=${Math.max(0, ttsFirstAudioMs)} playback_start_ms=${Math.max(0, playbackStartMs)} total_response_ms=${Math.max(0, totalResponseMs)}`
    );

    this.latencyByIntent.delete(intentId);
  }
}

export const speechPipeline = SpeechPipeline.getInstance();
