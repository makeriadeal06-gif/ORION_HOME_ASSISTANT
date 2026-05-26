import React, { useMemo } from 'react';
import { LucideMic, LucideHistory, LucideSettings2, LucideBrain, LucideZap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { OrionCard, OrionPanel, OrionButton, OrionStatusBadge } from '@client/components/OrionUI';
import { ScrollArea } from '@ui/scroll-area';
import { Separator } from '@ui/separator';
import { cn } from '@lib/utils';
import { useVoiceStore } from '@core/voice-runtime/state/useVoiceStore';
import { voiceRuntimeManager } from '@core/voice-runtime/VoiceRuntimeManager';
import { VoiceState } from '@core/voice-runtime/types';

export function VoiceView() {
  const { state, lastRecognizedText, lastSpokenText } = useVoiceStore();

  const isListening = state === VoiceState.LISTENING;
  const isProcessing = state === VoiceState.PROCESSING;
  const isSpeaking = state === VoiceState.SPEAKING;
  const isActive = isListening || isProcessing || isSpeaking;

  const transcript = useMemo(() => {
    switch (state) {
      case VoiceState.LISTENING:
        return lastRecognizedText || "Ouvindo...";
      case VoiceState.PROCESSING:
        return "Processando comando...";
      case VoiceState.SPEAKING:
        return lastSpokenText || "Respondendo...";
      case VoiceState.IDLE:
        return lastRecognizedText ? `Comando: "${lastRecognizedText}"` : "Aguardando comando...";
      default:
        return "Aguardando comando...";
    }
  }, [lastRecognizedText, lastSpokenText, state]);

  // unified neural pulse rings + waveform
  const pulseRings = useMemo(() => Array.from({ length: 10 }, (_, i) => ({ id: i, delay: i * 0.08, base: 120 + i * 48 })), []);

  const waveformBars = useMemo(() => Array.from({ length: 48 }, (_, i) => ({ id: i, listeningHeight: 22 + (i % 5) * 12, processingHeight: 12 + (i % 3) * 8, duration: 0.38 + (i % 6) * 0.06 })), []);

  const handleButtonClick = () => {
    if (isActive) {
      voiceRuntimeManager.interrupt();
    } else {
      voiceRuntimeManager.startListening();
    }
  };

  return (
    <div className="space-y-10 pb-20">
      {/* PRIMARY COGNITIVE VOICE CORE */}
      <OrionCard variant="premium" className="relative min-h-[500px] flex flex-col items-center justify-center p-12 overflow-hidden border-white/10">
        {/* NEURAL PULSE SYSTEM */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="absolute inset-0 flex items-center justify-center">
            {/* central ambient blob */}
            <div className={cn(
              "rounded-full blur-[140px] transition-all duration-700",
              isListening && "w-[640px] h-[640px] bg-primary/12",
              isProcessing && "w-[640px] h-[640px] bg-purple-500/10",
              isSpeaking && "w-[640px] h-[640px] bg-pink-500/10",
              state === VoiceState.IDLE && "w-[520px] h-[520px] bg-primary/6"
            )} />

            {/* staggered rings */}
            <div className="absolute inset-0 flex items-center justify-center">
              {pulseRings.map((ring) => (
                <motion.div
                  key={ring.id}
                  className="absolute rounded-full border"
                  style={{ width: `${ring.base}px`, height: `${ring.base}px` }}
                  animate={isActive ? { scale: [0.85, 1.05, 0.9], opacity: [0.03, 0.25, 0.03] } : { scale: 1, opacity: 0.03 }}
                  transition={{ repeat: Infinity, duration: 2.2 + ring.id * 0.25, delay: ring.delay, ease: 'easeInOut' }}
                />
              ))}
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        </div>

        <div className="relative z-10 flex flex-col items-center w-full max-w-4xl text-center space-y-12">
          {/* CORE ORB / MIC INDICATOR */}
          <div className="flex flex-col items-center gap-8">
            <motion.div 
              animate={{ 
                scale: isActive ? [1, 1.1, 1] : 1,
                boxShadow: isListening 
                  ? ["0 0 0px 0px rgba(6,182,212,0)", "0 0 40px 10px rgba(6,182,212,0.15)", "0 0 0px 0px rgba(6,182,212,0)"] 
                  : isProcessing
                    ? ["0 0 0px 0px rgba(168,85,247,0)", "0 0 40px 10px rgba(168,85,247,0.15)", "0 0 0px 0px rgba(168,85,247,0)"]
                    : isSpeaking
                      ? ["0 0 0px 0px rgba(236,72,153,0)", "0 0 40px 10px rgba(236,72,153,0.15)", "0 0 0px 0px rgba(236,72,153,0)"]
                      : "none"
              }}
              transition={{ repeat: Infinity, duration: 2 }}
              className={cn(
                "w-24 h-24 rounded-full flex items-center justify-center transition-all duration-700 border-2",
                isListening && "border-primary bg-primary/10 text-primary",
                isProcessing && "border-purple-500 bg-purple-500/10 text-purple-400",
                isSpeaking && "border-pink-500 bg-pink-500/10 text-pink-400",
                state === VoiceState.IDLE && "border-white/5 bg-white/5 text-neutral-600"
              )}
            >
              <LucideMic size={32} strokeWidth={1.5} />
            </motion.div>
            
             <div className="space-y-2 relative z-10">
               <h2 className="text-4xl font-display font-black text-white tracking-widest uppercase italic">AURA_COGNITION</h2>
               <OrionStatusBadge
                 status={isActive ? 'cognitive' : 'operational'}
                 label={isListening ? 'listening_active' : isProcessing ? 'processing_intent' : isSpeaking ? 'speaking_response' : 'system_ready'}
               />
             </div>
          </div>

          {/* DYNAMIC WAVEFORM VISUALIZER */}
          <div className="w-full h-32 flex items-center justify-center gap-1.5 px-10">
             {waveformBars.map((bar) => (
                 <motion.div 
                   key={bar.id}
                   initial={false}
                   animate={{ 
                     height: (isListening || isSpeaking) ? [8, bar.listeningHeight, 8] : isProcessing ? [8, bar.processingHeight, 8] : 4,
                     opacity: isActive ? [0.4, 1, 0.4] : 0.1
                   }}
                   transition={{ 
                     repeat: Infinity, 
                     duration: bar.duration,
                     ease: "easeInOut"
                   }}
                  className={cn(
                    "flex-1 rounded-full bg-primary/60 border border-primary/20",
                    isProcessing && "bg-purple-500/60 border-purple-500/20",
                    isSpeaking && "bg-pink-500/60 border-pink-500/20"
                  )}
                />
             ))}
          </div>

          {/* TRANSCRIPT PANEL */}
          <div className="w-full max-w-2xl bg-white/[0.02] backdrop-blur-md rounded-[2rem] p-8 border border-white/10 relative group">
             <div className="absolute -top-3 left-8 px-4 py-1 bg-[#0a0a0a] border border-white/10 rounded-full">
                <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">Neural_Stream</span>
             </div>
             <AnimatePresence mode="wait">
                <motion.p 
                  key={transcript}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-2xl font-display font-medium text-white tracking-tight italic"
                >
                  "{transcript}"
                </motion.p>
             </AnimatePresence>
          </div>

          {/* CONTROL ACTUATOR */}
          <OrionButton 
            variant={isActive ? "cognitive" : "primary"}
            size="lg"
            onClick={handleButtonClick}
            className="px-16 h-14"
          >
            {isActive ? "Terminate_Stream" : "Engage_Aura"}
          </OrionButton>
        </div>
      </OrionCard>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* INTERACTION LOGS */}
        <OrionPanel title="Interaction_Registry" className="md:col-span-12 lg:col-span-8">
          <ScrollArea className="h-[300px] pr-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                ...(lastRecognizedText ? [{ query: lastRecognizedText, resp: lastSpokenText || "Processando áudio / comando...", time: "Agora" }] : []),
                { query: "abrir spotify", resp: "Comando 'abrir spotify' executado com sucesso no dispositivo Open Spotify", time: "5m atrás" },
                { query: "Calibrate studio lighting", resp: "Adjusting hue and intensity...", time: "12m atrás" },
                { query: "Initiate backup sequence", resp: "Core replication started", time: "25m atrás" },
                { query: "Display energy telemetry", resp: "Fetching grid data...", time: "1h atrás" }
              ].map((h, i) => (
                <div key={i} className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-primary/20 transition-all group">
                  <div className="flex justify-between items-start mb-3">
                    <p className="text-sm font-display font-bold text-white italic truncate pr-4">"{h.query}"</p>
                    <span className="text-[9px] font-mono text-neutral-600 shrink-0">{h.time}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                     <LucideZap size={10} className="text-primary/40" />
                     <p className="text-[10px] text-primary/70 uppercase tracking-tight font-mono whitespace-normal leading-relaxed">{h.resp}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </OrionPanel>

        {/* NEURAL PARAMS */}
        <div className="md:col-span-12 lg:col-span-4 space-y-8">
          <OrionPanel title="Cognitive_Weights">
            <div className="space-y-8">
              <div className="space-y-3">
                <div className="flex justify-between text-[10px] font-mono text-neutral-500 uppercase">
                  <span>Confidence_Floor</span>
                  <span className="text-primary">0.96</span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <div className="w-[96%] h-full bg-primary" />
                </div>
              </div>
              
              <div className="grid grid-cols-1 gap-3">
                <ParamToggle label="Wake_Word_Active" active={true} />
                <ParamToggle label="Adaptive_Learning" active={true} />
                <ParamToggle label="Private_Neural_Stream" active={false} />
              </div>

              <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 flex items-center gap-4">
                <LucideBrain size={20} className="text-primary" />
                <div>
                   <h4 className="text-[10px] font-display font-bold text-white uppercase tracking-widest">Brain_v4.2_Loaded</h4>
                   <p className="text-[9px] font-mono text-neutral-600 uppercase">72ms Inference Latency</p>
                </div>
              </div>
            </div>
          </OrionPanel>
        </div>
      </div>
    </div>
  );
}

function ParamToggle({ label, active }: { label: string, active: boolean }) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5">
       <span className="text-[10px] font-mono font-medium text-neutral-500 uppercase tracking-widest">{label}</span>
       <div className={cn(
         "w-10 h-5 rounded-full flex items-center px-1 transition-all",
         active ? "bg-primary" : "bg-neutral-800"
       )}>
          <div className="w-3 h-3 bg-black rounded-full" />
       </div>
    </div>
  );
}
