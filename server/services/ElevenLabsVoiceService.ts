import axios from 'axios';
import https from 'https';
import type { Readable } from 'stream';

interface ElevenLabsOptions {
  text: string;
  profile?: string;
  provider?: string;
  sessionId?: string;
  requestId?: string;
  voiceConfig?: Partial<{
    voiceId: string;
    speechRate: number;
    pacingProfile: string;
    startupBufferMs: number;
    stability: number;
    similarityBoost: number;
    style: number;
    speakerBoost: boolean;
    optimizeStreamingLatency: number;
    modelId: string;
    outputFormat: string;
  }>;
}

interface ElevenLabsResult {
  audioStream: Readable;
  contentType: string;
  voiceId: string;
  requestedVoiceId: string;
  voiceSource: 'client_override' | 'env_default';
  voiceValidationState: 'validated' | 'unverified';
  likelyProfileAlias: boolean;
  modelId: string;
  outputFormat: string;
}

interface ElevenLabsVoiceValidation {
  voiceId: string;
  voiceName: string;
  category: string;
}

interface VoiceValidationStatus {
  meta: ElevenLabsVoiceValidation;
  validated: boolean;
  reason?: string;
}

export class ElevenLabsServiceError extends Error {
  public readonly statusCode: number;
  public readonly responseBody?: string;

  constructor(message: string, statusCode: number, responseBody?: string) {
    super(message);
    this.name = 'ElevenLabsServiceError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

export class ElevenLabsVoiceService {
  private readonly baseUrl = 'https://api.elevenlabs.io/v1';
  private readonly modelId = 'eleven_multilingual_v2';
  private readonly outputFormat = 'mp3_44100_128';
  private readonly requestTimeoutMs = 30000;
  private readonly voiceSettings = {
    stability: 0.64,
    similarity_boost: 0.78,
    style: 0.18,
    use_speaker_boost: true,
  };
  private readonly speechRate = 0.96;
  private readonly pacingProfile = 'conversational_soft';
  private readonly warmupIntervalMs = 4 * 60 * 1000;
  private readonly http = axios.create({
    httpsAgent: new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 10000,
      maxSockets: 10,
    }),
  });
  private lastVoiceValidation: { voiceId: string; validatedAt: number; meta: ElevenLabsVoiceValidation } | null = null;
  private warmupTimer: NodeJS.Timeout | null = null;

  public isConfigured(voiceIdOverride?: string): boolean {
    return !!(this.getApiKey() && this.resolveVoiceId(voiceIdOverride));
  }

  public getActiveVoiceId(): string {
    return this.getConfiguredVoiceId();
  }

  public getModelId(): string {
    return this.modelId;
  }

  public getOutputFormat(): string {
    return this.outputFormat;
  }

