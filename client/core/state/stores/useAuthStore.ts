import { create } from 'zustand';
import { User } from 'firebase/auth';

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
  setAuth: (user, state, error = null) => set({ user, state, error })
}));
