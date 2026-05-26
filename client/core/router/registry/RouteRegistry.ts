import { OrionRoute } from '../types/router';
import { moduleRegistry } from '../../modules/registry/ModuleRegistry';

class RouteRegistry {
  private static instance: RouteRegistry;
  private routes: Map<string, OrionRoute> = new Map();

  private constructor() {}

  public static getInstance(): RouteRegistry {
    if (!RouteRegistry.instance) {
      RouteRegistry.instance = new RouteRegistry();
    }
    return RouteRegistry.instance;
  }

  public syncWithModules() {
    console.log('[ROUTE_REGISTRY] Synchronizing routes with ModuleRegistry...');
    const modules = moduleRegistry.getAllModules();
    
    modules.forEach(mod => {
      this.routes.set(mod.route, {
        path: mod.route,
        moduleId: mod.id,
        layout: (mod.metadata?.layout as any) || 'DEFAULT',
        metadata: mod.metadata
      });
    });

    console.log(`[ROUTE_REGISTRY] ${this.routes.size} routes registered.`);
  }

  public getRoute(path: string): OrionRoute | undefined {
    return this.routes.get(path);
  }

  public getAllRoutes(): OrionRoute[] {
    return Array.from(this.routes.values());
  }

  public isProtected(path: string): boolean {
    const route = this.getRoute(path);
    return !!(route?.guards && route.guards.length > 0);
  }
}

export const routeRegistry = RouteRegistry.getInstance();
