import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { moduleRegistry } from '../modules/registry/ModuleRegistry';
import { ModuleLoader } from '../modules/loader/ModuleLoader';
import { LucideShieldAlert } from 'lucide-react';
import { OrionCard } from '../../components/OrionUI';

export const NavigationEngine: React.FC = () => {
  const activeModules = moduleRegistry.getActiveModules();

  if (activeModules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-20 min-h-[60vh]">
         <OrionCard variant="premium" className="max-w-md p-10 border-red-500/20 bg-red-500/5 text-center">
            <LucideShieldAlert className="text-red-500 mx-auto mb-6" size={48} />
            <h2 className="text-2xl font-display font-black text-white italic tracking-tighter uppercase mb-4">
              Registry_Empty
            </h2>
            <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-[0.2em] leading-relaxed mb-8">
              No active modules were detected in the ORION registry. This typically indicates a critical boot failure or registry desync.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="px-8 py-3 bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-mono uppercase tracking-[0.3em] hover:bg-red-500/20 transition-all rounded-lg"
            >
              Reinitialize_Registry
            </button>
          </OrionCard>
      </div>
    );
  }

  return (
    <Routes>
      {activeModules.map((mod) => (
        <Route 
          key={mod.id} 
          path={mod.route} 
          element={
            <ModuleLoader 
              component={mod.component} 
              name={mod.name} 
            />
          } 
        />
      ))}

      {/* Persistent Redirects */}
      <Route path="/dashboard" element={<Navigate to="/" replace />} />
      
      {/* 404 Resilient System */}
      <Route path="*" element={
        <div className="flex flex-col items-center justify-center p-20 min-h-[60vh]">
          <OrionCard variant="default" className="max-w-md p-10 border-white/5 bg-white/[0.02] text-center">
            <LucideShieldAlert className="text-neutral-700 mx-auto mb-6" size={48} />
            <h2 className="text-2xl font-display font-black text-white italic tracking-tighter uppercase mb-4">
              Unknown_Vector
            </h2>
            <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-[0.2em] leading-relaxed mb-8">
              The requested routing coordinates do not match any registered module signature in the ORION registry.
            </p>
            <button 
              onClick={() => window.location.href = '/'}
              className="px-8 py-3 bg-primary/10 border border-primary/20 text-primary text-[10px] font-mono uppercase tracking-[0.3em] hover:bg-primary/20 transition-all rounded-lg"
            >
              Return_To_Base
            </button>
          </OrionCard>
        </div>
      } />
    </Routes>
  );
};
