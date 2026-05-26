import { ITTSAdapter, TTSRequestMetadata, VoiceProfile } from '../../types';
import { logger } from '../../../logger/Logger';
import { useVoiceStore } from '../../state/useVoiceStore';

type TtsErrorCode =
  | 'NETWORK'
  | 'UNAUTHORIZED'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'INVALID_AUDIO'
  | 'PLAYBACK_FAILED'
  | 'AUTOPLAY_BLOCKED';

function createTtsError(code: TtsErrorCode, message: string): Error & { code: TtsErrorCode; fallbackEligible: boolean } {
  const error = new Error(message) as Error & { code: TtsErrorCode; fallbackEligible: boolean };
  error.code = code;
  error.fallbackEligible = true;
  return error;
}

/**
 * ElevenLabs Text-to-Speech Adapter.
 * Uses ElevenLabs API to synthesize speech and plays it via HTMLAudioElement.
 * Falls back to onError callback on any failure, allowing higher layers to use a fallback adapter.
 */
export class ElevenLabsTTSAdapter implements ITTSAdapter {
  public isSpeaking: boolean = false;
  private currentAudio: HTMLAudioElement | null = null;
  private abortController: AbortController | null = null;
  private currentObjectUrl: string | null = null;
  private activeRequestId: string | null = null;
  private activeSessionId: string | null = null;
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private readonly startupBufferBytes = 32 * 1024;
  private readonly startupBufferMs = 160;
  private readonly pacingProfile = 'conversational_soft';
  private readonly playbackTransitionMode = 'stream_soft';
  private activeRuntimeConfig = {
    voiceId: 'eleven_rachel',
    speechRate: 0.96,
    pacingProfile: 'conversational_soft',
    naturalizationConfig: 'default_orion_naturalization',
    latencyProfile: 'stream_soft',
    streamMode: 'stream_soft',
    startupBufferMs: 160,
    startupBufferBytes: 32 * 1024,
    stability: 0.64,
    similarityBoost: 0.78,
    style: 0.18,
    speakerBoost: true,
    optimizeStreamingLatency: 2,
    modelId: 'eleven_multilingual_v2',
    outputFormat: 'mp3_44100_128',
  };

  private logAudioContextState(reason: string): void {
    try {
      const ContextCtor = typeof window !== 'undefined'
        ? (window.AudioContext || (window as any).webkitAudioContext)
        : null;
      if (!ContextCtor) {
        logger.info('AUDIO_CONTEXT_STATE', `reason=${reason} available=false`);
        return;
      }

      const context = new ContextCtor();
      logger.info('AUDIO_CONTEXT_STATE', `reason=${reason} available=true state=${context.state} sample_rate=${context.sampleRate}`);
      void context.close();
    } catch (error: any) {
      logger.warn('AUDIO_CONTEXT_STATE', `reason=${reason} available=true state_probe_failed=${error?.message || error}`);
    }
  }

  private logAudioElementState(reason: string): void {
    if (!this.currentAudio) {
      logger.info('AUDIO_ELEMENT_RUNTIME', `reason=${reason} present=false`);
      return;
    }

    const mediaError = this.currentAudio.error as any;
    logger.info(
      'AUDIO_ELEMENT_RUNTIME',
      `reason=${reason} present=true paused=${String(this.currentAudio.paused)} ended=${String(this.currentAudio.ended)} ready_state=${this.currentAudio.readyState} network_state=${this.currentAudio.networkState} current_time=${this.currentAudio.currentTime.toFixed(2)} duration=${Number.isFinite(this.currentAudio.duration) ? this.currentAudio.duration.toFixed(2) : 'unknown'} error_code=${mediaError?.code || 'none'} error_message=${mediaError?.message || 'none'}`
    );
  }

