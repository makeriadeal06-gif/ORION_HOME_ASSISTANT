import React, { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { useSystemStore } from '@core/state/stores/useSystemStore';
import { selectInfrastructure, selectModules, selectCpuPressure } from '@core/state/selectors/system.selectors';
import { 
  LucideWifi, 
  LucideZap, 
  LucideCpu, 
  LucideActivity, 
  LucideBrain, 
  LucideLayers,
  LucideShieldCheck
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { OrionCard, OrionPanel, OrionWidget, OrionStatusBadge, OrionButton } from '@client/components/OrionUI';
import { downloadLogsRuntime } from '@core/production/runtime/DownloadLogsRuntime';
import { diagnosticReportRuntime } from '@core/production/runtime/DiagnosticReportRuntime';
import { initializeSyncRuntime } from '@core/production/runtime/InitializeSyncRuntime';
import { Separator } from '@ui/separator';

const data = [
  { name: '18:00', value: 340 },
  { name: '18:05', value: 450 },
  { name: '18:10', value: 380 },
  { name: '18:15', value: 520 },
  { name: '18:20', value: 480 },
  { name: '18:25', value: 610 },
  { name: '18:30', value: 540 },
];

export function DashboardView() {
  const infrastructure = useSystemStore(selectInfrastructure);
  const modules = useSystemStore(selectModules);
  const cpuPressure = useSystemStore(selectCpuPressure);
  const registryModules = useSystemStore(state => state.registryModules);
  const [diagOpen, setDiagOpen] = React.useState(false);

  return (
    <div className="space-y-8 pb-20">
      {/* COGNITIVE HEADER SECTION */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 mb-8 lg:mb-12 px-2 lg:px-0">
        <div className="space-y-2">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-black tracking-tighter uppercase italic text-white flex items-center gap-3 lg:gap-4 leading-tight">
            <LucideBrain className="text-primary animate-cognitive-pulse shrink-0" size={32} />
            INTELLIGENCE_WORKSPACE
          </h1>
          <p className="text-neutral-500 font-mono text-[10px] sm:text-xs uppercase tracking-[0.2em] sm:tracking-[0.4em]">ORION_CORE_ORCHESTRATOR_ACTIVE</p>
        </div>
        <div className="flex gap-4 w-full sm:w-auto">
          <OrionButton
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-none"
            onClick={async () => {
              try {
                // default: collect all logs as zip
                const blob = await downloadLogsRuntime.download({ types: ['runtime','mqtt','voice','automation','errors'], format: 'zip' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'orion-logs.zip';
                a.click();
                URL.revokeObjectURL(url);
              } catch (e) {
                // best-effort: console
                // eslint-disable-next-line no-console
                console.error('Failed to download logs', e);
              }
            }}
          >
            Download_Logs
          </OrionButton>

          <OrionButton
            variant="secondary"
            size="sm"
            className="flex-1 sm:flex-none"
            onClick={async () => {
              try {
                const { json, txt } = await diagnosticReportRuntime.generateReport();
                // open small preview modal (simple) and allow download
                // store on blob and open preview in new tab for UX
                const blob = new Blob([txt], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
                // keep URL alive a bit before revoking to ensure viewer loads
                setTimeout(() => URL.revokeObjectURL(url), 3000);
              } catch (e) {
                // eslint-disable-next-line no-console
                console.error('Failed to generate diagnostic report', e);
              }
            }}
          >
            Diagnostic_Report
          </OrionButton>

          <OrionButton
            variant="primary"
            size="sm"
            className="flex-1 sm:flex-none"
            onClick={async () => {
              // Run initialize sync in the background; provide minimal UX feedback via console
              try {
                // show quick feedback in dev console; long-running job is fire-and-forget in runtime
                // eslint-disable-next-line no-console
                console.info('INITIALIZE_SYNC started');
                void initializeSyncRuntime.run();
              } catch (e) {
                // eslint-disable-next-line no-console
                console.error('INITIALIZE_SYNC failed', e);
              }
            }}
          >
            Initialize_Sync
          </OrionButton>
        </div>
      </div>

      {/* ECOSYSTEM TELEMETRY GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <OrionWidget 
          icon={LucideWifi} 
          title="MQTT_LINK" 
          value={infrastructure.mqtt.mqttMode === 'VIRTUAL' ? 'VIRTUAL_MODE' : infrastructure.mqtt.broker} 
          trend={infrastructure.mqtt.reconnectAttempts} 
        />
        <OrionWidget 
          icon={LucideZap} 
          title="SOCKET_IO" 
          value={infrastructure.socket.transport.toUpperCase()} 
          unit="TRNSP"
        />
        <OrionWidget 
          icon={LucideBrain} 
          title="NEURAL_STATE" 
          value={infrastructure.mqtt.circuitBreakerState === 'OPEN' ? 'ISOLATED' : (infrastructure.googleHome.linked ? 'SYNCED' : 'LOCAL')} 
        />
        <OrionWidget 
          icon={LucideActivity} 
          title="CPU_LOAD" 
          value={cpuPressure} 
          trend={-5}
        />
      </div>

      <div className="grid grid-cols-12 gap-8">
        {/* COGNITIVE EVENT FLOW (CHART) */}
        <OrionPanel 
          title="Cognitive_Event_Throughput" 
          className="col-span-12 lg:col-span-8"
          action={<OrionStatusBadge status="cognitive" label="processing" />}
        >
          <div className="h-[340px] w-full pt-6">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <RechartsTooltip 
                  contentStyle={{ 
                    backgroundColor: '#0a0a0a', 
                    border: '1px solid rgba(255,255,255,0.05)', 
                    borderRadius: '8px', 
                    fontSize: '10px', 
                    fontFamily: 'monospace' 
                  }}
                  itemStyle={{ color: '#06b6d4' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#06b6d4" 
                  fillOpacity={1} 
                  fill="url(#colorValue)" 
                  strokeWidth={3} 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </OrionPanel>

        {/* NODE STATUS MATRIX */}
        <div className="col-span-12 lg:col-span-4 space-y-8">
          <OrionPanel 
            title="Module_Registry_Runtime"
            action={<span className="text-[10px] font-mono text-primary">{registryModules.length}_ACTIVE</span>}
          >
            <div className="space-y-5">
              {registryModules.map((mod) => (
                <div key={mod.id} className="flex items-center justify-between group">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-display font-medium text-white uppercase tracking-wider mb-0.5">{mod.name}</span>
                    <span className="text-[8px] font-mono text-neutral-600 uppercase">v{mod.version}</span>
                  </div>
                  <div className="flex items-center gap-3">
                     <span className={`text-[8px] font-mono uppercase px-1.5 py-0.5 rounded ${
                       mod.state === 'ACTIVE' ? 'bg-primary/10 text-primary border border-primary/20' : 
                       mod.state === 'FAILED' ? 'bg-state-critical/10 text-state-critical border border-state-critical/20' :
                       'bg-white/5 text-neutral-500'
                     }`}>
                       {mod.state}
                     </span>
                  </div>
                </div>
              ))}
            </div>
            <Separator className="my-6 bg-white/5" />
            <div className="flex items-center justify-between text-[9px] font-mono uppercase text-neutral-600">
               <span>Registry_Integrity</span>
               <span className="text-primary">Secured</span>
            </div>
          </OrionPanel>

          <OrionCard variant="premium" className="p-8 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <LucideShieldCheck size={140} />
            </div>
            <div className="relative z-10 space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary/20 rounded-2xl flex items-center justify-center text-primary border border-primary/20">
                  <LucideShieldCheck size={24} />
                </div>
                <div>
                  <h4 className="text-lg font-display font-black text-white italic tracking-tighter uppercase">Security_Core</h4>
                  <p className="text-[10px] font-mono text-neutral-500 uppercase">Integrity_Monitor</p>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-neutral-400">
                ORION is currently monitoring 128 active nodes. Zero breaches detected in the last 72 hours.
              </p>
              <OrionButton variant="secondary" size="md" className="w-full">Audit_System</OrionButton>
            </div>
          </OrionCard>
        </div>
      </div>
    </div>
  );
}
