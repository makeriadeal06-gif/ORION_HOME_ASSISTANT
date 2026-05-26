import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProductionStore } from '../state/useProductionStore';
import { 
  LucideActivity, 
  LucideShield, 
  LucideServer, 
  LucideCpu, 
  LucideDatabase, 
  LucideZap,
  LucideGlobe,
  LucideCheckCircle2,
  LucideAlertCircle,
  LucideXCircle
} from 'lucide-react';
import { OrionPanel } from '@client/components/OrionUI';
import { cn } from '@lib/utils';

export const ProductionDiagnosticsPanel: React.FC = () => {
  const { health } = useProductionStore();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'HEALTHY': return <LucideCheckCircle2 size={12} className="text-green-500" />;
      case 'DEGRADED': return <LucideAlertCircle size={12} className="text-amber-500 animate-pulse" />;
      case 'CRITICAL': return <LucideXCircle size={12} className="text-red-500 animate-bounce" />;
      default: return null;
    }
  };

  const getSubsystemIcon = (id: string) => {
    switch (id) {
      case 'SOCKET_LAYER': return <LucideGlobe size={14} />;
      case 'MQTT_LAYER': return <LucideZap size={14} />;
      case 'DATABASE_SYNC': return <LucideDatabase size={14} />;
      case 'COGNITIVE_CORE': return <LucideCpu size={14} />;
      default: return <LucideServer size={14} />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LucideShield size={20} className="text-primary" />
          <h3 className="text-xs font-mono uppercase tracking-[0.4em] text-neutral-500">Infrastructure_Diagnostics_Terminal</h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
             <p className="text-[8px] font-mono text-neutral-600 uppercase">Production_Environment</p>
             <p className="text-[10px] font-mono text-white uppercase">{health.env}</p>
          </div>
          <div className="w-[1px] h-6 bg-white/5" />
          <div className="text-right">
             <p className="text-[8px] font-mono text-neutral-600 uppercase">Engine_Version</p>
             <p className="text-[10px] font-mono text-primary uppercase">{health.version}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {Object.values(health.subsystems).map((sub) => (
          <OrionPanel key={sub.id} className={cn(
             "p-4 border-white/5 bg-neutral-900/40 transition-all",
             sub.status === 'CRITICAL' && "border-red-500/20 bg-red-500/5",
             sub.status === 'DEGRADED' && "border-amber-500/20 bg-amber-500/5"
          )}>
            <div className="flex items-start justify-between mb-3">
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center",
                sub.status === 'HEALTHY' ? "bg-white/5 text-neutral-400" : 
                sub.status === 'DEGRADED' ? "bg-amber-500/10 text-amber-500" : "bg-red-500/10 text-red-500"
              )}>
                {getSubsystemIcon(sub.id)}
              </div>
              {getStatusIcon(sub.status)}
            </div>
            
            <div className="space-y-1">
              <p className="text-[10px] font-display font-bold text-white uppercase tracking-tight truncate">{sub.name}</p>
              <p className="text-[8px] font-mono text-neutral-600 uppercase">
                {sub.message || 'Operational_State'}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
              <span className="text-[7px] font-mono text-neutral-700 uppercase">Sync_Pulse</span>
              <span className="text-[7px] font-mono text-neutral-500 tracking-tighter">
                {new Date(sub.lastPing).toLocaleTimeString([], { hour12: false, fractionalSecondDigits: 1 })}
              </span>
            </div>
          </OrionPanel>
        ))}
      </div>
    </div>
  );
};
