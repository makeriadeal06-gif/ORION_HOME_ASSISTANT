import { routeRegistry } from './registry/RouteRegistry';

class RouterManager {
  private static instance: RouterManager;
  private initialized = false;
  private lastRoute: string | null = null;

  private constructor() {}

  public static getInstance(): RouterManager {
    if (!RouterManager.instance) {
      RouterManager.instance = new RouterManager();
    }
    return RouterManager.instance;
  }

  private isBootstrapping = false;

  public async bootstrap() {
    if (this.initialized) return;
    if (this.isBootstrapping) {
      console.warn('[ROUTER] Bootstrap already in progress.');
      return;
    }

    this.isBootstrapping = true;
    try {
      console.log('[ROUTER] Orchestrating navigation core...');
      
      // Sync routes from modules
      routeRegistry.syncWithModules();
      
      this.restoreSession();
      this.initialized = true;
      
      console.log('[ROUTER] Core ready.');
    } finally {
      this.isBootstrapping = false;
    }
  }

  private restoreSession() {
    const saved = localStorage.getItem('ORION_LAST_ROUTE');
    if (saved) {
      this.lastRoute = saved;
      // logger.info('ROUTER', `Session restoration target: ${saved}`);
    }
  }

  public persistRoute(path: string) {
    if (path.startsWith('/api/') || path.includes('callback')) return; 
    
    localStorage.setItem('ORION_LAST_ROUTE', path);
    this.lastRoute = path;
  }

  public getLastRoute(): string {
    return this.lastRoute || '/';
  }
}

export const routerManager = RouterManager.getInstance();