  public async synthesize(options: ElevenLabsOptions): Promise<ElevenLabsResult> {
    const { text, profile, provider, sessionId, requestId, voiceConfig } = options;
    const apiKey = this.getApiKey();
    const requestedVoiceId = typeof voiceConfig?.voiceId === 'string' ? voiceConfig.voiceId.trim() : '';
    const voiceSource = requestedVoiceId ? 'client_override' : 'env_default';
    const voiceId = this.resolveVoiceId(requestedVoiceId);
    const likelyProfileAlias = this.isLikelyProfileAlias(requestedVoiceId, voiceId);
    const modelId = voiceConfig?.modelId || this.modelId;
    const outputFormat = voiceConfig?.outputFormat || this.outputFormat;
    const optimizeStreamingLatency = typeof voiceConfig?.optimizeStreamingLatency === 'number'
      ? voiceConfig.optimizeStreamingLatency
      : 2;
    const voiceSettings = {
      stability: typeof voiceConfig?.stability === 'number' ? voiceConfig.stability : this.voiceSettings.stability,
      similarity_boost: typeof voiceConfig?.similarityBoost === 'number' ? voiceConfig.similarityBoost : this.voiceSettings.similarity_boost,
      style: typeof voiceConfig?.style === 'number' ? voiceConfig.style : this.voiceSettings.style,
      use_speaker_boost: typeof voiceConfig?.speakerBoost === 'boolean' ? voiceConfig.speakerBoost : this.voiceSettings.use_speaker_boost,
    };
    const speechRate = typeof voiceConfig?.speechRate === 'number' ? voiceConfig.speechRate : this.speechRate;
    const pacingProfile = voiceConfig?.pacingProfile || this.pacingProfile;
    const startupBufferMs = typeof voiceConfig?.startupBufferMs === 'number' ? voiceConfig.startupBufferMs : 160;

    if (!apiKey || !voiceId) {
      console.error('[VOICE_503] reason=backend_not_configured');
      throw new ElevenLabsServiceError('ElevenLabs not configured', 503);
    }

    if (!text || text.trim().length === 0) {
      throw new ElevenLabsServiceError('Empty text', 400);
    }

    const validation = await this.validateVoice(voiceId, apiKey, requestId);
    const endpoint = `${this.baseUrl}/text-to-speech/${voiceId}/stream`;
    const query = `output_format=${outputFormat}&optimize_streaming_latency=${optimizeStreamingLatency}`;
    const url = `${endpoint}?${query}`;
    const payload = {
      text,
      model_id: modelId,
      voice_settings: voiceSettings,
    };
    const payloadText = JSON.stringify(payload);

    console.log(
      `[VOICE_HTTP] method=POST endpoint=${endpoint} query=${query} timeout_ms=${this.requestTimeoutMs} session=${sessionId || 'none'} request=${requestId || 'none'}`
    );
    console.log(
      `[TTS_REQUEST] provider=${provider || 'elevenlabs'} profile=${profile || 'none'} requested_voice_id=${requestedVoiceId || 'none'} resolved_voice_id=${voiceId} voice_source=${voiceSource} likely_profile_alias=${String(likelyProfileAlias)} voice_name=${validation.meta.voiceName} category=${validation.meta.category} model=${modelId} output_format=${outputFormat} payload_size=${payloadText.length}`
    );
    console.log(
      `[ELEVENLABS_AUDIO] session=${sessionId || 'none'} request=${requestId || 'none'} requested_voice_id=${requestedVoiceId || 'none'} resolved_voice_id=${voiceId} voice_source=${voiceSource} likely_profile_alias=${String(likelyProfileAlias)}`
    );
    console.log(
      `[VOICE_NATURALIZATION] speech_rate=${speechRate.toFixed(2)} pacing_profile=${pacingProfile} stability=${voiceSettings.stability} style=${voiceSettings.style} startup_buffer_ms=${startupBufferMs} playback_transition_mode=stream_soft`
    );
    if (!validation.validated) {
      console.warn(
        `[VOICE_RESPONSE] validation=voice_lookup non_blocking=true voice_id=${voiceId} reason=${validation.reason || 'unknown'} continuing_synthesis=true`
      );
      console.warn(
        `[PROVIDER_VALIDATION] provider=elevenlabs session=${sessionId || 'none'} request=${requestId || 'none'} validated=false reason=${validation.reason || 'unknown'} requested_voice_id=${requestedVoiceId || 'none'} resolved_voice_id=${voiceId} likely_profile_alias=${String(likelyProfileAlias)}`
      );
    }

    try {
      const response = await this.http.post<Readable>(url, payload, {
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        responseType: 'stream',
        timeout: this.requestTimeoutMs,
      });

      const contentType = typeof response.headers['content-type'] === 'string'
        ? response.headers['content-type']
        : 'audio/mpeg';

      console.log(
        `[TTS_RESPONSE] provider=elevenlabs status=${response.status} requested_voice_id=${requestedVoiceId || 'none'} resolved_voice_id=${voiceId} model=${modelId} output_format=${outputFormat} content_type=${contentType} streaming=true`
      );

      return {
        audioStream: response.data,
        contentType,
        voiceId,
        requestedVoiceId: requestedVoiceId || voiceId,
        voiceSource,
        voiceValidationState: validation.validated ? 'validated' : 'unverified',
        likelyProfileAlias,
        modelId,
        outputFormat,
      };
    } catch (err: any) {
      if (err.response) {
        const status = err.response.status;
        const body = this.summarizeBody(err.response.data);

        console.error(
          `[TTS_RESPONSE] provider=elevenlabs status=${status} requested_voice_id=${requestedVoiceId || 'none'} resolved_voice_id=${voiceId} voice_source=${voiceSource} likely_profile_alias=${String(likelyProfileAlias)} model=${modelId} output_format=${outputFormat} body=${body}`
        );
        if (status === 503) {
          console.error(
            `[VOICE_503] provider=elevenlabs status=503 voice_id=${voiceId} model=${modelId} output_format=${outputFormat} body=${body}`
          );
        }

        if (status === 401) {
          throw new ElevenLabsServiceError(`ElevenLabs unauthorized: ${body}`, 401, body);
        }
        if (status === 404) {
          throw new ElevenLabsServiceError(`ElevenLabs voice not found: ${voiceId}`, 404, body);
        }
        if (status === 429) {
          throw new ElevenLabsServiceError('ElevenLabs quota exceeded', 429, body);
        }
        throw new ElevenLabsServiceError(`ElevenLabs API error ${status}: ${body}`, status, body);
      }

      if (err.code === 'ECONNABORTED') {
        throw new ElevenLabsServiceError('ElevenLabs request timed out', 504);
      }

      throw new ElevenLabsServiceError(err.message || 'ElevenLabs request failed', 502);
    }
  }