  private async traceBufferedAudioDecoding(arrayBuffer: ArrayBuffer, contentType: string, sessionId: string, requestId: string): Promise<void> {
    const ContextCtor = typeof window !== 'undefined'
      ? (window.AudioContext || (window as any).webkitAudioContext)
      : null;
    if (!ContextCtor) {
      logger.info('AUDIO_DECODE', `provider=elevenlabs session=${sessionId} request=${requestId} available=false content_type=${contentType}`);
      return;
    }

    const probeContext = new ContextCtor();
    try {
      logger.info('AUDIO_DECODE', `provider=elevenlabs session=${sessionId} request=${requestId} started=true bytes=${arrayBuffer.byteLength} content_type=${contentType} context_state=${probeContext.state}`);
      const decoded = await probeContext.decodeAudioData(arrayBuffer.slice(0));
      logger.info('AUDIO_BUFFER', `provider=elevenlabs session=${sessionId} request=${requestId} decode_success=true channels=${decoded.numberOfChannels} sample_rate=${decoded.sampleRate} duration=${decoded.duration.toFixed(3)}`);
    } catch (error: any) {
      logger.error('AUDIO_DECODE', `provider=elevenlabs session=${sessionId} request=${requestId} decode_failed=true content_type=${contentType} error=${error?.message || error}`);
    } finally {
      void probeContext.close();
    }
  }

  /**
   * Speak the given text using ElevenLabs TTS via backend proxy.
   * Frontend NEVER calls ElevenLabs API directly anymore.
   * @param text The text to synthesize.
   * @param profile VoiceProfile (pitch/rate are ignored – ElevenLabs handles voice characteristics).
   * @param onEnd Callback when playback finishes.
   * @param onError Callback on error.
   */
  public async speak(
    text: string,
    profile: VoiceProfile,
    onEnd: () => void,
    onError: (err: any) => void,
    metadata?: TTSRequestMetadata
  ): Promise<void> {
    const sessionId = metadata?.sessionId || `tts_${Date.now()}`;
    const requestId = metadata?.requestId || `req_${Date.now()}`;

    this.cleanupAudio();
    this.abortPendingRequest();

    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    this.activeSessionId = sessionId;
    this.activeRequestId = requestId;

    try {
      this.logAudioContextState('tts_request_start');
      const authority = useVoiceStore.getState().authority;
      const runtimeConfig = {
        voiceId: authority.activeVoiceId || profile.id,
        speechRate: authority.speechRate || profile.rate || 0.96,
        pacingProfile: authority.pacing || this.pacingProfile,
        naturalizationConfig: authority.naturalizationConfig || 'default_orion_naturalization',
        latencyProfile: authority.latencyProfile || this.playbackTransitionMode,
        streamMode: authority.streamMode || this.playbackTransitionMode,
        startupBufferMs: authority.startupBufferMs || this.startupBufferMs,
        startupBufferBytes: Math.max(8 * 1024, Math.round((authority.startupBufferMs || this.startupBufferMs) * 192)),
        stability: authority.stability || 0.64,
        similarityBoost: authority.similarityBoost || 0.78,
        style: authority.style || 0.18,
        speakerBoost: authority.speakerBoost ?? true,
        optimizeStreamingLatency: authority.optimizeStreamingLatency || 2,
        modelId: authority.modelId || 'eleven_multilingual_v2',
        outputFormat: authority.outputFormat || 'mp3_44100_128',
      };
      this.activeRuntimeConfig = runtimeConfig;
      const payload = JSON.stringify({ text, profile: profile.id, provider: 'elevenlabs', sessionId, requestId, voiceConfig: runtimeConfig });
      logger.info(
        'NATURALIZATION_RUNTIME',
        `speech_rate=${runtimeConfig.speechRate.toFixed(2)} pacing_profile=${runtimeConfig.pacingProfile} naturalization=${runtimeConfig.naturalizationConfig} stability=${runtimeConfig.stability} similarity_boost=${runtimeConfig.similarityBoost} style=${runtimeConfig.style} speaker_boost=${String(runtimeConfig.speakerBoost)}`
      );
      logger.info('STREAM_PROFILE', `mode=${runtimeConfig.streamMode} latency=${runtimeConfig.latencyProfile} startup_buffer_ms=${runtimeConfig.startupBufferMs} optimize_latency=${runtimeConfig.optimizeStreamingLatency} output=${runtimeConfig.outputFormat}`);
      logger.info('ELEVENLABS_SESSION', `session=${sessionId} request=${requestId} voice=${runtimeConfig.voiceId} model=${runtimeConfig.modelId}`);
      logger.info('TTS_STREAM_RUNTIME', `provider=elevenlabs session=${sessionId} request=${requestId} stream_mode=${runtimeConfig.streamMode} startup_buffer_ms=${runtimeConfig.startupBufferMs} startup_buffer_bytes=${runtimeConfig.startupBufferBytes}`);
      logger.info('VOICE_TTS', `request_started provider=elevenlabs session=${sessionId} request=${requestId}`);
      logger.info('PLAYBACK_PROVIDER', `provider=elevenlabs profile=${profile.id} voice=${runtimeConfig.voiceId}`);
      logger.info('TTS_REQUEST', `provider=elevenlabs session=${sessionId} request=${requestId} endpoint=/api/voice/tts profile=${profile.id} payload_size=${payload.length} requested_voice_id=${runtimeConfig.voiceId}`);
      const response = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal
      });

