import { useAuthStore, AuthState } from '../../state/stores/useAuthStore';

export class AuthGuard {
  public static isAuthenticated(): boolean {
    return useAuthStore.getState().state === AuthState.AUTHENTICATED;
  }

  public static isAuthenticating(): boolean {
    const state = useAuthStore.getState().state;
    return state === AuthState.AUTHENTICATING || state === AuthState.RESTORING_SESSION;
  }
}
