import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCognitiveStore } from '@core/cognitive-runtime/state/useCognitiveStore';
import { CognitiveState } from '@core/cognitive-runtime/types';
import { 
  LucideBrain, 
  LucideEye, 
  LucideSparkles, 
  LucideZap,
  LucideX,
  LucideCheck
} from 'lucide-react';
import { OrionPanel } from '@client/components/OrionUI';
import { Badge } from '@ui/badge';
import { Button } from '@ui/button';
import { cn } from '@lib/utils';
import { SecureCommandPipeline } from '@core/command-runtime/pipeline/SecureCommandPipeline';

export const CognitiveAwarenessPanel: React.FC = () => {
  const { state, context, suggestions, removeSuggestion } = useCognitiveStore();

  const handleApply = async (sug: any) => {
    await SecureCommandPipeline.execute(
      sug.action.type,
      sug.action.deviceId,
      sug.action.action || 'APPLY_SUGGESTION',
      sug.action.payload
    );
    removeSuggestion(sug.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-4 lg:px-0">
        <div className="flex items-center gap-3">
          <LucideBrain size={20} className={cn(
             "transition-colors",
             state === CognitiveState.THINKING ? "text-primary animate-pulse" : "text-neutral-500"
          )} />
          <h3 className="text-xs font-mono uppercase tracking-[0.4em] text-neutral-500">Cognitive_Awareness_Runtime</h3>
        </div>
        <Badge variant="outline" className="text-[8px] font-mono border-primary/20 text-primary uppercase">
          ST: {state}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* CONTEXT CARD */}
        <OrionPanel className="p-6 col-span-1 md:col-span-1 border-white/5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <LucideEye size={14} className="text-primary" />
            <span className="text-[10px] font-mono text-white uppercase tracking-widest">Global_Context</span>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[8px] font-mono text-neutral-600 uppercase">Load_Level</span>
              <span className="text-xs font-mono text-white">{context.loadLevel.toFixed(0)}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[8px] font-mono text-neutral-600 uppercase">Home_Status</span>
              <span className={cn("text-[10px] font-mono uppercase", context.isHomeOccupied ? "text-primary" : "text-neutral-700")}>
                {context.isHomeOccupied ? 'Occupied' : 'Vacant'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[8px] font-mono text-neutral-600 uppercase">Dominant_Room</span>
              <span className="text-[10px] font-display font-medium text-white uppercase text-right leading-none">
                {context.dominantRoom || 'NO_ACTIVITY'}
              </span>
            </div>
          </div>
        </OrionPanel>

        {/* SUGGESTIONS AREA */}
        <div className="col-span-1 md:col-span-2 space-y-4">
          <AnimatePresence mode="popLayout">
            {suggestions.length === 0 ? (
                <OrionPanel className="h-full flex items-center justify-center p-6 border-dashed border-white/5 opacity-30">
                  <div className="text-center">
                    <LucideSparkles size={24} className="mx-auto mb-2 text-neutral-700" />
                    <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-600">Collecting_Patterns...</p>
                  </div>
                </OrionPanel>
            ) : (
              suggestions.map(sug => (
                <motion.div
                  key={sug.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                >
                  <OrionPanel className="p-4 border-primary/20 bg-primary/[0.02]">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          <LucideZap size={18} className="text-primary" />
                        </div>
                        <div>
                          <p className="text-xs font-display font-bold text-white uppercase tracking-tight">{sug.title}</p>
                          <p className="text-[9px] font-mono text-neutral-500 uppercase mt-0.5">{sug.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8 text-neutral-600 hover:text-white"
                          onClick={() => removeSuggestion(sug.id)}
                        >
                          <LucideX size={14} />
                        </Button>
                        <Button 
                          size="sm" 
                          className="h-8 bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary text-[10px] font-mono"
                          onClick={() => handleApply(sug)}
                        >
                          <LucideCheck size={14} className="mr-2" />
                          CONFIRM
                        </Button>
                      </div>
                    </div>
                  </OrionPanel>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