      if (this.isStaleRequest(sessionId, requestId)) {
        logger.info('VOICE_REQUEST', `stale_response_ignored session=${sessionId} request=${requestId}`);
        return;
      }

      metadata?.onResponseReady?.(Date.now());

      if (!response.ok) {
        const errText = await response.text();
        logger.error('VOICE_RESPONSE', `provider=elevenlabs session=${sessionId} request=${requestId} status=${response.status} body=${this.summarize(errText)}`);
        if (response.status === 503) {
          logger.error('VOICE_503', `provider=elevenlabs session=${sessionId} request=${requestId} status=503 body=${this.summarize(errText)}`);
        }
        if (response.status === 401) {
          onError(createTtsError('UNAUTHORIZED', 'ElevenLabs backend error 401'));
          return;
        }
        if (response.status === 429) {
          onError(createTtsError('RATE_LIMIT', 'ElevenLabs backend error 429'));
          return;
        }
        onError(createTtsError('NETWORK', `ElevenLabs backend error ${response.status}`));
        return;
      }

      const contentType = response.headers.get('content-type') || '';
      const responseVoiceId = response.headers.get('x-tts-voice-id') || 'unknown';
      const requestedVoiceId = response.headers.get('x-tts-requested-voice-id') || runtimeConfig.voiceId;
      const responseVoiceSource = response.headers.get('x-tts-voice-source') || 'unknown';
      const responseVoiceValidated = response.headers.get('x-tts-voice-validated') || 'unknown';
      const likelyProfileAlias = response.headers.get('x-tts-likely-profile-alias') || 'unknown';
      const responseModel = response.headers.get('x-tts-model') || 'unknown';
      const responseOutputFormat = response.headers.get('x-tts-output-format') || 'unknown';

      if (responseVoiceId && responseVoiceId !== 'unknown' && responseVoiceId !== 'eleven_rachel') {
        const voiceStore = useVoiceStore.getState();
        if (voiceStore.authority.activeVoiceId !== responseVoiceId) {
          logger.info('PROVIDER_LOCK', `Dynamic voice_id update from response headers resolved_voice_id=${responseVoiceId}`);
          voiceStore.setProfile(voiceStore.activeProfile, {
            voiceId: responseVoiceId,
            forceLockOverride: true
          });
        }
      }

