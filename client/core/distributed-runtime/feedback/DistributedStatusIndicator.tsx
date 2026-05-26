import React, { lazy, Suspense } from 'react';
import { useDistributedStore } from '@core/distributed-runtime/state/useDistributedStore';
import { NodeMode } from '@core/distributed-runtime/types';
import { 
  LucideMonitor, 
  LucideSmartphone, 
  LucideTablet, 
  LucideWifi, 
  LucideWifiOff,
  LucideLayers,
  LucideZap
} from 'lucide-react';
import { cn } from '@lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

import { SafeDistributedRuntimeGuard } from '../SafeDistributedRuntimeGuard';

import DistributedRuntimeErrorBoundary from './DistributedRuntimeErrorBoundary';

export const DistributedStatusIndicator: React.FC = () => {
  const { currentNode, connectivity, activeNodes } = useDistributedStore();
  const nodeCount = Object.keys(activeNodes || {}).length;

  if (!currentNode) return null;

  const getIcon = (type: string) => {
    switch (type) {
      case 'MOBILE': return <LucideSmartphone size={10} />;
      case 'TABLET': return <LucideTablet size={10} />;
      default: return <LucideMonitor size={10} />;
    }
  };

  return (
    <Suspense fallback={null}>
      <DistributedRuntimeErrorBoundary>
        <div className="flex items-center gap-1">
          {/* NODE INDICATOR */}
          <div className="flex items-center gap-2 bg-white/[0.03] border border-white/5 px-2 py-1 rounded-full">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              currentNode.isPrimary ? "bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--primary),0.5)]" : "bg-neutral-600"
            )} />
            <span className="text-[9px] font-mono text-neutral-400 uppercase tracking-tight">
              {currentNode.mode || 'SECONDARY'}
            </span>
          </div>

          {/* CONNECTIVITY */}
          <div className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-full transition-colors",
            connectivity?.online ? "bg-green-500/5 text-green-500/60" : "bg-red-500/5 text-red-500/60"
          )}>
            {connectivity?.online ? <LucideWifi size={10} /> : <LucideWifiOff size={10} />}
            <span className="text-[9px] font-mono uppercase tracking-tight">
              {connectivity?.online ? `${connectivity.latency ?? 0}ms` : 'offline'}
            </span>
          </div>

          {/* DISTRIBUTED NODES */}
          {nodeCount > 1 && (
            <div className="flex items-center gap-1 bg-primary/5 text-primary/60 px-2 py-1 rounded-full border border-primary/10">
              <LucideLayers size={10} />
              <span className="text-[9px] font-mono tracking-tight font-bold">{nodeCount}</span>
            </div>
          )}
        </div>
      </DistributedRuntimeErrorBoundary>
    </Suspense>
  );
};

export const NodeFleetOverlay: React.FC = () => {
  const { activeNodes, currentNode } = useDistributedStore();
  const nodes = Object.values(activeNodes || {}).filter(n => n && n.id);

  if (nodes.length <= 1) return null;

  return (
    <Suspense fallback={null}>
      <DistributedRuntimeErrorBoundary>
        <div className="fixed bottom-6 left-6 z-50 flex flex-col gap-2">
          <div className="flex items-center gap-2 mb-1 opacity-40">
            <LucideZap size={10} className="text-primary" />
            <span className="text-[8px] font-mono text-white uppercase tracking-widest">Active_Fleet_Runtime</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <AnimatePresence mode="popLayout">
              {nodes.map(node => (
                <motion.div
                  key={node.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={cn(
                    "flex items-center gap-3 bg-neutral-900/80 backdrop-blur-md border px-3 py-1.5 rounded-xl transition-all",
                    node.id === currentNode?.id ? "border-primary/20 bg-primary/[0.02]" : "border-white/5"
                  )}
                >
                  <div className={cn(
                    "w-6 h-6 rounded-lg flex items-center justify-center",
                    node.isPrimary ? "bg-primary/20 text-primary" : "bg-white/5 text-neutral-500"
                  )}>
                    {node.type === 'MOBILE' ? <LucideSmartphone size={12} /> : 
                      node.type === 'TABLET' ? <LucideTablet size={12} /> : <LucideMonitor size={12} />}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[8px] font-mono text-white uppercase tracking-tight">
                      {node.id === currentNode?.id ? 'THIS_INSTANCE' : SafeDistributedRuntimeGuard.safeSplit(node.id, '_', 1) || 'NODE'}
                    </span>
                    <span className="text-[7px] font-mono text-neutral-500 uppercase">
                      {node.mode || 'UNKNOWN'} // {node.lastSeen ? new Date(node.lastSeen).toLocaleTimeString([], { hour12: false }) : '00:00:00'}
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </DistributedRuntimeErrorBoundary>
    </Suspense>
  );
};
