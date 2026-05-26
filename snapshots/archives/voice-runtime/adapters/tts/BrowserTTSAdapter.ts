import { ITTSAdapter, TTSRequestMetadata, VoiceProfile } from '../../types';
import { logger } from '../../../logger/Logger';

export class BrowserTTSAdapter implements ITTSAdapter {
  public isSpeaking: boolean = false;
  private synth: SpeechSynthesis | null = null;

  constructor() {
    this.init();
  }

  private init() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      // Handle Chrome asynchronous voice loading
      window.speechSynthesis.onvoiceschanged = () => {
        if (this.synth) {
          const count = this.synth.getVoices().length;
          logger.info('VOICE_RUNTIME', '[VOICE_TTS] voiceschanged fired, available voices: ' + count);
        }
      };
    } else {
      logger.warn('VOICE_RUNTIME', 'Browser Speech Synthesis not supported.');
    }
  }

  public speak(
    text: string,
    profile: VoiceProfile,
    onEnd: () => void,
    onError: (err: any) => void,
    metadata?: TTSRequestMetadata
  ): void {
    logger.info('VOICE_PROVIDER', 'browser_fallback_active=true');
    logger.warn('BROWSER_FALLBACK_TRIGGER', `provider=browser session=${metadata?.sessionId || 'none'} request=${metadata?.requestId || 'none'} reason=browser_tts_invoked`);
    logger.info('VOICE_PROVIDER', 'selected=browser');
    logger.info('VOICE_PROVIDER', 'fallback=browser');
    logger.info('VOICE_PLAYBACK', 'source=browser');
    logger.info('PLAYBACK_PROVIDER', `provider=browser profile=${profile.id}`);
    if (metadata) {
      logger.info('VOICE_REQUEST', `browser_fallback session=${metadata.sessionId} request=${metadata.requestId}`);
    }
    
    if (!this.synth) {
      logger.error('VOICE_RUNTIME', '[VOICE_TTS] synth not available');
      onError('TTS not supported');
      return;
    }

    this.stopSpeaking();

    const utterance = new SpeechSynthesisUtterance(text);
    const speechRate = Math.min(0.97, Math.max(0.92, profile.rate || 0.96));
    utterance.lang = 'pt-BR';
    utterance.pitch = profile.pitch;
    utterance.rate = speechRate;

    logger.info(
      'NATURALIZATION_RUNTIME',
      `speech_rate=${speechRate.toFixed(2)} pacing_profile=conversational_soft stability=browser style=browser startup_buffer_ms=0 playback_transition_mode=browser_native`
    );

    const voices = this.synth.getVoices();
    logger.info('VOICE_RUNTIME', '[VOICE_TTS] available voices: ' + voices.length);
    
    if (voices.length > 0) {
      const ptVoice = voices.find(v => v.lang === 'pt-BR' || v.lang === 'pt_BR') || voices[0];
      if (ptVoice) {
        utterance.voice = ptVoice;
        logger.info('VOICE_RUNTIME', '[VOICE_TTS] selected voice: ' + ptVoice.name);
      }
    }

    utterance.onstart = () => {
      this.isSpeaking = true;
      metadata?.onPlaybackStart?.(Date.now());
      logger.info('AUDIO_PLAYBACK', `provider=browser session=${metadata?.sessionId || 'none'} request=${metadata?.requestId || 'none'} started=true`);
      logger.info('VOICE_TTS', 'browser_playback_started');
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      logger.info('PLAYBACK_FINISHED', `provider=browser session=${metadata?.sessionId || 'none'} request=${metadata?.requestId || 'none'}`);
      logger.info('VOICE_TTS', 'browser_playback_finished');
      onEnd();
    };

    utterance.onerror = (e) => {
      this.isSpeaking = false;
      if (e.error !== 'canceled') {
        logger.error('PLAYBACK_FAILED', `provider=browser session=${metadata?.sessionId || 'none'} request=${metadata?.requestId || 'none'} error=${e.error}`);
        logger.warn('VOICE_RUNTIME', '[VOICE_TTS] error: ' + e.error);
        onError(e.error);
      } else {
        onEnd();
      }
    };

    try {
      this.synth.speak(utterance);
      logger.info('PLAYBACK_START', `provider=browser session=${metadata?.sessionId || 'none'} request=${metadata?.requestId || 'none'}`);
      logger.info('VOICE_RUNTIME', '[VOICE_TTS] speak() called successfully');
    } catch (e: any) {
      logger.error('PLAYBACK_FAILED', `provider=browser session=${metadata?.sessionId || 'none'} request=${metadata?.requestId || 'none'} reason=${e.message}`);
      logger.error('VOICE_RUNTIME', '[VOICE_TTS] speak failed: ' + e.message);
      onError(e.message);
    }
  }

  public stopSpeaking(): void {
    if (this.synth && (this.synth.speaking || this.synth.pending)) {
      this.synth.cancel(); // IMMEDIATE TTS INTERRUPTION SYSTEM
      this.isSpeaking = false;
      logger.trace('VOICE_RUNTIME', 'BrowserTTS speech explicitly cancelled.');
    }
  }
}