      logger.info(
        'TTS_RESPONSE',
        `provider=elevenlabs session=${sessionId} request=${requestId} status=${response.status} requested_voice_id=${requestedVoiceId} resolved_voice_id=${responseVoiceId} voice_source=${responseVoiceSource} validated=${responseVoiceValidated} likely_profile_alias=${likelyProfileAlias} model=${responseModel} output_format=${responseOutputFormat} content_type=${contentType || 'audio/mpeg'}`
      );
      logger.info('ELEVENLABS_AUDIO', `session=${sessionId} request=${requestId} requested_voice_id=${requestedVoiceId} resolved_voice_id=${responseVoiceId} voice_source=${responseVoiceSource} validated=${responseVoiceValidated} likely_profile_alias=${likelyProfileAlias}`);
      if (contentType && !contentType.startsWith('audio/')) {
        logger.error('VOICE_PROVIDER', `elevenlabs_error invalid content-type: ${contentType}`);
        onError(createTtsError('INVALID_AUDIO', `Invalid content-type: ${contentType}`));
        return;
      }

      logger.info('VOICE_PROVIDER', 'elevenlabs_active=true');

      if (this.canStreamAudio(contentType, response)) {
        logger.info('TTS_STREAM_RUNTIME', `provider=elevenlabs session=${sessionId} request=${requestId} streaming_enabled=true media_source_supported=true content_type=${contentType || 'audio/mpeg'}`);
        await this.playStreamingResponse(response, contentType || 'audio/mpeg', sessionId, requestId, onEnd, onError, metadata);
        return;
      }

      logger.warn('TTS_STREAM_RUNTIME', `provider=elevenlabs session=${sessionId} request=${requestId} streaming_enabled=false media_source_supported=${String(typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(contentType || 'audio/mpeg'))} has_body=${String(Boolean(response.body))} content_type=${contentType || 'audio/mpeg'}`);

