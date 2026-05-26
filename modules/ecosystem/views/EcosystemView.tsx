import React from 'react';
import { 
  LucideLayers, 
  LucideCheckCircle2, 
  LucideCpu, 
  LucideGlobe, 
  LucideSmartphone, 
  LucideShieldCheck 
} from 'lucide-react';
import { Badge } from '@ui/badge';
import { motion } from 'framer-motion';
import { OrionCard, OrionPanel, OrionButton, OrionStatusBadge } from '@client/components/OrionUI';
import { Separator } from '@ui/separator';

export function EcosystemView() {
  return (
    <div className="space-y-16 pb-24">
      {/* HEADER HERO SECTION */}
      <div className="relative py-20 px-10 overflow-hidden rounded-[4rem] bg-white/[0.02] border border-white/5">
        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
           <LucideLayers size={300} />
        </div>
        
        {/* BACKGROUND AMBIENCE */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center max-w-3xl mx-auto space-y-8">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-24 h-24 bg-primary/10 flex items-center justify-center rounded-[2.5rem] border border-primary/20 shadow-[0_0_50px_rgba(6,182,212,0.1)] relative group"
          >
             <div className="absolute inset-0 bg-primary/20 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
             <LucideLayers size={44} className="text-primary z-10 animate-cognitive-pulse" />
          </motion.div>
          <div className="space-y-4">
            <h2 className="text-6xl font-display font-black text-white tracking-tighter uppercase italic">Ecosystem_Map</h2>
            <p className="text-[10px] font-mono text-primary tracking-[0.6em] uppercase">Cross_Protocol_Neural_Fabric</p>
          </div>
          <p className="text-neutral-500 font-display text-lg leading-relaxed max-w-2xl">
            Real-time visualization of ORION's distributed intelligence architecture. 
            Synthesizing edge compute nodes with global cloud fabrics.
          </p>
        </div>
      </div>

      {/* SYSTEM ARCHITECTURE NODES */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 relative">
        {/* Visual Connector Line */}
        <div className="absolute top-1/2 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent -z-10 hidden md:block" />
        
        <ArchitectureNode 
          icon={LucideCpu}
          title="LOCAL_CORE" 
          items={[
            { name: 'MQTT Broker', status: 'SYNCHRONIZED' },
            { name: 'Socket stream', status: 'ACTIVE' },
            { name: 'Hardware Bridge', status: 'STABLE' },
            { name: 'Voice Processor', status: 'READY' }
          ]} 
          description="Latency-critical local processing layer."
        />
        <ArchitectureNode 
          icon={LucideGlobe}
          title="CLOUD_FABRIC" 
          items={[
            { name: 'Google Home API', status: 'AUTHORIZED' },
            { name: 'Gemini LLM', status: 'STABLE' },
            { name: 'OAuth Tunnel', status: 'SECURE' },
            { name: 'Cloud Pub/Sub', status: 'ACTIVE' }
          ]} 
          description="High-availability global integration fabric."
        />
        <ArchitectureNode 
          icon={LucideSmartphone}
          title="EDGE_NODES" 
          items={[
            { name: 'Mobile Hub', status: 'STABLE' },
            { name: 'IoT Clusters', status: 'ONLINE' },
            { name: 'Remote Sensors', status: 'POLLING' },
            { name: 'Web Dashboard', status: 'CONNECTED' }
          ]} 
          description="Remote endpoints and distributed hardware."
        />
      </div>

      {/* INTEGRITY BANNER */}
      <OrionCard variant="premium" className="p-12 overflow-hidden border-none relative group">
        <div className="absolute -bottom-10 -right-10 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
          <LucideShieldCheck size={280} />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-12">
          <div className="w-24 h-24 bg-black text-primary rounded-[2rem] flex items-center justify-center shadow-[0_0_40px_rgba(0,0,0,0.5)] border border-primary/20 transition-transform group-hover:scale-105 duration-500">
             <LucideShieldCheck size={48} strokeWidth={1.5} />
          </div>
          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-4">
              <h3 className="text-4xl font-display font-black text-white uppercase italic tracking-tighter">System_Integrity_Locked</h3>
              <OrionStatusBadge status="operational" label="verified" />
            </div>
            <p className="text-neutral-400 text-sm font-display leading-relaxed max-w-xl">
               All neural pathways have been verified. End-to-end encryption is active for 100% of the transport layer. 
               Last global handshake successful at 02:45:12 UTC.
            </p>
            <div className="flex gap-4">
               <Badge variant="outline" className="text-[9px] font-mono border-white/10 text-neutral-500 uppercase py-1 px-4">ENCRYPTION: AES_256</Badge>
               <Badge variant="outline" className="text-[9px] font-mono border-white/10 text-neutral-500 uppercase py-1 px-4">REGION: US_EAST_1</Badge>
            </div>
          </div>
          <OrionButton variant="primary" size="lg" className="px-12 h-16 shrink-0 italic">
             Audit_Logs
          </OrionButton>
        </div>
      </OrionCard>
    </div>
  );
}

function ArchitectureNode({ icon: Icon, title, items, description }: any) {
  return (
    <OrionCard variant="default" className="flex flex-col h-full group p-0 overflow-hidden">
       <div className="p-8 space-y-6">
          <div className="flex justify-between items-start">
             <div className="w-14 h-14 bg-white/[0.03] rounded-2xl flex items-center justify-center text-neutral-600 group-hover:text-primary group-hover:bg-primary/5 border border-white/5 transition-all">
                <Icon size={28} strokeWidth={1.5} />
             </div>
             <OrionStatusBadge status="operational" label="linked" />
          </div>
          <div className="space-y-2">
            <h4 className="text-[10px] font-mono uppercase tracking-[0.4em] text-primary/60">{title}</h4>
            <p className="text-xs text-neutral-400 font-display font-medium leading-relaxed italic">{description}</p>
          </div>
       </div>
       
       <Separator className="bg-white/5" />
       
       <div className="p-8 space-y-5 flex-1 flex flex-col justify-end bg-white/[0.01]">
          {items.map((item: any, i: number) => (
            <div key={i} className="flex flex-col gap-2">
               <div className="flex items-center justify-between group/item">
                  <div className="flex items-center gap-3">
                    <LucideCheckCircle2 size={12} className="text-primary transition-transform group-hover/item:scale-125" />
                    <span className="text-[11px] font-display font-bold text-neutral-300 uppercase tracking-wider">{item.name}</span>
                  </div>
                  <span className="text-[9px] font-mono text-neutral-600">{item.status}</span>
               </div>
            </div>
          ))}
       </div>
    </OrionCard>
  );
}