  public startWarmupLoop(): void {
    if (this.warmupTimer || !this.isConfigured()) {
      return;
    }

    void this.warmup('startup');
    this.warmupTimer = setInterval(() => {
      void this.warmup('keepalive');
    }, this.warmupIntervalMs);
  }

  private getApiKey(): string {
    return process.env.ELEVENLABS_API_KEY || '';
  }

  private getConfiguredVoiceId(): string {
    return process.env.ELEVENLABS_VOICE_ID || '';
  }

  private resolveVoiceId(voiceIdOverride?: string): string {
    const override = typeof voiceIdOverride === 'string' ? voiceIdOverride.trim() : '';
    if (!override || override === 'eleven_rachel' || override.startsWith('browser_fallback_')) {
      return this.getConfiguredVoiceId();
    }
    return override;
  }

  private isLikelyProfileAlias(requestedVoiceId: string, resolvedVoiceId: string): boolean {
    if (!requestedVoiceId) {
      return false;
    }

    if (/^eleven_[a-z0-9_]+$/i.test(requestedVoiceId)) {
      return true;
    }

    return requestedVoiceId === resolvedVoiceId && requestedVoiceId.length < 12;
  }

  private async validateVoice(voiceId: string, apiKey: string, requestId?: string): Promise<VoiceValidationStatus> {
    const now = Date.now();
    if (
      this.lastVoiceValidation &&
      this.lastVoiceValidation.voiceId === voiceId &&
      now - this.lastVoiceValidation.validatedAt < 5 * 60 * 1000
    ) {
      return { meta: this.lastVoiceValidation.meta, validated: true };
    }

    const endpoint = `${this.baseUrl}/voices/${voiceId}`;
    console.log(`[VOICE_HTTP] method=GET endpoint=${endpoint} validation=true request=${requestId || 'none'}`);

    try {
      const response = await this.http.get(endpoint, {
        headers: {
          'xi-api-key': apiKey,
          Accept: 'application/json',
        },
        timeout: 10000,
      });

      const meta: ElevenLabsVoiceValidation = {
        voiceId: response.data?.voice_id || voiceId,
        voiceName: response.data?.name || 'unknown',
        category: response.data?.category || 'unknown',
      };

      this.lastVoiceValidation = {
        voiceId,
        validatedAt: now,
        meta,
      };

      console.log(`[VOICE_RESPONSE] validation=voice_lookup status=${response.status} voice_id=${meta.voiceId} voice_name=${meta.voiceName} category=${meta.category}`);
      return { meta, validated: true };
    } catch (err: any) {
      if (err.response) {
        const status = err.response.status;
        const body = this.summarizeBody(err.response.data);
        console.error(`[VOICE_RESPONSE] validation=voice_lookup status=${status} voice_id=${voiceId} body=${body}`);

        if (status === 401 && /missing_permissions|voices_read/i.test(body)) {
          return {
            meta: {
              voiceId,
              voiceName: 'unverified',
              category: 'unverified',
            },
            validated: false,
            reason: 'missing_permissions_voices_read',
          };
        }

        return {
          meta: {
            voiceId,
            voiceName: 'unverified',
            category: 'unverified',
          },
          validated: false,
          reason: `voice_lookup_http_${status}`,
        };
      }

      return {
        meta: {
          voiceId,
          voiceName: 'unverified',
          category: 'unverified',
        },
        validated: false,
        reason: err.message || 'voice_lookup_failed',
      };
    }
  }

  private summarizeBody(data: unknown): string {
    if (typeof data === 'string') {
      return this.normalizeBody(data);
    }

    if (data instanceof ArrayBuffer) {
      return this.normalizeBody(Buffer.from(data).toString('utf8'));
    }

    if (ArrayBuffer.isView(data)) {
      return this.normalizeBody(Buffer.from(data.buffer).toString('utf8'));
    }

    if (data && typeof data === 'object') {
      return this.normalizeBody(JSON.stringify(data));
    }

    return 'unknown';
  }

  private normalizeBody(value: string): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > 220 ? `${normalized.slice(0, 220)}...` : normalized;
  }

  private async warmup(reason: 'startup' | 'keepalive'): Promise<void> {
    const apiKey = this.getApiKey();
    const voiceId = this.getConfiguredVoiceId();
    if (!apiKey || !voiceId) {
      return;
    }

    const startedAt = Date.now();
    try {
      const result = await this.validateVoice(voiceId, apiKey, `warmup_${reason}_${startedAt}`);
      console.log(
        `[VOICE_WARMUP] provider=elevenlabs reason=${reason} success=true validated=${result.validated} voice_id=${result.meta.voiceId} duration_ms=${Date.now() - startedAt}`
      );
    } catch (err: any) {
      console.warn(
        `[VOICE_WARMUP] provider=elevenlabs reason=${reason} success=false error=${err?.message || err} duration_ms=${Date.now() - startedAt}`
      );
    }
  }
}

export const elevenLabsVoiceService = new ElevenLabsVoiceService();
