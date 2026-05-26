import React, { useEffect, useState } from 'react';
import { useSystemStore } from '@core/state/stores/useSystemStore';
import { selectInfrastructure } from '@core/state/selectors/system.selectors';
import { 
  LucideMessageSquare, 
  LucideActivity, 
  LucideTerminal, 
  LucideSend, 
  LucideCpu, 
  LucideZap,
  LucideShieldCheck
} from 'lucide-react';
import { OrionCard, OrionPanel, OrionButton, OrionStatusBadge } from '@client/components/OrionUI';
import { Input } from '@ui/input';
import { ScrollArea } from '@ui/scroll-area';
import { Separator } from '@ui/separator';
import { cn } from '@lib/utils';
import { motion } from 'framer-motion';
import { mqttManager } from '@core/runtime/MqttManager';
import { socketRuntime } from '@core/socket/SocketRuntime';

export function MQTTView() {
  const { mqtt } = useSystemStore(selectInfrastructure);
  const { connected, broker } = mqtt;
  const [messages, setMessages] = useState<{ topic: string, payload: string, time: number }[]>([]);
  const [pubTopic, setPubTopic] = useState('');
  const [pubPayload, setPubPayload] = useState('');

  const handlePublish = () => {
    if (pubTopic && pubPayload) {
      mqttManager.publish(pubTopic, pubPayload);
      setPubPayload('');
    }
  };
  
  useEffect(() => {
    const unsubscribe = socketRuntime.on('mqtt:message', ({ topic, payload }: { topic: string; payload: string }) => {
      setMessages((current) => [{ topic, payload, time: Date.now() }, ...current].slice(0, 50));
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  return (
    <div className="space-y-12 pb-20">
      {/* HEADER SECTION */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-8 px-4 lg:px-0">
        <div className="space-y-3">
          <p className="text-[10px] font-mono uppercase tracking-[0.5em] text-neutral-600">Packet_Telemetry</p>
          <h1 className="text-3xl lg:text-5xl font-display font-black text-white italic tracking-tighter uppercase leading-tight">Neural_Link</h1>
        </div>
        
        <div className="flex items-center gap-6">
           <div className="text-left lg:text-right">
             <p className="text-[9px] font-mono text-neutral-600 uppercase tracking-widest leading-none mb-1">Status</p>
             <OrionStatusBadge 
               status={connected ? "operational" : "recovery"} 
               label={connected ? "sync_established" : "mesh_offline"} 
             />
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start px-2 lg:px-0">
        {/* SIDE CONTROL PANEL */}
        <div className="md:col-span-12 lg:col-span-4 space-y-8">
          <OrionCard variant="default" className="relative group overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
               <LucideCpu size={140} />
            </div>
            
            <div className="p-8 space-y-8">
              <div>
                <h3 className="text-xl font-display font-black text-white italic truncate tracking-tighter uppercase mb-2">{broker}</h3>
                <p className="text-[10px] font-mono text-primary/60 uppercase tracking-widest">Primary_Bridge_Controller</p>
              </div>

              <div className="grid grid-cols-2 gap-6 py-6 border-y border-white/5">
                 <div className="space-y-1">
                    <p className="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">Protocol</p>
                    <p className="text-[11px] font-display font-bold text-white uppercase italic">MQTT v5.0_vY</p>
                 </div>
                 <div className="space-y-1">
                    <p className="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">Latency</p>
                    <div className="flex items-center gap-2">
                      <LucideZap size={10} className="text-primary animate-pulse" />
                      <p className="text-[11px] font-display font-bold text-white uppercase italic">14ms</p>
                    </div>
                 </div>
              </div>

              <div className="flex items-center gap-4 p-4 bg-primary/5 rounded-2xl border border-primary/10">
                <LucideShieldCheck size={20} className="text-primary" />
                <span className="text-[9px] font-mono text-neutral-400 uppercase tracking-[0.2em]">End-to-End Encryption Active</span>
              </div>
            </div>
          </OrionCard>

          <OrionPanel title="Packet_Injection" className="font-display">
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-[9px] font-mono text-neutral-600 uppercase tracking-widest block ml-1">Routing_Topic</label>
                <Input 
                  placeholder="ORION/NODE/GATEWAY/CMD"
                  value={pubTopic}
                  onChange={(e) => setPubTopic(e.target.value)}
                  className="bg-white/[0.03] border-white/5 rounded-xl font-mono text-[10px] uppercase tracking-widest h-11 focus-visible:ring-primary/20 transition-all focus:bg-white/[0.05]"
                />
              </div>
              <div className="space-y-2 relative">
                <label className="text-[9px] font-mono text-neutral-600 uppercase tracking-widest block ml-1">Transmission_Payload</label>
                <div className="relative">
                  <Input 
                    placeholder='{"NEURAL_CMD": "SYNC_MESH"}'
                    value={pubPayload}
                    onChange={(e) => setPubPayload(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handlePublish()}
                    className="bg-white/[0.03] border-white/5 rounded-xl font-mono text-[10px] uppercase tracking-widest h-11 pr-14 focus-visible:ring-primary/20 transition-all focus:bg-white/[0.05]"
                  />
                  <OrionButton 
                    size="icon"
                    variant="primary"
                    onClick={handlePublish}
                    className="absolute right-1 top-1 h-9 w-9 rounded-lg"
                  >
                    <LucideSend size={16} />
                  </OrionButton>
                </div>
              </div>
            </div>
          </OrionPanel>
        </div>

        {/* STREAM MONITOR */}
        <OrionPanel 
          title="Telemetry_Burst_Stream" 
          className="md:col-span-12 lg:col-span-8 overflow-hidden flex flex-col min-h-[600px]"
        >
          <div className="flex-1 -mx-8 -my-6 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1 px-8 py-6 h-[500px]">
              {messages.length === 0 ? (
                <div className="h-[400px] flex flex-col items-center justify-center text-neutral-700 space-y-6">
                   <div className="relative">
                     <LucideActivity size={48} className="opacity-10 animate-cognitive-pulse" />
                     <div className="absolute inset-0 bg-primary/5 blur-3xl rounded-full" />
                   </div>
                   <p className="italic text-[10px] font-display uppercase tracking-[0.5em] text-neutral-600">Listening_For_Inbound_Packets...</p>
                </div>
              ) : (
                <div className="space-y-4 font-mono text-[10px]">
                  {messages.map((msg, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="group relative flex flex-col border-l border-white/5 pl-4 hover:border-primary/40 transition-colors"
                    >
                      <div className="flex items-center gap-4 mb-1">
                        <span className="text-neutral-600">[{new Date(msg.time).toLocaleTimeString([], { hour12: false })}]</span>
                        <span className="text-primary font-bold tracking-widest">/ {msg.topic.toUpperCase()}</span>
                      </div>
                      <div className="bg-white/[0.02] p-3 rounded-lg border border-transparent group-hover:border-white/5 group-hover:bg-white/[0.04] transition-all">
                        <span className="text-neutral-400 break-all leading-relaxed">{msg.payload}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </ScrollArea>
            
            <div className="bg-white/[0.02] border-t border-white/5 p-4 px-8 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-[9px] font-mono text-primary uppercase tracking-widest">Buffer_Active: 50_Frames</span>
              </div>
              <div className="flex items-center gap-6 text-[9px] font-mono text-neutral-600 uppercase tracking-[0.2em]">
                <span>Filter: LOGS_ALL</span>
                <span>Type: PROTO_V5</span>
              </div>
            </div>
          </div>
        </OrionPanel>
      </div>
    </div>
  );
}
 
