import React from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import { cn } from "@lib/utils";

/**
 * ORION DESIGN SYSTEM - CORE COMPONENTS
 * These are high-level components for the Orion platform reconstruction.
 */

// --- UTILS ---
const hoverGlow = "hover:shadow-[0_0_20px_rgba(6,182,212,0.15)] transition-shadow duration-300";

// --- OrionCard ---
export interface OrionCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'premium' | 'glass';
  isHoverable?: boolean;
}

export const OrionCard = React.forwardRef<HTMLDivElement, OrionCardProps>(
  ({ className, variant = 'default', isHoverable = true, children, ...props }, ref) => {
    const variants = {
      default: "bg-card border-border border",
      premium: "glass-premium",
      glass: "glass",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-xl overflow-hidden",
          variants[variant],
          isHoverable && "hover:border-primary/30 transition-colors duration-300",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
OrionCard.displayName = "OrionCard";

// --- OrionButton ---
export interface OrionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'cognitive';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const OrionButton = React.forwardRef<HTMLButtonElement, OrionButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const variants = {
      primary: "bg-primary text-black font-bold hover:bg-primary/90 shadow-[0_0_15px_rgba(6,182,212,0.3)]",
      secondary: "bg-white/5 text-white hover:bg-white/10 border border-white/10",
      ghost: "text-neutral-400 hover:text-white hover:bg-white/5",
      outline: "border border-primary/50 text-primary hover:bg-primary/10 font-medium",
      cognitive: "bg-state-cognitive/20 text-state-cognitive border border-state-cognitive/30 animate-cognitive-pulse",
    };

    const sizes = {
      sm: "h-8 px-3 text-xs",
      md: "h-10 px-5 text-sm",
      lg: "h-12 px-8 text-base",
      icon: "h-10 w-10 p-0 flex items-center justify-center",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg transition-all duration-300 active:scale-95 disabled:opacity-50 disabled:pointer-events-none uppercase tracking-widest font-display",
          variants[variant],
          variants[variant] !== 'ghost' && hoverGlow,
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);
OrionButton.displayName = "OrionButton";

// --- OrionPanel ---
export const OrionPanel = React.forwardRef<HTMLDivElement, { title?: string, children: React.ReactNode, className?: string, action?: React.ReactNode }>(
  ({ title, children, className, action }, ref) => {
    return (
      <OrionCard ref={ref} variant="default" className={cn("p-0 flex flex-col", className)}>
        {(title || action) && (
          <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
            <h3 className="font-display text-sm font-bold uppercase tracking-wider text-neutral-400">{title}</h3>
            {action}
          </div>
        )}
        <div className="p-5 flex-1">
          {children}
        </div>
      </OrionCard>
    );
  }
);
OrionPanel.displayName = "OrionPanel";

// --- OrionStatusBadge ---
export const OrionStatusBadge = ({ status, label }: { status: 'operational' | 'recovery' | 'critical' | 'cognitive', label?: string }) => {
  const statusColors = {
    operational: "bg-state-operational text-state-operational",
    recovery: "bg-state-recovery text-state-recovery",
    critical: "bg-state-critical text-state-critical",
    cognitive: "bg-state-cognitive text-state-cognitive",
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/5 rounded-full overflow-hidden">
      <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", statusColors[status])} />
      {label && <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">{label}</span>}
    </div>
  );
};

// --- OrionIndicator ---
export const OrionIndicator = ({ active, label }: { active: boolean, label?: string }) => {
  return (
    <div className="flex flex-col gap-1 items-center">
      <div className={cn(
        "w-full h-1 rounded-full transition-all duration-500",
        active ? "bg-primary shadow-[0_0_10px_rgba(6,182,212,0.5)]" : "bg-neutral-800"
      )} />
      {label && <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-neutral-600">{label}</span>}
    </div>
  );
};

// --- OrionVoiceWave ---
export const OrionVoiceWave = ({ active }: { active: boolean }) => {
  // Adaptive single-line waveform with smoother animation
  return (
    <div className="flex items-end gap-1 h-10 px-4">
      {[...Array(12)].map((_, i) => {
        const seed = (i % 5) + 1;
        return (
          <motion.div
            key={i}
            animate={{ height: active ? [seed * 3, seed * 9, seed * 3] : 4, opacity: active ? [0.4, 1, 0.4] : 0.15 }}
            transition={{ repeat: Infinity, duration: 0.9 + (i % 4) * 0.12, delay: i * 0.06, ease: 'easeInOut' }}
            className={cn("w-1 rounded-full", active ? "bg-primary" : "bg-neutral-800")}
          />
        );
      })}
    </div>
  );
};

// --- OrionWidget ---
export const OrionWidget = ({ title, value, unit, icon: Icon, trend }: { title: string, value: string | number, unit?: string, icon?: any, trend?: number }) => {
  return (
    <OrionCard variant="default" className="p-5 group">
      <div className="flex justify-between items-start mb-4">
        <div className="p-2 rounded-lg bg-white/5 text-neutral-500 group-hover:text-primary transition-colors">
          {Icon && <Icon size={18} />}
        </div>
        {trend !== undefined && (
          <span className={cn("text-[10px] font-mono", trend >= 0 ? "text-green-500" : "text-red-500")}>
            {trend >= 0 ? "+" : ""}{trend}%
          </span>
        )}
      </div>
      <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-1">{title}</p>
      <div className="flex items-baseline gap-1">
        <h4 className="text-2xl font-display font-black tracking-tighter">{value}</h4>
        {unit && <span className="text-xs font-mono text-neutral-600">{unit}</span>}
      </div>
    </OrionCard>
  );
};

// --- OrionRealtimeFeed ---
export const OrionRealtimeFeed = ({ items }: { items: string[] }) => {
  return (
    <div className="flex flex-col gap-2 font-mono text-[10px]">
      {items.map((item, i) => (
        <div key={i} className="flex gap-3 text-neutral-500 border-l border-white/5 pl-3 py-1">
          <span className="text-primary/40">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
          <span className="uppercase tracking-widest">{item}</span>
        </div>
      ))}
    </div>
  );
};

// --- OrionDeviceTile ---
export const OrionDeviceTile = ({ name, type, status, value, icon: Icon, onClick }: { name: string, type: string, status: string, value: string, icon: any, onClick?: () => void }) => {
  const isActive = ['ON', 'LOCKED', 'AUTO', 'OPEN'].includes(status.toUpperCase());
  
  return (
    <OrionCard 
      variant="default" 
      className={cn("group overflow-hidden cursor-pointer active:scale-[0.98] transition-all", onClick && "hover:border-primary/50")}
      onClick={onClick}
    >
      <div className="p-6">
        <div className="flex justify-between items-start mb-8">
          <div className={cn(
            "p-4 rounded-xl transition-all duration-500",
            isActive ? "bg-primary/20 text-primary border border-primary/20 shadow-[0_0_20px_rgba(6,182,212,0.1)]" : "bg-white/5 text-neutral-600"
          )}>
            <Icon size={24} strokeWidth={1.5} />
          </div>
          <OrionStatusBadge 
            status={isActive ? "operational" : "recovery"} 
            label={status} 
          />
        </div>
        
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-display font-bold text-white uppercase italic tracking-tighter group-hover:text-primary transition-colors">{name}</h3>
            <p className="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">{type}</p>
          </div>
          
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-display font-black text-white italic">{value}</span>
            <div className="flex gap-1">
              {[1, 2, 3].map(i => (
                <div key={i} className={cn("w-1 h-3 rounded-full", isActive ? "bg-primary/30" : "bg-neutral-800")} />
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {/* HUD DECORATIVE BAR */}
      <div className="h-1 bg-white/5 relative overflow-hidden">
        {isActive && (
          <motion.div 
            className="absolute inset-0 bg-primary/40"
            animate={{ x: ["-100%", "100%"] }}
            transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
          />
        )}
      </div>
    </OrionCard>
  );
};

// --- OrionAutomationNode ---
export const OrionAutomationNode = ({ title, trigger, action, active }: { title: string, trigger: string, action: string, active: boolean }) => {
  return (
    <div className="relative p-6 bg-white/[0.02] border border-white/5 rounded-2xl hover:border-primary/30 transition-all group">
      <div className="flex items-center gap-4 mb-4">
        <div className={cn(
          "w-3 h-3 rounded-full",
          active ? "bg-primary animate-pulse shadow-[0_0_10px_rgba(6,182,212,0.5)]" : "bg-neutral-800"
        )} />
        <h4 className="font-display font-bold text-white uppercase text-sm tracking-widest">{title}</h4>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <span className="text-[8px] font-mono text-neutral-600 uppercase tracking-widest">When</span>
          <p className="text-[10px] text-neutral-400 font-medium uppercase font-mono">{trigger}</p>
        </div>
        <div className="space-y-1 text-right">
          <span className="text-[8px] font-mono text-neutral-600 uppercase tracking-widest">Execute</span>
          <p className="text-[10px] text-primary font-medium uppercase font-mono">{action}</p>
        </div>
      </div>
      
      {/* CONNECTING LINES DECOR */}
      <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-3 h-px bg-white/10" />
      <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-3 h-px bg-white/10" />
    </div>
  );
};
