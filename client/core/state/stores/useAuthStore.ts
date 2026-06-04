import { create } from 'zustand';
import { User } from 'firebase/auth';
import { logger } from '@core/logger/Logger';

export enum AuthState {
  IDLE = 'IDLE',
  AUTHENTICATING = 'AUTHENTICATING',
  AUTHENTICATED = 'AUTHENTICATED',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  RESTORING_SESSION = 'RESTORING_SESSION',
  AUTH_ERROR = 'AUTH_ERROR'
}

interface AuthStore {
  user: User | null;
  state: AuthState;
  error: string | null;
  setAuth: (user: User | null, state: AuthState, error?: string | null) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  state: AuthState.IDLE,
  error: null,
  setAuth: (user, state, error = null) => set((current) => {
    // Never allow reverting to IDLE after the runtime has progressed beyond boot.
    if (state === AuthState.IDLE && current.state !== AuthState.IDLE) {
      logger.warn('AUTH_STORE', `reject_transition_to_IDLE prevented current=${current.state}`);
      return current;
    }
    logger.info('AUTH_STORE', `transition state=${state} user=${user?.uid || 'null'}`);
    return { user, state, error };
  })
}));
