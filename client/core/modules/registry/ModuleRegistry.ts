import { OrionModule, ModuleState, RegisteredModule } from '../types/module';
import { logger } from '../../logger/Logger';

class ModuleRegistry {
  private static instance: ModuleRegistry;
  private modules: Map<string, RegisteredModule> = new Map();
  private initialized = false;
  private registered = false;
  private systemStorePromise: Promise<typeof import('../../state/stores/useSystemStore')> | null = null;
  private lastRegistrySyncSignature = '';

  private constructor() {}

  public static getInstance(): ModuleRegistry {
    if (!ModuleRegistry.instance) {
      ModuleRegistry.instance = new ModuleRegistry();
    }
    return ModuleRegistry.instance;
  }

  public setRegistered(status: boolean) {
    this.registered = status;
  }

  public isRegistered(): boolean {
    return this.registered;
  }

  public register(module: OrionModule) {
    if (this.initialized) {
      logger.error('MODULE_REGISTRY', `Attempted to register module ${module.id} after registry lock.`);
      return;
    }

    if (this.modules.has(module.id)) {
      logger.warn('MODULE_REGISTRY', `Module ${module.id} already registered.`);
      return;
    }

    this.modules.set(module.id, {
      ...module,
      state: ModuleState.REGISTERED,
      lastHealthCheck: Date.now(),
      enabled: module.enabled !== false, // default to true
      hidden: module.hidden || false
    });
  }

  public getModule(id: string): RegisteredModule | undefined {
    return this.modules.get(id);
  }

  public getAllModules(): RegisteredModule[] {
    return Array.from(this.modules.values());
  }

  public getActiveModules(): RegisteredModule[] {
    return this.getAllModules().filter(m => m.enabled && !m.hidden);
  }

  public async initializeAll() {
    if (this.initialized) return;
    this.initialized = true;

    // Sort by modules
    const sortedModules = this.getSortedModules();

    for (const module of sortedModules) {
      if (!module.enabled) continue;

      try {
        this.updateModuleState(module.id, ModuleState.INITIALIZING);
        
        if (module.initialize) {
          await module.initialize();
        }
        
        this.updateModuleState(module.id, ModuleState.ACTIVE);
      } catch (error) {
        logger.error('MODULE_LIFECYCLE', `Failed to initialize ${module.id}`, error);
        this.updateModuleState(module.id, ModuleState.FAILED);
      }
    }
    
    logger.info('MODULE_REGISTRY', 'Module synchronization complete.');
  }

  private getSortedModules(): RegisteredModule[] {
    const modules = this.getAllModules();
    // Simple topological sort or just dependency check
    // For now, we return them as is, but architecture permits sorting
    return modules;
  }

  public updateModuleState(id: string, state: ModuleState) {
    const module = this.modules.get(id);
    if (module) {
      module.state = state;
      this.modules.set(id, { ...module });
      
      this.syncWithStore();
      logger.debug('MODULE_HEALTH', `${id} -> ${state}`);
    }
  }

  private syncWithStore() {
    try {
      const modulesData = this.getAllModules().map(m => ({
        id: m.id,
        name: m.name,
        state: m.state,
        version: m.version
      }));
      const signature = modulesData.map((module) => `${module.id}:${module.state}:${module.version}`).join('|');
      if (signature === this.lastRegistrySyncSignature) {
        return;
      }
      this.lastRegistrySyncSignature = signature;
      this.systemStorePromise ??= import('../../state/stores/useSystemStore');
      this.systemStorePromise.then(({ useSystemStore }) => {
        useSystemStore.getState().updateRegistryModules(modulesData);
      });
    } catch (e) {
      // Fail silently if store not ready
    }
  }

  public async runHealthChecks() {
    for (const module of this.modules.values()) {
      if (!module.enabled || !module.healthcheck) continue;

      try {
        const isHealthy = await module.healthcheck();
        this.updateModuleState(module.id, isHealthy ? ModuleState.ACTIVE : ModuleState.DEGRADED);
        module.lastHealthCheck = Date.now();
      } catch (error) {
        this.updateModuleState(module.id, ModuleState.FAILED);
      }
    }
  }
}

export const moduleRegistry = ModuleRegistry.getInstance();
