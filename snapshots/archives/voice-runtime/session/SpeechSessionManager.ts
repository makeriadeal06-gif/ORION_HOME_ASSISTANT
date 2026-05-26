import { SpeechSession } from '../types';
import { logger } from '../../logger/Logger';

export class SpeechSessionManager {
  private static instance: SpeechSessionManager;
  private currentSession: SpeechSession | null = null;
  private queue: SpeechSession[] = [];

  private constructor() {}

  public static getInstance(): SpeechSessionManager {
    if (!SpeechSessionManager.instance) {
      SpeechSessionManager.instance = new SpeechSessionManager();
    }
    return SpeechSessionManager.instance;
  }

  public enqueueSession(text: string): SpeechSession {
    const session: SpeechSession = {
      id: Math.random().toString(36).substring(7),
      text,
      status: 'PENDING',
      abortController: new AbortController(),
      createdAt: Date.now()
    };

    this.queue.push(session);
    logger.info('VOICE_TTS', `enqueue session=${session.id} queueSize=${this.queue.length}`);
    return session;
  }

  public getNextSession(): SpeechSession | null {
    if (this.queue.length === 0) return null;
    this.currentSession = this.queue.shift() || null;
    if (this.currentSession) {
      this.currentSession.status = 'PLAYING';
      logger.info('VOICE_TTS', `dequeue session=${this.currentSession.id} remainingQueue=${this.queue.length}`);
    }
    return this.currentSession;
  }

  public getCurrentSession(): SpeechSession | null {
    return this.currentSession;
  }

  public completeCurrentSession() {
    if (this.currentSession) {
      this.currentSession.status = 'COMPLETED';
      logger.info('VOICE_TTS', `complete session=${this.currentSession.id}`);
      this.currentSession = null;
    }
  }

  public abortAllSessions() {
    // 1. Abort current
    if (this.currentSession) {
      this.currentSession.status = 'ABORTED';
      this.currentSession.abortController.abort();
      logger.info('VOICE_TTS', `abort current_session=${this.currentSession.id}`);
      this.currentSession = null;
    }

    // 2. Clear queue
    if (this.queue.length > 0) {
      this.queue.forEach(s => {
        s.status = 'ABORTED';
        s.abortController.abort();
      });
      logger.info('VOICE_TTS', `clear pending_sessions=${this.queue.length}`);
      this.queue = [];
    }
  }

  public getQueueLength(): number {
    return this.queue.length;
  }
}

export const speechSessionManager = SpeechSessionManager.getInstance();
