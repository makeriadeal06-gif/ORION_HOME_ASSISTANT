import React from 'react';
import { useSystemStore } from '@core/state/stores/useSystemStore';
import { selectInfrastructure } from '@core/state/selectors/system.selectors';
import { useAuthStore, AuthState } from '@core/state/stores/useAuthStore';
import { authManager } from '@core/auth/runtime/AuthManager';
import { useDeviceStore } from '@core/google-home/state/useDeviceStore';
import { useCommandStore } from '@core/command-runtime/state/useCommandStore';
import { CommandStatus, CommandType } from '@core/command-runtime/types';
import { CognitiveAwarenessPanel } from '@core/cognitive-runtime/feedback/CognitiveAwarenessPanel';
import { ProductionDiagnosticsPanel } from '@core/production/diagnostics/ProductionDiagnosticsPanel';
import { 
  LucideShieldCheck, 
  LucideShieldX, 
  LucideExternalLink, 
  LucideRefreshCw, 
  LucideUnlock, 
  LucideGlobe, 
  LucideLock,
  LucideLamp,
  LucideTv,
  LucideSmartphone,
  LucideSpeaker,
  LucideZap,
  LucideThermometer,
  LucideLayout,
  LucideBrain,
  LucideHistory,
  LucideActivity,
  LucideTerminal
} from 'lucide-react';
import { Badge } from '@ui/badge';
import { Separator } from '@ui/separator';
import { OrionCard, OrionPanel, OrionButton, OrionStatusBadge } from '@client/components/OrionUI';
import { cn } from '@lib/utils';
import RoomManager from '../components/RoomManager';

