import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Orbit, 
  ChevronRight, 
  ChevronLeft, 
  Menu, 
  Mic, 
  Radio 
} from 'lucide-react';
import { useSystemStore } from '@core/state/stores/useSystemStore';
import { selectInfrastructure } from '@core/state/selectors/system.selectors';
import { useAuthStore, AuthState } from '@core/state/stores/useAuthStore';
import { moduleRegistry } from '@core/modules/registry/ModuleRegistry';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@ui/tooltip';
import { Separator } from '@ui/separator';
import { OrionStatusBadge, OrionIndicator, OrionVoiceWave } from './components/OrionUI';
import { CommandFeedbackOverlay } from '@core/command-runtime/feedback/CommandFeedbackOverlay';
import { DistributedStatusIndicator, NodeFleetOverlay } from '@core/distributed-runtime/feedback/DistributedStatusIndicator';
import { cn } from '@lib/utils';
import { usePresenceStore } from '@core/presence/state/usePresenceStore';
import { useRuntimeStore } from '@core/state/stores/useRuntimeStore';
import { authTransitionCoordinator } from '@core/auth/runtime/AuthTransitionCoordinator';
import { useVoiceStore } from '@core/voice-runtime/state/useVoiceStore';

const voiceRuntimeManagerPromise = import('@core/voice-runtime/VoiceRuntimeManager');
const authManagerPromise = import('@core/auth/runtime/AuthManager');