      await this.playBufferedResponse(response, contentType || 'audio/mpeg', responseVoiceId, sessionId, requestId, onEnd, onError, metadata);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        logger.info('VOICE_REQUEST', `request_aborted session=${sessionId} request=${requestId}`);
        return;
      }
      if (err?.code) {
        logger.error('VOICE_PROVIDER', `elevenlabs_error ${err.message}`);
        onError(err);
        return;
      }
      if (err.code === 'ECONNABORTED' || /timeout/i.test(err.message || '')) {
        logger.error('VOICE_PROVIDER', 'elevenlabs_error timeout');
        onError(createTtsError('TIMEOUT', err.message || 'ElevenLabs request timed out'));
        return;
      }
      logger.error('VOICE_PROVIDER', `elevenlabs_error ${err.message}`);
      onError(createTtsError('NETWORK', err.message || 'ElevenLabs request failed'));
    }
  }

  /**
   * Immediately stop any ongoing speech and abort the request.
   */
  public stopSpeaking(): void {
    this.abortPendingRequest();
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.cleanupAudio();
      logger.trace('VOICE_RUNTIME', '[ELEVENLABS_TTS] playback aborted');
    }
  }

  private abortPendingRequest(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.activeRequestId = null;
    this.activeSessionId = null;
  }

  private cleanupAudio(): void {
    if (this.sourceBuffer) {
      this.sourceBuffer.onupdateend = null;
      this.sourceBuffer.onerror = null;
      this.sourceBuffer = null;
    }

    if (this.mediaSource) {
      this.mediaSource.onsourceopen = null;
      this.mediaSource = null;
    }

    if (this.currentAudio) {
      this.currentAudio.onplay = null;
      this.currentAudio.onloadedmetadata = null;
      this.currentAudio.oncanplay = null;
      this.currentAudio.onended = null;
      this.currentAudio.onerror = null;
      this.currentAudio = null;
    }

    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }

    this.isSpeaking = false;
  }

  private isStaleRequest(sessionId: string, requestId: string): boolean {
    return this.activeSessionId !== sessionId || this.activeRequestId !== requestId;
  }

  private summarize(value: string): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > 220 ? `${normalized.slice(0, 220)}...` : normalized;
  }

  private canStreamAudio(contentType: string, response: Response): boolean {
    return (
      typeof MediaSource !== 'undefined' &&
      !!response.body &&
      MediaSource.isTypeSupported(contentType || 'audio/mpeg')
    );
  }

  private async playBufferedResponse(
    response: Response,
    contentType: string,
    responseVoiceId: string,
    sessionId: string,
    requestId: string,
    onEnd: () => void,
    onError: (err: any) => void,
    metadata?: TTSRequestMetadata
  ): Promise<void> {
    const arrayBuffer = await response.arrayBuffer();
    metadata?.onFirstAudioByte?.(Date.now());

    if (this.isStaleRequest(sessionId, requestId)) {
      logger.info('VOICE_REQUEST', `stale_audio_ignored session=${sessionId} request=${requestId}`);
      return;
    }

    const blobSize = arrayBuffer.byteLength;
    logger.info('TTS_RESPONSE', `provider=elevenlabs session=${sessionId} request=${requestId} buffered=true bytes=${blobSize} content_type=${contentType} voice_id=${responseVoiceId}`);
    logger.info('ELEVENLABS_AUDIO', `session=${sessionId} request=${requestId} bytes=${blobSize} mode=buffered content_type=${contentType}`);
    logger.info('AUDIO_BUFFER', `provider=elevenlabs session=${sessionId} request=${requestId} bytes=${blobSize} empty=${String(blobSize === 0)} too_small=${String(blobSize < 100)}`);

    if (blobSize < 100) {
      logger.error('VOICE_PROVIDER', `elevenlabs_error blob too small: ${blobSize} bytes`);
      onError(createTtsError('INVALID_AUDIO', `ElevenLabs blob too small: ${blobSize} bytes`));
      return;
    }

    await this.traceBufferedAudioDecoding(arrayBuffer, contentType, sessionId, requestId);

    const blob = new Blob([arrayBuffer], { type: contentType });
    const urlObject = URL.createObjectURL(blob);
    this.currentObjectUrl = urlObject;
    this.currentAudio = new Audio(urlObject);
    this.currentAudio.preload = 'auto';
    this.logAudioElementState('buffered_audio_created');
    this.bindAudioEvents(sessionId, requestId, onEnd, onError, metadata);

    try {
      logger.info('AUDIO_PLAYBACK', `provider=elevenlabs session=${sessionId} request=${requestId} mode=buffered play_invoked=true`);
      await this.currentAudio.play();
    } catch (playErr: any) {
      this.handlePlaybackError(playErr, sessionId, requestId, onError);
    }
  }

  private async playStreamingResponse(
    response: Response,
    contentType: string,
    sessionId: string,
    requestId: string,
    onEnd: () => void,
    onError: (err: any) => void,
    metadata?: TTSRequestMetadata
  ): Promise<void> {
    const mediaSource = new MediaSource();
    this.mediaSource = mediaSource;
    this.currentObjectUrl = URL.createObjectURL(mediaSource);
    this.currentAudio = new Audio(this.currentObjectUrl);
    this.currentAudio.preload = 'auto';
    this.bindAudioEvents(sessionId, requestId, onEnd, onError, metadata);

    const reader = response.body!.getReader();
    let sourceBuffer: SourceBuffer;
    let receivedBytes = 0;
    let firstChunkSeen = false;
    let playbackRequested = false;
    let streamEnded = false;
    const pendingChunks: Uint8Array[] = [];

    await new Promise<void>((resolve, reject) => {
      const flush = () => {
        if (!sourceBuffer || sourceBuffer.updating || pendingChunks.length === 0) {
          return;
        }

        try {
          const chunk = pendingChunks.shift()!;
          sourceBuffer.appendBuffer(new Uint8Array(chunk).buffer);
          logger.info('STREAM_PLAYBACK', `provider=elevenlabs session=${sessionId} request=${requestId} append_started=true pending_chunks=${pendingChunks.length}`);
        } catch (appendErr: any) {
          logger.error('PLAYBACK_FAILED', `provider=elevenlabs session=${sessionId} request=${requestId} append_failed=true error=${appendErr?.message || appendErr}`);
          reject(createTtsError('PLAYBACK_FAILED', appendErr.message || 'Failed to append audio stream'));
        }
      };

      const maybeStartPlayback = async (force = false) => {
        if (playbackRequested || !this.currentAudio) {
          return;
        }

        if (!force && receivedBytes < this.activeRuntimeConfig.startupBufferBytes) {
          return;
        }

        playbackRequested = true;
        try {
          logger.info('AUDIO_PLAYBACK', `provider=elevenlabs session=${sessionId} request=${requestId} mode=streaming play_invoked=true received_bytes=${receivedBytes} force=${String(force)}`);
          await this.currentAudio.play();
        } catch (playErr: any) {
          reject(createTtsError(playErr?.name === 'NotAllowedError' ? 'AUTOPLAY_BLOCKED' : 'PLAYBACK_FAILED', playErr?.message || 'Streaming playback failed'));
        }
      };

      mediaSource.onsourceopen = () => {
        try {
          sourceBuffer = mediaSource.addSourceBuffer(contentType);
          this.sourceBuffer = sourceBuffer;
          logger.info('STREAM_PLAYBACK', `provider=elevenlabs session=${sessionId} request=${requestId} source_buffer_created=true content_type=${contentType}`);
        } catch {
          reject(createTtsError('PLAYBACK_FAILED', `Unsupported streaming content-type: ${contentType}`));
          return;
        }

        sourceBuffer.mode = 'sequence';
        sourceBuffer.onupdateend = () => {
          flush();

          if (mediaSource.readyState === 'open' && pendingChunks.length === 0 && streamEnded) {
            try {
              mediaSource.endOfStream();
            } catch {
              // noop
            }
          }

          void maybeStartPlayback();
        };
        sourceBuffer.onerror = () => {
          logger.error('PLAYBACK_FAILED', `provider=elevenlabs session=${sessionId} request=${requestId} source_buffer_error=true`);
          reject(createTtsError('PLAYBACK_FAILED', 'SourceBuffer error'));
        };

        const pump = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                streamEnded = true;
                logger.info('TTS_STREAM_RUNTIME', `provider=elevenlabs session=${sessionId} request=${requestId} stream_end=true total_bytes=${receivedBytes}`);
                if (receivedBytes === 0) {
                  reject(createTtsError('INVALID_AUDIO', 'ElevenLabs stream ended with zero bytes'));
                  return;
                }
                void maybeStartPlayback(true);
                resolve();
                if (mediaSource.readyState === 'open' && !sourceBuffer.updating && pendingChunks.length === 0) {
                  try {
                    mediaSource.endOfStream();
                  } catch {
                    // noop
                  }
                }
                break;
              }

              if (this.isStaleRequest(sessionId, requestId)) {
                reader.cancel().catch(() => undefined);
                resolve();
                break;
              }

              if (!firstChunkSeen) {
                firstChunkSeen = true;
                metadata?.onFirstAudioByte?.(Date.now());
                logger.info('STREAM_RECEIVED', `provider=elevenlabs session=${sessionId} request=${requestId} first_chunk=true bytes=${value.byteLength}`);
              }

              receivedBytes += value.byteLength;
              logger.info('STREAM_RECEIVED', `provider=elevenlabs session=${sessionId} request=${requestId} chunk_bytes=${value.byteLength} total_bytes=${receivedBytes}`);
              pendingChunks.push(value);
              flush();
              void maybeStartPlayback();
            }
          } catch (streamErr: any) {
            logger.error('PLAYBACK_FAILED', `provider=elevenlabs session=${sessionId} request=${requestId} stream_read_failed=true error=${streamErr?.message || streamErr}`);
            reject(createTtsError('NETWORK', streamErr?.message || 'Failed to read audio stream'));
          }
        };

        void pump();
      };
    });
  }

  private bindAudioEvents(
    sessionId: string,
    requestId: string,
    onEnd: () => void,
    onError: (err: any) => void,
    metadata?: TTSRequestMetadata
  ) {
    if (!this.currentAudio) {
      return;
    }

    this.currentAudio.onplay = () => {
      if (this.isStaleRequest(sessionId, requestId)) {
        this.cleanupAudio();
        return;
      }
      const currentAudio = this.currentAudio;
      if (!currentAudio) {
        return;
      }
      this.isSpeaking = true;
      currentAudio.volume = 0.96;
      this.logAudioContextState('audio_onplay');
      this.logAudioElementState('audio_onplay');
      metadata?.onPlaybackStart?.(Date.now());
      logger.info('PLAYBACK_START', `provider=elevenlabs session=${sessionId} request=${requestId}`);
      logger.info('PLAYBACK_PROVIDER', `provider=elevenlabs session=${sessionId} request=${requestId} voice=${this.activeRuntimeConfig.voiceId} stream_mode=${this.activeRuntimeConfig.streamMode}`);
    };
    this.currentAudio.onloadedmetadata = () => {
      this.logAudioElementState('loaded_metadata');
      logger.info('ELEVENLABS_AUDIO', `session=${sessionId} request=${requestId} loaded_metadata=true src=${this.currentAudio?.currentSrc ? 'object_url' : 'none'}`);
    };
    this.currentAudio.oncanplay = () => {
      this.logAudioElementState('can_play');
      logger.info('AUDIO_PLAYBACK', `provider=elevenlabs session=${sessionId} request=${requestId} can_play=true`);
    };
    this.currentAudio.onended = () => {
      if (this.isStaleRequest(sessionId, requestId)) {
        this.cleanupAudio();
        return;
      }
      this.isSpeaking = false;
      this.logAudioElementState('audio_onended');
      logger.info('PLAYBACK_FINISHED', `provider=elevenlabs session=${sessionId} request=${requestId}`);
      this.cleanupAudio();
      onEnd();
    };
    this.currentAudio.onerror = () => {
      if (this.isStaleRequest(sessionId, requestId)) {
        this.cleanupAudio();
        return;
      }
      this.isSpeaking = false;
      this.logAudioElementState('audio_onerror');
      logger.error('PLAYBACK_FAILED', `provider=elevenlabs session=${sessionId} request=${requestId} playback_element_error=true`);
      this.cleanupAudio();
      onError(createTtsError('PLAYBACK_FAILED', 'ElevenLabs playback element error'));
    };
  }

  private handlePlaybackError(playErr: any, sessionId: string, requestId: string, onError: (err: any) => void) {
    if (this.isStaleRequest(sessionId, requestId)) {
      this.cleanupAudio();
      return;
    }

    this.isSpeaking = false;
    if (playErr?.name === 'NotAllowedError') {
      this.logAudioContextState('autoplay_blocked');
      logger.warn('PLAYBACK_FAILED', `provider=elevenlabs session=${sessionId} request=${requestId} autoplay_blocked=true`);
      this.cleanupAudio();
      onError(createTtsError('AUTOPLAY_BLOCKED', 'ElevenLabs autoplay blocked'));
      return;
    }

    if (playErr?.name === 'AbortError') {
      this.cleanupAudio();
      return;
    }

    this.logAudioElementState('playback_error');
    logger.error('PLAYBACK_FAILED', `provider=elevenlabs session=${sessionId} request=${requestId} playback_error=${playErr?.message || playErr}`);
    this.cleanupAudio();
    onError(createTtsError('PLAYBACK_FAILED', playErr?.message || 'ElevenLabs playback failed'));
  }
}
