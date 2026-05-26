import React from 'react';
import { useSystemStore } from '@core/state/stores/useSystemStore';
import { selectInfrastructure } from '@core/state/selectors/system.selectors';
import { 
  LucideSettings, 
  LucideRefreshCw, 
  LucideSave, 
  LucideShieldCheck, 
  LucideLock,
  LucideNetwork
} from 'lucide-react';
import { OrionCard, OrionPanel, OrionButton, OrionStatusBadge } from '@client/components/OrionUI';
import { Input } from '@ui/input';
import { Separator } from '@ui/separator';
import { cn } from '@lib/utils';
import OperationalPanel from '../components/OperationalPanel';

export function SettingsView() {
  const { mqtt } = useSystemStore(selectInfrastructure);

  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-20 px-2 lg:px-0">
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-8">
        <div className="space-y-3">
          <p className="text-[10px] font-mono uppercase tracking-[0.5em] text-neutral-600">Core_Parameters</p>
          <h1 className="text-5xl font-display font-black text-white italic tracking-tighter uppercase">System_Config</h1>
        </div>
        <OrionStatusBadge status="operational" label="hardware_v1.0.4_nominal" />
      </div>

      <div className="grid grid-cols-1 gap-12">
        <OperationalPanel />

        {/* SECURITY HARDENING */}
        <OrionPanel title="Security_Hardening">
           <div className="space-y-6">
             <div className="flex items-center justify-between p-6 bg-primary/5 border border-primary/20 rounded-2xl group transition-all hover:bg-primary/10">
                <div className="flex items-center gap-5">
                   <div className="p-3 bg-primary/10 rounded-xl text-primary border border-primary/20">
                    <LucideShieldCheck size={24} strokeWidth={1.5} />
                   </div>
                   <div>
                     <p className="text-sm font-display font-bold text-white uppercase italic tracking-widest">End-to-End Encryption</p>
                     <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">All local traffic is signed by the Core</p>
                   </div>
                </div>
                <div className="w-12 h-6 bg-primary rounded-full relative shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                   <div className="absolute right-1 top-1 w-4 h-4 bg-black rounded-full transition-all" />
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <SecurityOption label="Double_Layer_JWT" active={true} />
                <SecurityOption label="Asymmetric_Keys" active={true} />
                <SecurityOption label="Intrusion_Detection" active={false} />
                <SecurityOption label="Bio_Handshake" active={false} />
             </div>
           </div>
        </OrionPanel>

        {/* COMMIT ACTIONS */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-8 pt-8 border-t border-white/5">
          <div className="flex items-center gap-4 text-neutral-600">
            <LucideLock size={16} />
            <span className="text-[10px] font-mono uppercase tracking-[0.2em]">All changes require biometric re-auth</span>
          </div>
          <OrionButton variant="primary" size="lg" className="px-16 h-16 shrink-0 italic">
            <LucideSave size={20} className="mr-3" />
            COMMIT_CHANGES
          </OrionButton>
        </div>
      </div>
    </div>
  );
}

function SecurityOption({ label, active }: { label: string, active: boolean }) {
  return (
    <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-xl">
      <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">{label}</span>
      <div className={cn(
        "w-8 h-4 rounded-full flex items-center px-1 transition-all",
        active ? "bg-primary justify-end" : "bg-neutral-800 justify-start"
      )}>
        <div className="w-2 h-2 bg-black rounded-full" />
      </div>
    </div>
  );
}
