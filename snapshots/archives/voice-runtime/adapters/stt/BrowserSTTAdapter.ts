import { ISTTAdapter } from '../../types';
import { logger } from '../../../logger/Logger';

// Declare standard web speech api interfaces to avoid TS errors
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export class BrowserSTTAdapter implements ISTTAdapter {
  public isListening: boolean = false;
  private recognition: any = null;
  private isPaused: boolean = false;
  private isInitialized: boolean = false;
  private isRecognitionActive: boolean = false;
  private isStartPending: boolean = false;
  private isStopPending: boolean = false;
  private recognitionSessionId: string | null = null;
  private recognitionSessionCounter: number = 0;
  private lastStartAttemptAt: number = 0;
  private readonly startDebounceMs = 100;
  private microphonePermissionPromise: Promise<void> | null = null;
  private microphoneStream: MediaStream | null = null;
  
  private currentOnSpeechDetected: ((text: string) => void) | null = null;
  private currentOnError: ((err: any) => void) | null = null;

  constructor() {
    this.init();
  }

  private init() {
    if (typeof window === 'undefined') return;
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      logger.warn('VOICE_RUNTIME', 'Browser Speech Recognition not supported in this environment.');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false; // We want distinct commands
    this.recognition.interimResults = false;
    this.recognition.lang = 'pt-BR';

    this.recognition.onstart = () => {
      this.isStartPending = false;
      this.isStopPending = false;
      this.isRecognitionActive = true;
      this.isListening = true;
      logger.info('VOICE_RUNTIME', `[VOICE_STT] listening session=${this.recognitionSessionId || 'none'}`);
      logger.info('VOICE_RUNTIME', `[VOICE_STT_SESSION] active session=${this.recognitionSessionId || 'none'}`);
    };

    this.recognition.onresult = (event: any) => {
      if (this.isPaused) {
        logger.trace('VOICE_RUNTIME', 'BrowserSTT ignored speech (Paused/Anti-self-listening).');
        return;
      }
      const transcript = event.results[0][0].transcript;
      if (this.currentOnSpeechDetected) {
        this.currentOnSpeechDetected(transcript);
      }
    };

    this.recognition.onerror = (event: any) => {
      const erroredSessionId = this.recognitionSessionId;
      this.cleanupRecognitionState('onerror');
      logger.warn('VOICE_RUNTIME', `BrowserSTT error: ${event.error}`);
      logger.warn('VOICE_RUNTIME', `[VOICE_STT_SESSION] error session=${erroredSessionId || 'none'} code=${event.error}`);
      if (this.currentOnError) {
        this.currentOnError(event.error);
      }
    };

    this.recognition.onend = () => {
      const endedSessionId = this.recognitionSessionId;
      this.cleanupRecognitionState('onend');
      // Note: Auto-restart logic would go here if we were using continuous wake words.
      // Since it's Push-to-Talk, we let it end.
      logger.trace('VOICE_RUNTIME', `BrowserSTT ended listening. session=${endedSessionId || 'none'}`);
      logger.info('VOICE_RUNTIME', `[VOICE_STT_SESSION] ended session=${endedSessionId || 'none'}`);
    };

    this.isInitialized = true;
  }

  public async startListening(onSpeechDetected: (text: string) => void, onError: (err: any) => void): Promise<void> {
    if (!this.isInitialized || !this.recognition) {
      onError('STT_NOT_SUPPORTED');
      return;
    }

    const now = Date.now();
    if (now - this.lastStartAttemptAt < this.startDebounceMs) {
      logger.info('VOICE_RUNTIME', `[VOICE_STT_LOCK] start_debounced delta_ms=${now - this.lastStartAttemptAt}`);
      return;
    }
    this.lastStartAttemptAt = now;

    if (this.isPaused) {
      logger.info('VOICE_RUNTIME', '[VOICE_STT_LOCK] start_blocked paused=true');
      return;
    }

    if (this.isStartPending || this.isRecognitionActive || this.isListening) {
      logger.info(
        'VOICE_RUNTIME',
        `[VOICE_STT_LOCK] start_blocked active=${this.isRecognitionActive} pending=${this.isStartPending} listening=${this.isListening} session=${this.recognitionSessionId || 'none'}`
      );
      return;
    }

    this.isStartPending = true;
    this.isStopPending = false;
    this.recognitionSessionId = `stt_${++this.recognitionSessionCounter}_${Date.now()}`;
    logger.info('VOICE_RUNTIME', `[VOICE_STT_SESSION] start_requested session=${this.recognitionSessionId}`);

    this.currentOnSpeechDetected = onSpeechDetected;
    this.currentOnError = onError;
    this.isPaused = false;

    try {
      await this.ensureMicrophoneReady();

      if (this.isRecognitionActive || this.isListening) {
        this.isStartPending = false;
        logger.info('VOICE_RUNTIME', `[VOICE_STT_LOCK] start_cancelled_already_active session=${this.recognitionSessionId}`);
        return;
      }

      logger.info('VOICE_RUNTIME', `[VOICE_STT] start() session=${this.recognitionSessionId}`);
      this.recognition.start();
    } catch (e: any) {
      this.cleanupRecognitionState('start_error');
      logger.warn('VOICE_RUNTIME', `Microphone permission denied or STT failed: ${e.message}`);
      onError(e.message || 'PERMISSION_DENIED');
    }
  }

  public stopListening(): void {
    if (!this.recognition) {
      return;
    }

    if (this.isStartPending || this.isRecognitionActive || this.isListening) {
      this.isStopPending = true;
      logger.info('VOICE_RUNTIME', `[VOICE_STT] stop() session=${this.recognitionSessionId || 'none'}`);
      try {
        this.recognition.stop();
      } catch (e: any) {
        logger.warn('VOICE_RUNTIME', `[VOICE_STT_LOCK] stop_failed session=${this.recognitionSessionId || 'none'} error=${e.message || e}`);
        this.cleanupRecognitionState('stop_error');
      }
      return;
    }

    this.cleanupRecognitionState('stop_idle');
  }

  public pauseListening(): void {
    this.isPaused = true;
    if (this.recognition && (this.isListening || this.isRecognitionActive || this.isStartPending)) {
      this.isStopPending = true;
      logger.info('VOICE_RUNTIME', `[VOICE_STT] abort() session=${this.recognitionSessionId || 'none'}`);
      try {
        this.recognition.abort(); // Immediately stop capturing audio
      } catch (e: any) {
        logger.warn('VOICE_RUNTIME', `[VOICE_STT_LOCK] abort_failed session=${this.recognitionSessionId || 'none'} error=${e.message || e}`);
        this.cleanupRecognitionState('abort_error');
      }
    }
    logger.trace('VOICE_RUNTIME', 'BrowserSTT paused (Anti-loop guard active).');
  }

  public resumeListening(): void {
    this.isPaused = false;
    logger.trace('VOICE_RUNTIME', 'BrowserSTT resumed (Anti-loop guard inactive).');
  }

  private cleanupRecognitionState(reason: string): void {
    logger.info(
      'VOICE_RUNTIME',
      `[VOICE_STT_LOCK] cleanup reason=${reason} session=${this.recognitionSessionId || 'none'} active=${this.isRecognitionActive} pending=${this.isStartPending} stopPending=${this.isStopPending}`
    );
    this.isListening = false;
    this.isRecognitionActive = false;
    this.isStartPending = false;
    this.isStopPending = false;
    this.recognitionSessionId = null;
  }

  private async ensureMicrophoneReady(): Promise<void> {
    if (this.microphoneStream && this.microphoneStream.active) {
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('MEDIA_DEVICES_UNAVAILABLE');
    }

    if (!this.microphonePermissionPromise) {
      this.microphonePermissionPromise = navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          this.microphoneStream = stream;
          logger.info('VOICE_RUNTIME', '[VOICE_STT] microphone_warm=true');
        })
        .catch((error) => {
          this.microphonePermissionPromise = null;
          throw error;
        });
    }

    await this.microphonePermissionPromise;
  }
}
