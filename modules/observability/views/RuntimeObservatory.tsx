import React from 'react';
import { OrionCard, OrionPanel, OrionButton } from '@client/components/OrionUI';
import { logger } from '@core/logger/Logger';
import { diagnosticReportRuntime } from '@core/production/runtime/DiagnosticReportRuntime';
import { useSystemStore } from '@core/state/stores/useSystemStore';
import { selectInfrastructure, selectCpuPressure } from '@core/state/selectors/system.selectors';
import { LucideActivity, LucideFileText, LucideSearch } from 'lucide-react';

export function RuntimeObservatory() {
  const [logs, setLogs] = React.useState<any[]>([]);
  const [filter, setFilter] = React.useState<string>('');
  const [reportTxt, setReportTxt] = React.useState<string>('');
  const [severity, setSeverity] = React.useState<'all' | 'warnings' | 'errors' | 'degraded'>('all');

  const infrastructure = useSystemStore(selectInfrastructure);
  const cpuPressure = useSystemStore(selectCpuPressure);

  const refreshLogs = React.useCallback(() => {
    const items = logger.getBufferedLogs?.({ limit: 2000 }) || [];
    setLogs(items.reverse());
  }, []);

  React.useEffect(() => {
    refreshLogs();
    const interval = setInterval(() => {
      refreshLogs();
    }, 5000);
    return () => clearInterval(interval);
  }, [refreshLogs]);

  const refreshReport = async () => {
    const r = await diagnosticReportRuntime.generateReport();
    setReportTxt(r.txt);
  };

  const downloadLogs = () => {
    const blob = new Blob([logs.map(l => `[${new Date(l.timestamp).toISOString()}] ${l.category} ${l.message} ${l.data?JSON.stringify(l.data):''}`).join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'orion_runtime_logs.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredByText = filter ? logs.filter(l => (l.category + l.message + JSON.stringify(l.data || '')).toLowerCase().includes(filter.toLowerCase())) : logs;
  const filtered = filteredByText.filter(l => {
    if (severity === 'all') return true;
    if (severity === 'warnings') return l.level === 2 || /warn/i.test(String(l.message));
    if (severity === 'errors') return l.level === 4 || /error/i.test(String(l.message));
    if (severity === 'degraded') return /degrad|degraded|critical|fail/i.test(String(l.message)) || (typeof l.level === 'number' && l.level >= 3);
    return true;
  });

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <LucideActivity size={36} className="text-primary" />
          <div>
            <h2 className="text-3xl font-display font-black text-white">Runtime Observatory</h2>
            <p className="text-sm text-neutral-400">Read-only view of in-memory logs, telemetry and diagnostic summaries.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <OrionButton variant="outline" onClick={refreshReport}><LucideFileText size={14} /> Generate Report</OrionButton>
          <OrionButton variant="primary" onClick={downloadLogs}>Download Logs</OrionButton>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <OrionCard className="col-span-2 p-4 h-[600px] overflow-y-auto">
          <div className="flex items-center gap-3 mb-4">
            <LucideSearch />
            <input placeholder="filter logs..." value={filter} onChange={e => setFilter(e.target.value)} className="bg-transparent outline-none w-full" />
            <div className="flex items-center gap-2">
              <button className={`p-2 text-sm ${severity === 'all' ? 'text-primary' : 'text-neutral-400'}`} onClick={() => setSeverity('all')}>All</button>
              <button className={`p-2 text-sm ${severity === 'warnings' ? 'text-primary' : 'text-neutral-400'}`} onClick={() => setSeverity('warnings')}>Warnings</button>
              <button className={`p-2 text-sm ${severity === 'errors' ? 'text-primary' : 'text-neutral-400'}`} onClick={() => setSeverity('errors')}>Errors</button>
              <button className={`p-2 text-sm ${severity === 'degraded' ? 'text-primary' : 'text-neutral-400'}`} onClick={() => setSeverity('degraded')}>Degraded</button>
            </div>
          </div>
          <div className="space-y-2 text-[12px] font-mono text-neutral-300">
            {filtered.map((l, i) => (
              <div key={i} className="p-2 rounded-md bg-white/[0.02]">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] text-neutral-500">{new Date(l.timestamp).toISOString()} • {l.category}</div>
                  <div className="text-[11px] font-mono text-neutral-400">lvl:{l.level ?? 'n/a'}</div>
                </div>
                <div className="mt-1">{l.message} {l.data ? <span className="text-[11px] text-neutral-400">{JSON.stringify(l.data)}</span> : null}</div>
              </div>
            ))}
          </div>
        </OrionCard>

        <div className="space-y-4">
          <OrionCard className="p-4">
            <h3 className="font-display font-bold text-lg">Telemetry Snapshot</h3>
            <div className="text-sm text-neutral-400 mt-2">
              <div>MQTT Broker: {infrastructure.mqtt?.broker ?? 'unknown'}</div>
              <div>MQTT State: {infrastructure.mqtt?.mqttRecoveryState ?? infrastructure.mqtt?.connected ? 'CONNECTED' : 'DISCONNECTED'}</div>
              <div>CPU: {cpuPressure ?? 'n/a'}</div>
              <div>Event Queue: {useSystemStore.getState().eventQueueSize}</div>
            </div>
          </OrionCard>

          <OrionCard className="p-4 h-[300px] overflow-y-auto">
            <h3 className="font-display font-bold text-lg">Diagnostic Report</h3>
            <pre className="text-[12px] text-neutral-300 mt-3 whitespace-pre-wrap">{reportTxt || 'No report generated yet.'}</pre>
          </OrionCard>
        </div>
      </div>
    </div>
  );
}

export default RuntimeObservatory;
