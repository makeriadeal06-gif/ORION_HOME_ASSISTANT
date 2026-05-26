import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCommandStore } from '@core/command-runtime/state/useCommandStore';
import { CommandStatus } from '@core/command-runtime/types';
import { 
  LucideActivity, 
  LucideCheckCircle2, 
  LucideAlertCircle, 
  LucideLoader2,
  LucideTerminal
} from 'lucide-react';
import { cn } from '@lib/utils';

export const CommandFeedbackOverlay: React.FC = () => {
  const { activeCommands, lastResponse } = useCommandStore();
  const activeIds = Object.keys(activeCommands).filter(id => 
    [CommandStatus.EXECUTING, CommandStatus.QUEUED, CommandStatus.VALIDATING].includes(activeCommands[id])
  );

  if (activeIds.length === 0 && !lastResponse) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 items-end pointer-events-none">
      <AnimatePresence mode="popLayout">
        {activeIds.map(id => (
          <motion.div
            key={id}
            initial={{ opacity: 0, x: 20, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex items-center gap-3 bg-neutral-900/90 backdrop-blur-xl border border-primary/20 p-3 pr-4 rounded-2xl shadow-2xl"
          >
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <LucideLoader2 size={16} className="text-primary animate-spin" />
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] font-mono text-primary uppercase tracking-widest">command_executing</p>
              <p className="text-[8px] font-mono text-neutral-400 uppercase">{id}</p>
            </div>
          </motion.div>
        ))}

        {lastResponse && (
          <motion.div
            key={lastResponse.commandId}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              "flex items-center gap-3 backdrop-blur-xl border p-3 pr-4 rounded-2xl shadow-2xl",
              lastResponse.status === CommandStatus.SUCCESS 
                ? "bg-green-950/20 border-green-500/20" 
                : "bg-red-950/20 border-red-500/20"
            )}
          >
             <div className={cn(
               "w-8 h-8 rounded-lg flex items-center justify-center",
               lastResponse.status === CommandStatus.SUCCESS ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
             )}>
              {lastResponse.status === CommandStatus.SUCCESS ? <LucideCheckCircle2 size={16} /> : <LucideAlertCircle size={16} />}
            </div>
            <div className="space-y-0.5">
              <p className={cn(
                "text-[10px] font-mono uppercase tracking-widest",
                lastResponse.status === CommandStatus.SUCCESS ? "text-green-500" : "text-red-500"
              )}>
                {lastResponse.status === CommandStatus.SUCCESS ? 'execution_success' : 'execution_failed'}
              </p>
              <p className="text-[8px] font-mono text-neutral-400 uppercase">{lastResponse.message || 'System Response Acknowledged'}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
