import { logger } from '../../logger/Logger';
import { useAuthStore, AuthState } from '../../state/stores/useAuthStore';

export class SessionRestore {
  public static async restore() {
    logger.info('AUTH_SESSION', 'Attempting session restoration...');
    // Mark the runtime as restoring session so other managers can defer
    // hydration until restoration completes. This is the canonical state
    // used by the AuthManager during boot.
    useAuthStore.getState().setAuth(null, AuthState.RESTORING_SESSION);
  }
}