export function OrionShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const infrastructure = useSystemStore(selectInfrastructure);
  const { user, state: authState } = useAuthStore();
  const isAuthenticating = authState === AuthState.AUTHENTICATING;
  const isRestoringSession = authState === AuthState.RESTORING_SESSION;
  const authTransitionState = useRuntimeStore((state) => state.authTransitionState);
  const transitionOwnerId = useRuntimeStore((state) => state.transitionOwnerId);
  const authTransitionStartedAt = useRuntimeStore((state) => state.authTransitionStartedAt);
  const hydrationBarrierActive = useRuntimeStore((state) => state.hydrationBarrierActive);
  const runtimeUiLocked = useRuntimeStore((state) => state.runtimeUiLocked);
  const authTransitionActive = authTransitionState === 'AUTH_SWITCHING' || authTransitionState === 'AUTH_RESTORING';
  const authUiFrozen = authTransitionActive || runtimeUiLocked;
  const runtimeLocked = !user || authState === AuthState.AUTH_ERROR || isRestoringSession || isAuthenticating || authTransitionActive;
  const runtimeAuthLabel = authTransitionActive
    ? (authTransitionState === 'AUTH_SWITCHING' ? 'RUNTIME_LOCKED' : 'AUTH_RESTORING')
    : user
    ? 'AUTHENTICATED'
    : authState === AuthState.AUTH_ERROR
      ? 'SESSION_EXPIRED'
      : authTransitionState === 'PREVIEW_MODE'
        ? 'PREVIEW_MODE'
        : (isAuthenticating || isRestoringSession ? 'RUNTIME_LOCKED' : 'PREVIEW_MODE');
  const runtimeAuthStatus: 'online' | 'recovery' | 'critical' = authTransitionActive
    ? 'recovery'
    : user
    ? 'online'
    : (isAuthenticating || isRestoringSession ? 'recovery' : 'critical');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const presenceState = usePresenceStore((state) => state.cognitiveState);
  const presenceMode = usePresenceStore((state) => state.mode);
  const presenceContext = usePresenceStore((state) => state.context);
  const environmentState = useRuntimeStore((state) => state.environmentState);
  const activeVoiceProfile = useVoiceStore((state) => state.activeProfile);
  const voiceAuthority = useVoiceStore((state) => state.authority);
  const fallbackExpired = Boolean(
    voiceAuthority.temporaryFallbackLease
    && voiceAuthority.fallbackLeaseStartedAt
    && voiceAuthority.fallbackLeaseTTL
    && Date.now() >= (voiceAuthority.fallbackLeaseStartedAt + voiceAuthority.fallbackLeaseTTL)
  );
  const voiceStatus: 'online' | 'recovery' | 'critical' = voiceAuthority.temporaryFallbackLease
    ? 'recovery'
    : voiceAuthority.providerRecoveryState === 'recovering_provider'
      ? 'recovery'
      : 'online';
  const voiceStatusLabel = fallbackExpired
    ? 'FALLBACK EXPIRED'
    : voiceAuthority.temporaryFallbackLease
    ? `TEMP FALLBACK ${voiceAuthority.fallbackLeaseReason || 'VOICE'}`
    : voiceAuthority.providerRecoveryState === 'recovering_provider'
      ? `RESTORING ${(voiceAuthority.restoringProvider || voiceAuthority.preferredVoiceProvider).toUpperCase()}`
      : voiceAuthority.providerRecoveredAt && Date.now() - voiceAuthority.providerRecoveredAt < 15000
        ? `RECOVERED ${(voiceAuthority.recoveredProvider || activeVoiceProfile.provider).toUpperCase()}`
        : `${activeVoiceProfile.provider.toUpperCase()} ${activeVoiceProfile.id.toUpperCase()}`;

  const activeModules = useMemo(() => moduleRegistry.getActiveModules(), []);
  const activeModule = useMemo(() => activeModules.find((m) => m.route === location.pathname) || activeModules[0], [activeModules, location.pathname]);

  const startPushToTalk = useCallback(() => {
    if (runtimeLocked) {
      return;
    }
    void voiceRuntimeManagerPromise.then(({ voiceRuntimeManager }) => voiceRuntimeManager.startListening());
  }, [runtimeLocked]);

  const stopPushToTalk = useCallback(() => {
    void voiceRuntimeManagerPromise.then(({ voiceRuntimeManager }) => voiceRuntimeManager.stopListening());
  }, []);

  const triggerLogin = useCallback(() => {
    void authManagerPromise.then(({ authManager }) => authManager.login());
  }, []);

  // Auto-close mobile menu on navigation
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!authTransitionActive || !authTransitionStartedAt) {
      return;
    }

    const timeout = window.setTimeout(() => {
      authTransitionCoordinator.releaseAuthTransition('visual_watchdog_timeout');
      authTransitionCoordinator.resetHydrationBarrier('visual_watchdog_timeout');
      authTransitionCoordinator.unlockRuntimeUI('visual_watchdog_timeout');
    }, 12000);

    return () => window.clearTimeout(timeout);
  }, [authTransitionActive, authTransitionStartedAt]);

  return (
    <TooltipProvider>
      <div className="flex h-screen w-full bg-[#050505] overflow-hidden font-sans text-neutral-400 selection:bg-primary/20">
        
        {/* SCANLINE / PERSISTENCE LAYER */}
        <div className="fixed inset-0 pointer-events-none z-[100] opacity-[0.02]">
           <div className="w-full h-full scanline" />
        </div>

        {/* SIDEBAR NAVIGATION - DYNAMIC & INTELLIGENT */}
        <motion.aside 
          initial={false}
          animate={{ width: isSidebarCollapsed ? 80 : 280 }}
          className={cn(
            "fixed inset-y-0 left-0 lg:relative z-50 bg-[#0a0a0a] border-r border-white/5 flex flex-col transition-all duration-300",
            !isMobileMenuOpen && "hidden lg:flex",
            isMobileMenuOpen && "flex"
          )}
        >
          {/* ORION LOGO & BRANDING */}
          <div className="h-24 flex items-center px-6 gap-4 overflow-hidden">
            <div className="min-w-[44px] h-[44px] bg-primary/10 flex items-center justify-center rounded-xl border border-primary/20 group relative">
              <div className="absolute inset-0 bg-primary/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <Orbit className="text-primary animate-cognitive-pulse" size={24} />
            </div>
            {!isSidebarCollapsed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col">
                <span className="text-xl font-display font-black tracking-tighter text-white">ORION</span>
                <span className="text-[9px] font-mono tracking-[0.3em] text-primary/60 uppercase">Cognitive_OS</span>
              </motion.div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar py-4 px-3 space-y-1">
            {activeModules.map((mod) => {
              const Icon = mod.icon;
              const isActive = location.pathname === mod.route;
              
              return (
                <button
                  key={mod.id}
                  onClick={() => navigate(mod.route)}
                  className={cn(
                    "w-full group flex items-center gap-3 p-3.5 rounded-xl transition-all duration-300 relative overflow-hidden",
                    isActive 
                      ? "bg-white/[0.03] text-white" 
                      : "hover:bg-white/[0.02] hover:text-neutral-200"
                  )}
                >
                  {isActive && (
                    <motion.div 
                      layoutId="sidebar-active"
                      className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent border-l border-primary" 
                    />
                  )}
                  
                  <div className={cn(
                    "min-w-[20px] z-10 transition-colors",
                    isActive ? "text-primary" : "text-neutral-500 group-hover:text-primary/60"
                  )}>
                    <Icon size={18} strokeWidth={1.5} />
                  </div>
                  
                  {!isSidebarCollapsed && (
                    <div className="flex flex-col items-start z-10 flex-1 min-w-0">
                      <span className="text-xs font-display font-bold tracking-wide uppercase">{mod.name}</span>
                      <span className="text-[9px] font-mono text-neutral-600 uppercase truncate">
                        {mod.state}
                      </span>
                    </div>
                  )}

                  {isActive && !isSidebarCollapsed && (
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse z-10" />
                  )}
                </button>
              );
            })}
          </div>

          {/* PRESENCE LAYER INDICATORS */}
          <div className="p-6 bg-white/[0.02] border-t border-white/5 space-y-4">
             {!isSidebarCollapsed && (
               <div className="space-y-3">
                 <p className="text-[9px] font-mono uppercase tracking-[0.3em] text-neutral-600">Cognitive_Health</p>
                  <div className="grid grid-cols-2 gap-2">
                    <OrionIndicator active={infrastructure.socket.connected} label="Sync" />
                    <OrionIndicator active={infrastructure.mqtt.connected} label="Mesh" />
                  </div>
                  <div className="text-[9px] font-mono uppercase tracking-[0.25em] text-neutral-600">Mode: <span className="text-primary">{presenceMode}</span></div>
                </div>
              )}
             <button 
               onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
               className="w-full h-10 flex items-center justify-center text-neutral-600 hover:text-white transition-all bg-white/5 rounded-lg border border-white/5"
             >
                {isSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
             </button>
          </div>
        </motion.aside>

        {/* MAIN WORKSPACE */}
        <div className="flex-1 flex flex-col relative h-full min-w-0 w-full">
          
          {/* SMARTER TOPBAR */}
          <header className="h-20 border-b border-white/5 flex items-center justify-between px-4 lg:px-10 z-30 bg-[#050505]/80 backdrop-blur-md">
            <div className="flex items-center gap-4 lg:gap-10">
              {/* Mobile Menu Toggle */}
              <button 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden p-2 text-neutral-400 hover:text-white"
              >
                <Menu size={24} />
              </button>

              <div className="flex flex-col">
                <span className="text-[9px] font-mono text-neutral-600 uppercase tracking-widest mb-1 hidden sm:block">active_context</span>
                <div className="flex items-center gap-2 lg:gap-3">
                   <h2 className="text-sm lg:text-lg font-display font-bold text-white uppercase tracking-tight truncate max-w-[150px] sm:max-w-none">{activeModule.name}</h2>
                   <div className="hidden sm:block">
                      <DistributedStatusIndicator />
                    </div>
                    {environmentState && (
                      <div className="hidden md:flex items-center gap-2">
                        <EnvironmentBadge label={runtimeAuthLabel} status={runtimeAuthStatus} />
                        <EnvironmentBadge label={environmentState.environment.toUpperCase()} status="online" />
                        <EnvironmentBadge label={voiceStatusLabel} status={voiceStatus} />
                        <EnvironmentBadge
                          label={environmentState.runtimeQuality.profile.toUpperCase()}
                          status={environmentState.modes.offline ? 'critical' : (environmentState.modes.degraded || environmentState.modes.recovery ? 'recovery' : 'online')}
                        />
                      </div>
                    )}
                 </div>
               </div>

              {/* COGNITIVE ACTIVITY MONITOR */}
              <div className="hidden xl:flex items-center gap-4 py-2 px-4 bg-white/5 rounded-xl border border-white/5 backdrop-blur-sm">
                <button
                   onMouseDown={startPushToTalk}
                   onMouseUp={stopPushToTalk}
                   onMouseLeave={stopPushToTalk}
                   onTouchStart={startPushToTalk}
                   onTouchEnd={stopPushToTalk}
                  disabled={runtimeLocked}
                  className="p-2 bg-primary/10 text-primary rounded-full hover:bg-primary/20 active:bg-primary/30 transition-colors shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                  title={runtimeLocked ? 'Execution unavailable in preview mode' : 'Push to Talk'}
                >
                  <Mic size={18} />
                </button>
                <Separator orientation="vertical" className="h-6 bg-white/10" />
                <div className="flex flex-col">
                  <span className="text-[8px] font-mono text-neutral-500 uppercase">Cognitive_State</span>
                  <span className={cn(
                     "text-[10px] font-black uppercase tracking-wider",
                     ['processing', 'understanding', 'executing', 'speaking'].includes(presenceState) ? "text-primary animate-pulse" : "text-neutral-400"
                   )}>{presenceState}</span>
                 </div>
                 <Separator orientation="vertical" className="h-6 bg-white/10" />
                 <OrionVoiceWave active={['processing', 'understanding', 'speaking'].includes(presenceState)} />
               </div>
            </div>

            <div className="flex items-center gap-8">
              {/* INFRA HUD */}
              <div className="hidden lg:flex gap-10">
                <HUDStat 
                  label="TELEMETRY" 
                  value={infrastructure.socket.connected ? 'LINKED' : 'DROPPED'} 
                  status={infrastructure.socket.connected ? 'online' : 'critical'} 
                />
                <HUDStat 
                  label="NEURAL_NET" 
                  value={runtimeAuthLabel} 
                  status={runtimeAuthStatus} 
                />
                {environmentState && (
                  <HUDStat
                    label="ENVIRONMENT"
                    value={environmentState.activeMode.toUpperCase()}
                    status={environmentState.modes.offline ? 'critical' : (environmentState.modes.degraded || environmentState.modes.recovery ? 'recovery' : 'online')}
                  />
                )}
                <HUDStat
                  label="VOICE"
                  value={voiceAuthority.temporaryFallbackLease ? 'TEMP_BROWSER' : activeVoiceProfile.provider.toUpperCase()}
                  status={voiceStatus}
                />
              </div>

              <div className="flex items-center gap-2 pl-6 border-l border-white/5">
                {user ? (
                  <div className="flex items-center gap-3">
                    {!isSidebarCollapsed && (
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-display font-bold text-white uppercase tracking-tight">{user.displayName || 'ORION_USER'}</span>
                        <span className="text-[8px] font-mono text-primary uppercase">SYNCED</span>
                      </div>
                    )}
                    <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center text-primary font-mono text-xs overflow-hidden">
                      {user.photoURL ? (
                        <img src={user.photoURL} alt="avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        (user.displayName?.[0] || user.email?.[0] || 'O').toUpperCase()
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    {!isSidebarCollapsed && (
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-display font-bold text-white uppercase tracking-tight">Preview Runtime</span>
                        <span className="text-[8px] font-mono text-state-critical uppercase">Execution Unavailable</span>
                      </div>
                    )}
                    <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-neutral-600 font-mono text-xs">
                      ?
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* PERSISTENT WORKSPACE */}
          <main className="flex-1 overflow-y-auto no-scrollbar relative p-4 lg:p-10">
            <div className="max-w-7xl mx-auto w-full">
              {authUiFrozen && (
                <div className="mb-6 rounded-2xl border border-state-recovery/20 bg-state-recovery/5 px-4 py-3 text-[10px] font-mono uppercase tracking-[0.25em] text-state-recovery">
                  {authTransitionState === 'AUTH_SWITCHING'
                    ? `AUTH_SWITCHING ${transitionOwnerId || 'preview'}`
                    : `AUTH_RESTORING ${transitionOwnerId || 'preview'}`}
                  {hydrationBarrierActive ? ' HYDRATION_BARRIER' : ' RENDER_OPEN'}
                </div>
              )}
              {!user && !authTransitionActive && (
                <AuthAccessPanel authState={authState} onLogin={triggerLogin} />
              )}
              <AnimatePresence mode="wait">
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                >
                  {children}
                </motion.div>
              </AnimatePresence>
            </div>
          </main>

          {/* REALTIME FEED / STATUS FOOTER */}
          <footer className="h-auto py-2 border-t border-white/5 flex flex-col sm:flex-row items-center px-4 lg:px-10 justify-between gap-4 z-30 bg-[#050505]">
             <div className="flex items-center gap-6 overflow-hidden w-full sm:w-auto text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
                <span className="flex items-center gap-2 whitespace-nowrap">
                   <span className="w-1 h-1 bg-primary rounded-full animate-pulse" />
                   ORION_OS v2.0.0_BETA
                </span>
                <span className="bg-white/10 w-px h-3 hidden sm:block" />
                <div className="flex gap-4 items-center">
                  <span className="text-primary/60">SYS_INTEL: PASSIVE</span>
                  <span className="text-neutral-700">|</span>
                  <span className="text-neutral-600 truncate">{presenceContext.runtimeState.recovering ? 'RECOVERING_SESSION_CONTEXT' : `${presenceContext.currentView.toUpperCase()}_${presenceContext.connectivity.toUpperCase()}_${presenceMode.toUpperCase()}_${presenceContext.environment.operationalMode.toUpperCase()}`}</span>
                </div>
             </div>
              <div className="flex items-center gap-3 text-neutral-600 text-[10px] font-mono uppercase tracking-[0.2em]">
                  <Radio size={12} className={infrastructure.socket.connected ? 'text-primary' : ''} />
                  {environmentState ? `${environmentState.deviceSession.activeDeviceId.toUpperCase()}_${environmentState.runtimeQuality.profile.toUpperCase()}` : (presenceContext.runtimeState.longRunningTaskActive ? 'TASK_ACTIVE' : 'REALTIME_SYNC_ACTIVE')}
               </div>
            </footer>
        </div>

        {/* MOBILE OVERLAY */}
        {isMobileMenuOpen && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* AUTH OVERLAY - RECONSTRUCTED */}
        {(isAuthenticating || authUiFrozen) && (
          <div className="fixed top-6 right-6 z-[200] w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl border border-state-recovery/20 bg-[#050505]/90 p-5 backdrop-blur-2xl pointer-events-none">
             <div className="w-full h-1 flex bg-white/5 rounded-full overflow-hidden mb-6">
                <motion.div 
                  className="h-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                />
             </div>
             <motion.div
               animate={{ opacity: [0.4, 1, 0.4] }}
               transition={{ repeat: Infinity, duration: 2 }}
               className="flex flex-col"
              >
                <h3 className="text-lg font-display font-black tracking-[0.2em] text-white uppercase mb-2">
                  {authTransitionState === 'AUTH_SWITCHING' ? 'Switching_Identity' : 'Syncing_Identity'}
                </h3>
                <p className="text-[10px] font-mono text-primary tracking-widest mb-2">
                  {authTransitionState === 'AUTH_SWITCHING' ? 'RUNTIME_TRANSITION_SERIALIZED' : 'PROTOCOL_ORION_HANDSHAKE'}
                </p>
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-neutral-500">
                  {hydrationBarrierActive ? 'EXECUTION_LAYER_FROZEN' : 'VISUAL_SHELL_ACTIVE'}
                </p>
               </motion.div>
           </div>
        )}
        <CommandFeedbackOverlay />
        <NodeFleetOverlay />
      </div>
    </TooltipProvider>
  );
}

function AuthAccessPanel({ authState, onLogin }: { authState: AuthState; onLogin: () => void }) {
  const isError = authState === AuthState.AUTH_ERROR;

  return (
    <div className="mb-6 rounded-3xl border border-white/10 bg-white/[0.02] p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-primary/70">Auth UI</p>
          <h3 className="text-2xl font-display font-black uppercase tracking-tight text-white">Login Ready</h3>
          <p className="text-sm text-neutral-400">
            {isError ? 'A ultima autenticacao falhou. A shell continua ativa e voce pode tentar novamente.' : 'O shell continua renderizando em preview mode ate a autenticacao concluir.'}
          </p>
        </div>
        <button
          onClick={onLogin}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 px-5 text-xs font-mono uppercase tracking-[0.25em] text-primary transition-colors hover:bg-primary/20"
        >
          Sign_In_Google
        </button>
      </div>
    </div>
  );
}

function HUDStat({ label, value, status }: { label: string, value: string, status: 'online' | 'recovery' | 'critical' }) {
  const statusColors = {
    online: 'text-primary bg-primary/5 border-primary/20',
    recovery: 'text-state-recovery bg-state-recovery/5 border-state-recovery/20',
    critical: 'text-state-critical bg-state-critical/5 border-state-critical/20'
  };

  const bulletColors = {
    online: 'bg-primary',
    recovery: 'bg-state-recovery',
    critical: 'bg-state-critical'
  };

  return (
    <div className="flex items-center gap-3 group">
      <div className="flex flex-col items-end">
        <span className="text-[8px] font-mono tracking-widest text-neutral-600 uppercase mb-0.5 group-hover:text-neutral-400 transition-colors">{label}</span>
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-[10px] font-black tracking-tight transition-colors",
            status === 'online' ? "text-white" : status === 'recovery' ? "text-state-recovery" : "text-state-critical"
          )}>
            {value}
          </span>
          <div className={cn("w-1 h-1 rounded-full animate-pulse", bulletColors[status])} />
        </div>
      </div>
    </div>
  );
}

function EnvironmentBadge({ label, status }: { label: string; status: 'online' | 'recovery' | 'critical' }) {
  return (
    <span className={cn(
      'px-2 py-1 rounded-full border text-[8px] font-mono tracking-[0.2em]',
      status === 'online'
        ? 'text-primary bg-primary/5 border-primary/20'
        : status === 'recovery'
          ? 'text-state-recovery bg-state-recovery/5 border-state-recovery/20'
          : 'text-state-critical bg-state-critical/5 border-state-critical/20'
    )}>
      {label}
    </span>
  );
}
