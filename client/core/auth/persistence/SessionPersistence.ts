import { logger } from '../../logger/Logger';

export class SessionPersistence {
  private static KEY = 'ORION_AUTH_PERSISTENCE';

  public static setStickySession(status: boolean) {
    localStorage.setItem(this.KEY, status ? 'active' : 'inactive');
    logger.info('AUTH_PERSISTENCE', `Sticky session: ${status}`);
  }

  public static isSticky(): boolean {
    return localStorage.getItem(this.KEY) === 'active';
  }
}
