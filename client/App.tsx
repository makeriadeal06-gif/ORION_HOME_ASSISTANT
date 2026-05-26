import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSystemStore } from '@core/state/stores/useSystemStore';
import { moduleRegistry } from '@core/modules/registry/ModuleRegistry';
import { registerAllModules } from '@core/modules/registry/registerModules';
import { runtimeManager } from '@core/runtime/RuntimeManager';
import { moduleHealthMonitor } from '@core/modules/health/ModuleHealthMonitor';
import { routerManager } from '@core/router/RouterManager';
import { NavigationEngine } from '@core/router/NavigationEngine';
import { OrionShell } from './OrionShell';
import { OrionCard } from './components/OrionUI';
import { LucideShieldAlert } from 'lucide-react';

let globalBootStarted = false;
let globalBootFinished = false;

export default function App() {
  const setCurrentView = useSystemStore(state => state.setCurrentView);
  const location = useLocation();
  const [isReady, setIsReady] = useState(globalBootFinished);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    const boot = async () => {
      if (globalBootStarted) return;
      globalBootStarted = true;

      try {
        // 0. Environment Validation
        if (import.meta.env.PROD) {
          console.log('[PROD_BOOT] Validating environment assets...');
          // Check for critical VITE_ variables if needed
          if (!import.meta.env.VITE_MQTT_URL) {
            console.warn('[PROD_BOOT] VITE_MQTT_URL is missing, using fallbacks.');
          }
        }

        // 1. Module Registration
        registerAllModules();
        
        // 2. Router Bootstrap (Syncs routes from modules)
        await routerManager.bootstrap();

        // 3. Runtime Bootstrap
        await runtimeManager.bootstrap();

        // 4. Initialize Registered Modules
        await moduleRegistry.initializeAll();
        
        if (disposed) return;

        globalBootFinished = true;
        setIsReady(true);
        moduleHealthMonitor.start();
      } catch (error) {
        console.error('[BOOT_CRITICAL] System failure during startup:', error);
        if (!disposed) {
          setBootError(error instanceof Error ? error.message : 'Unknown_System_Fault');
        }
      }
    };

    if (!globalBootFinished) {
      void boot();
    }

    return () => {
      disposed = true;
      // Note: We don't stop health monitor if App unmounts but is likely to remount
      // However, for strict safety, we should have a way to stop it if the app is truly shutting down.
      // But in this SPA, App unmounting usually means page reload or close.
    };
  }, []);

  // Sync currentView store and persist route
  useEffect(() => {
    if (!isReady) return;
    const activeMod = moduleRegistry.getAllModules().find(m => m.route === location.pathname);
    if (activeMod) {
      setCurrentView(activeMod.id);
      routerManager.persistRoute(location.pathname);
    }
  }, [location.pathname, setCurrentView, isReady]);

  if (bootError) {
    return (
      <div className="fixed inset-0 bg-[#050505] flex items-center justify-center p-6">
        <OrionCard variant="premium" className="max-w-md p-10 border-red-500/20 bg-red-500/5 text-center">
          <LucideShieldAlert className="text-red-500 mx-auto mb-6" size={48} />
          <h2 className="text-2xl font-display font-black text-white italic tracking-tighter uppercase mb-4">
            Critical_System_Fault
          </h2>
          <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-[0.2em] leading-relaxed mb-8">
            ORION encountered a critical failure during the boot sequence: <span className="text-red-400">{bootError}</span>
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="px-8 py-3 bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-mono uppercase tracking-[0.3em] hover:bg-red-500/20 transition-all rounded-lg"
          >
            Attempt_System_Recovery
          </button>
        </OrionCard>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="fixed inset-0 bg-[#050505] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-[0.4em] animate-pulse">
            Booting_Orion_OS...
          </p>
        </div>
      </div>
    );
  }

  return (
    <OrionShell>
      <NavigationEngine />
    </OrionShell>
  );
}