export function GoogleHomeView() {
  const infrastructure = useSystemStore(selectInfrastructure);
  const { state: authState } = useAuthStore();
  const linked = authState === AuthState.AUTHENTICATED;
  const isAuthenticating = authState === AuthState.AUTHENTICATING;
  const { lastSync } = infrastructure.googleHome;

  const { devices, ecosystem } = useDeviceStore();
  const { auditHistory } = useCommandStore();
  const deviceList = Object.values(devices);

  const handleLink = async () => {
    await authManager.login();
  };

  const handleUnlink = async () => {
    await authManager.logout();
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'LIGHT': return <LucideLamp size={18} />;
      case 'TV': return <LucideTv size={18} />;
      case 'SPEAKER': return <LucideSpeaker size={18} />;
      case 'OUTLET': return <LucideZap size={18} />;
      case 'SENSOR': return <LucideThermometer size={18} />;
      default: return <LucideSmartphone size={18} />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-20">
      <div className="space-y-3 px-4 lg:px-0">
        <p className="text-[10px] font-mono uppercase tracking-[0.5em] text-neutral-600">Cloud_Fabric_Bridge</p>
        <h1 className="text-3xl lg:text-5xl font-display font-black text-white italic tracking-tighter uppercase leading-tight">Integrator_Alpha</h1>
      </div>

      <div className="px-2 lg:px-0">
        <OrionCard variant="premium" className="relative p-6 lg:p-12 overflow-hidden border-white/10 group">
          <div className="absolute top-0 right-0 p-12 opacity-5 translate-x-12 -translate-y-12 pointer-events-none group-hover:opacity-10 transition-opacity hidden lg:block">
            <LucideGlobe size={320} />
          </div>

          <div className="relative z-10 space-y-8 lg:space-y-12">
            {/* STATUS ROW */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-8 lg:gap-12">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 lg:gap-8 text-center sm:text-left">
                <div className={cn(
                  "w-20 h-20 lg:w-24 lg:h-24 rounded-[1.5rem] lg:rounded-[2rem] flex items-center justify-center border-2 transition-all duration-700 shadow-2xl",
                  linked 
                    ? "bg-primary/5 border-primary/40 text-primary shadow-primary/20 animate-cognitive-pulse" 
                    : "bg-white/[0.02] border-white/10 text-neutral-600"
                )}>
                  {linked ? <LucideShieldCheck size={36} className="lg:w-11 lg:h-11" strokeWidth={1.5} /> : <LucideShieldX size={36} className="lg:w-11 lg:h-11" strokeWidth={1.5} />}
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl lg:text-4xl font-display font-black text-white italic tracking-tighter uppercase whitespace-normal">CLOUD_HANDSHAKE</h2>
                  <OrionStatusBadge 
                    status={linked ? "operational" : "recovery"} 
                    label={linked ? "session_active_secure" : "identity_detached"} 
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
                {!linked ? (
                  <OrionButton 
                    variant="primary"
                    size="lg"
                    onClick={handleLink}
                    disabled={isAuthenticating}
                    className="w-full sm:px-10 h-14 lg:h-16 italic"
                  >
                    <LucideExternalLink size={20} className="mr-3" />
                    INIT_HANDSHAKE
                  </OrionButton>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-3 w-full">
                    <OrionButton 
                      variant="secondary"
                      size="lg"
                      onClick={handleUnlink}
                      className="w-full border-red-500/20 text-red-500 hover:bg-red-500/10 h-14 lg:h-16 italic"
                    >
                      <LucideUnlock size={18} className="mr-3" />
                      REVOKE
                    </OrionButton>
                    <OrionButton 
                      variant="primary"
                      size="lg"
                      className="w-full h-14 lg:h-16 italic"
                    >
                      <LucideRefreshCw size={18} className="mr-3" />
                      SYNC
                    </OrionButton>
                  </div>
                )}
              </div>
            </div>

          {/* PARAMS GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <InfoTile 
                label="Primary Protocol" 
                value="Home Graph API" 
                sub="OAuth 2.0 / JWT Secure" 
             />
             <InfoTile 
                label="Last Manifest Push" 
                value={lastSync === 0 ? 'NOT_INITIALIZED' : new Date(lastSync).toLocaleTimeString()} 
                sub={lastSync === 0 ? 'Waiting for link...' : new Date(lastSync).toLocaleDateString()} 
             />
          </div>

          <Separator className="bg-white/5" />

          {/* SECURITY FOOTER */}
          <div className="bg-black/40 backdrop-blur-md border border-white/5 rounded-3xl p-8 space-y-6">
            <div className="flex items-center gap-4 text-primary">
               <LucideLock size={20} strokeWidth={1.5} />
               <h3 className="text-xs font-mono uppercase tracking-[0.4em]">Infrastructure_Hardening</h3>
            </div>
            <p className="text-neutral-500 leading-relaxed font-display text-sm italic pr-8">
              ORION employs stateless cryptographic handshake protocols with the Google Home Graph. 
              No private credentials or cleartext passwords persist within the local environment. 
              All data egress is tunneled through <span className="text-white">TLS_1.3</span> asymmetric encryption.
            </p>
            <div className="flex flex-wrap gap-3">
               <Badge variant="outline" className="text-[9px] font-mono border-white/10 text-neutral-600 uppercase py-1 px-4 tracking-widest">AES_256_GCM</Badge>
               <Badge variant="outline" className="text-[9px] font-mono border-white/10 text-neutral-600 uppercase py-1 px-4 tracking-widest">Audit_Logs_ON</Badge>
               <Badge variant="outline" className="text-[9px] font-mono border-white/10 text-neutral-600 uppercase py-1 px-4 tracking-widest">ISOLATION_v2</Badge>
            </div>
          </div>
        </div>
      </OrionCard>

      {/* PRODUCTION LAYER */}
      {linked && (
        <ProductionDiagnosticsPanel />
      )}

      {/* COGNITIVE LAYER */}
      {linked && (
        <CognitiveAwarenessPanel />
      )}

      {/* DEVICE REGISTRY VISUALIZATION */}
      {linked && deviceList.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between px-4 lg:px-0">
            <div className="flex items-center gap-3">
              <LucideLayout size={20} className="text-primary" />
              <h3 className="text-xs font-mono uppercase tracking-[0.4em] text-neutral-500">Device_Registry_Snapshot</h3>
            </div>
            <Badge variant="outline" className="text-[10px] font-mono border-primary/20 text-primary uppercase">
              {deviceList.length} Active_Nodes
            </Badge>
          </div>

          <div className="px-0 lg:px-0">
            <RoomManager />
          </div>
        </div>
      )}
      {/* COMMAND AUDIT LOG */}
      {linked && (
        <div className="space-y-6">
          <div className="flex items-center justify-between px-4 lg:px-0">
            <div className="flex items-center gap-3">
              <LucideHistory size={20} className="text-primary" />
              <h3 className="text-xs font-mono uppercase tracking-[0.4em] text-neutral-500">Command_Audit_Runtime</h3>
            </div>
          </div>

          <OrionPanel className="p-0 overflow-hidden border-white/5">
            <div className="bg-white/[0.03] border-b border-white/5 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LucideTerminal size={14} className="text-primary" />
                <span className="text-[10px] font-mono text-white uppercase tracking-widest">Execution_History</span>
              </div>
              <span className="text-[8px] font-mono text-neutral-600 uppercase">Secure_Pipeline_Active</span>
            </div>
            
            <div className="max-h-[300px] overflow-y-auto no-scrollbar">
              {auditHistory.length === 0 ? (
                <div className="p-10 flex flex-col items-center justify-center text-center opacity-30">
                  <LucideActivity size={32} className="mb-4 text-neutral-700" />
                  <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">No_Audit_Records_Detected</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {auditHistory.map(entry => (
                    <div key={entry.id} className="p-4 flex items-center justify-between hover:bg-white/[0.01] transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          entry.status === CommandStatus.SUCCESS ? "bg-green-500" : 
                          entry.status === CommandStatus.FAILED ? "bg-red-500" : "bg-primary animate-pulse"
                        )} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-white uppercase">{entry.action}</span>
                            <span className="text-[8px] font-mono text-neutral-600 uppercase">// {entry.deviceId}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                             <span className="text-[8px] font-mono text-neutral-500 uppercase">{entry.userEmail}</span>
                             <span className="text-[8px] font-mono text-neutral-700 uppercase">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className={cn(
                          "text-[8px] font-mono border-none h-4 uppercase",
                          entry.status === CommandStatus.SUCCESS ? "text-green-500" : 
                          entry.status === CommandStatus.FAILED ? "text-red-500" : "text-primary"
                        )}>
                          {entry.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </OrionPanel>
        </div>
      )}
    </div>
  </div>
  );
}

function InfoTile({ label, value, sub }: any) {
  return (
    <div className="p-8 rounded-[2rem] bg-white/[0.02] border border-white/5 flex flex-col gap-3 group hover:border-primary/20 transition-all">
       <span className="text-[10px] font-mono text-neutral-600 uppercase tracking-widest">{label}</span>
       <h4 className="text-2xl font-display font-black text-white italic tracking-tighter group-hover:text-primary transition-colors">{value}</h4>
       <span className="text-[10px] font-mono text-neutral-700 uppercase tracking-[0.3em] font-medium">{sub}</span>
    </div>
  );
}
