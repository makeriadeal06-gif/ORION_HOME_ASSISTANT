import { FirebaseAdapter } from '../adapters/FirebaseAdapter';
import { useAuthStore, AuthState } from '../../state/stores/useAuthStore';
import { logger } from '../../logger/Logger';
import { authApi } from '../../api/endpoints/auth';
import { stateSync } from '../../state/synchronization/StateSync';
import { SessionPersistence } from '../persistence/SessionPersistence';
import { AuthGuard } from '../guards/AuthGuard';
import { triggerManager } from '../../runtime/TriggerManager';
import { authTransitionCoordinator } from './AuthTransitionCoordinator';

class AuthManager {
  private static instance: AuthManager;
  private initialized = false;
  private _isAuthenticated = false;
  private lastKnownUserId: string | null = null;
  private restoreTimeoutTimer: number | null = null;
  private readonly RESTORE_TIMEOUT_MS = 10000; // Give Firebase ~10s to emit auth state before falling back to preview

  private constructor() { }

  public get isAuthenticated(): boolean {
    const store = useAuthStore.getState();
    return store.state === AuthState.AUTHENTICATED;
  }

  public static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  public init() {
    if (this.initialized) return;

    logger.info('AUTH_RUNTIME', 'Initializing Firebase Auth transition layer...');
    // Enter restoring session phase and schedule a guarded fallback in case
    // the Firebase adapter never invokes its change callback (network issues,
    // blocked 3rd-party cookies, or platform restrictions). This prevents the
    // runtime from permanently staying in RESTORING_SESSION and blocking
    // recovery/health loops.
    useAuthStore.getState().setAuth(null, AuthState.RESTORING_SESSION);
    stateSync.setAuthenticating(true);
    authTransitionCoordinator.beginRestore(null);

    try {
      // Schedule a defensive timeout to release the auth transition to preview
      // if no auth event arrives within RESTORE_TIMEOUT_MS.
      this.restoreTimeoutTimer = window.setTimeout(() => {
        const current = useAuthStore.getState().state;
        if (current === AuthState.RESTORING_SESSION && !this.lastKnownUserId) {
          logger.warn('AUTH_RUNTIME', `restore_timeout reason=auth_restore_timed_out ms=${this.RESTORE_TIMEOUT_MS}`);
          // Move to preview/unauthenticated so the rest of the runtime can stabilize.
          useAuthStore.getState().setAuth(null, AuthState.UNAUTHENTICATED);
          stateSync.setAuthenticating(false);
          SessionPersistence.setStickySession(false);
          authTransitionCoordinator.completePreviewMode();
          triggerManager.setUserId(null);
        }
        this.restoreTimeoutTimer = null;
      }, this.RESTORE_TIMEOUT_MS) as unknown as number;
    } catch (e) {
      // If timers aren't available in the environment, ignore — the
      // onAuthChanged handler below will still drive transitions.
    }

    FirebaseAdapter.onAuthChanged(async (user) => {
      // An auth event arrived — cancel any fallback timer we previously scheduled.
      if (this.restoreTimeoutTimer) {
        window.clearTimeout(this.restoreTimeoutTimer);
        this.restoreTimeoutTimer = null;
      }

      const previousUserId = this.lastKnownUserId;
      stateSync.setAuthenticating(true);

      if (user) {
        if (previousUserId && previousUserId !== user.uid) {
          authTransitionCoordinator.beginSwitch(user.uid);
        } else {
          authTransitionCoordinator.beginRestore(user.uid);
        }
        logger.info('AUTH_RUNTIME', `currentUser detected uid=${user.uid} email=${user.email}`);
        useAuthStore.getState().setAuth(user, AuthState.AUTHENTICATED);
        stateSync.updateAuthState(true);
        SessionPersistence.setStickySession(true);
        logger.info('AUTH_RUNTIME', `authenticated=true userId=${user.uid}`);
        triggerManager.setUserId(user.uid);

        try {
          await authApi.syncSession(true);
        } catch (e) {
          logger.error('AUTH_RUNTIME', 'Backend sync failed');
        }
        this.lastKnownUserId = user.uid;
        stateSync.setAuthenticating(false);
        authTransitionCoordinator.completeReady(user.uid);
      } else {
        if (previousUserId) {
          authTransitionCoordinator.beginSwitch(previousUserId);
        } else {
          authTransitionCoordinator.beginRestore(null);
        }
        logger.info('AUTH_RUNTIME', 'currentUser=null');
        useAuthStore.getState().setAuth(null, AuthState.UNAUTHENTICATED);
        stateSync.updateAuthState(false);
        SessionPersistence.setStickySession(false);
        logger.info('AUTH_RUNTIME', 'authenticated=false');
        triggerManager.setUserId(null);

        try {
          await authApi.syncSession(false);
        } catch (e) {
          // Silent cleanup
        }
        this.lastKnownUserId = null;
        stateSync.setAuthenticating(false);
        authTransitionCoordinator.completePreviewMode();
      }
    });

    this.initialized = true;
  }

  public async login() {
    if (AuthGuard.isAuthenticating()) return;

    logger.info('FIREBASE_AUTH', 'Popup intent: GOOGLE_PROVIDER');
    const currentUser = useAuthStore.getState().user;
    useAuthStore.getState().setAuth(currentUser, AuthState.AUTHENTICATING);
    stateSync.setAuthenticating(true);
    authTransitionCoordinator.beginSwitch(currentUser?.uid || null);

    try {
      await FirebaseAdapter.signInWithGoogle();
      logger.info('FIREBASE_AUTH', 'Handshake complete');
    } catch (error: any) {
      logger.error('FIREBASE_AUTH', `Auth failure: ${error.message}`);
      if (currentUser) {
        useAuthStore.getState().setAuth(currentUser, AuthState.AUTHENTICATED, null);
        authTransitionCoordinator.completeReady(currentUser.uid);
      } else {
        useAuthStore.getState().setAuth(null, AuthState.AUTH_ERROR, error.message);
        authTransitionCoordinator.fail(null, error.message);
      }
      stateSync.setAuthenticating(false);
    }
  }

  public async logout() {
    logger.info('FIREBASE_AUTH', 'Revoking credentials...');
    const currentUser = useAuthStore.getState().user;
    useAuthStore.getState().setAuth(currentUser, AuthState.AUTHENTICATING);
    stateSync.setAuthenticating(true);
    authTransitionCoordinator.beginSwitch(currentUser?.uid || null);
    try {
      await FirebaseAdapter.signOut();
      logger.info('FIREBASE_AUTH', 'Session terminated.');
    } catch (error: any) {
      logger.error('FIREBASE_AUTH', `Logout error: ${error.message}`);
      if (currentUser) {
        useAuthStore.getState().setAuth(currentUser, AuthState.AUTHENTICATED, null);
        stateSync.setAuthenticating(false);
        authTransitionCoordinator.completeReady(currentUser.uid);
      }
    }
  }
}

export const authManager = AuthManager.getInstance();
