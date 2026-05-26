import { logger } from '@core/logger/Logger';
import { stateSync } from '@core/state/synchronization/StateSync';
import { useAuthStore } from '@core/state/stores/useAuthStore';

class AuthTransitionCoordinator {
  private static instance: AuthTransitionCoordinator;

  public static getInstance(): AuthTransitionCoordinator {
    if (!AuthTransitionCoordinator.instance) {
      AuthTransitionCoordinator.instance = new AuthTransitionCoordinator();
    }
    return AuthTransitionCoordinator.instance;
  }

  public beginRestore(ownerId: string | null): void {
    logger.info('AUTH_TRANSITION', `state=AUTH_RESTORING owner=${ownerId || 'preview'}`);
    logger.info('HYDRATION_BARRIER', `active=true reason=auth_restore owner=${ownerId || 'preview'}`);
    stateSync.setAuthTransitionState('AUTH_RESTORING', ownerId, { hydrationBarrierActive: true, runtimeUiLocked: false });
  }

  public beginSwitch(ownerId: string | null): void {
    logger.info('AUTH_TRANSITION', `state=AUTH_SWITCHING owner=${ownerId || 'preview'}`);
    logger.info('RUNTIME_SWAP', `state=scoped_owner_swap owner=${ownerId || 'preview'}`);
    stateSync.setAuthTransitionState('AUTH_SWITCHING', ownerId, { hydrationBarrierActive: true, runtimeUiLocked: false });
  }

  public completeReady(ownerId: string | null): void {
    logger.info('AUTH_TRANSITION', `state=AUTH_READY owner=${ownerId || 'preview'}`);
    logger.info('AUTH_UI', `render_unblocked=true owner=${ownerId || 'preview'}`);
    stateSync.setAuthTransitionState('AUTH_READY', ownerId, { hydrationBarrierActive: false, runtimeUiLocked: false });
  }

  public completePreviewMode(): void {
    logger.info('AUTH_TRANSITION', 'state=PREVIEW_MODE owner=preview');
    logger.info('AUTH_UI', 'login_visible=true mode=preview');
    stateSync.setAuthTransitionState('PREVIEW_MODE', null, { hydrationBarrierActive: false, runtimeUiLocked: false });
  }

  public fail(ownerId: string | null, error: string): void {
    logger.error('AUTH_RUNTIME', `state=AUTH_FAILED owner=${ownerId || 'preview'} error=${error}`);
    logger.warn('AUTH_UI', `transition_failed owner=${ownerId || 'preview'} error=${error}`);
    stateSync.setAuthTransitionState('AUTH_FAILED', ownerId, { hydrationBarrierActive: false, runtimeUiLocked: false });
  }

  public releaseAuthTransition(reason: string): void {
    const ownerId = useAuthStore.getState().user?.uid || null;
    logger.warn('UI_RECOVERY', `release_auth_transition=true reason=${reason} owner=${ownerId || 'preview'}`);
    logger.warn('AUTH_FREEZE_PROTECTION', `release_auth_transition=true reason=${reason}`);
    if (ownerId) {
      this.completeReady(ownerId);
      return;
    }
    this.completePreviewMode();
  }

  public resetHydrationBarrier(reason: string): void {
    logger.warn('HYDRATION_BARRIER', `reset=true reason=${reason}`);
    stateSync.resetHydrationBarrier();
  }

  public unlockRuntimeUI(reason: string): void {
    logger.warn('RENDER_GUARD', `unlock_runtime_ui=true reason=${reason}`);
    stateSync.unlockRuntimeUI();
  }
}

export const authTransitionCoordinator = AuthTransitionCoordinator.getInstance();
