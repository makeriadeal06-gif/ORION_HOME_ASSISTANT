import React from 'react';
import { OrionCard, OrionPanel, OrionButton, OrionStatusBadge } from '@client/components/OrionUI';
import { useSystemStore } from '@core/state/stores/useSystemStore';
import { selectInfrastructure, selectEventQueueSize } from '@core/state/selectors/system.selectors';
import { logger } from '@core/logger/Logger';
import { diagnosticReportRuntime } from '@core/production/runtime/DiagnosticReportRuntime';
import { socketRuntime } from '@core/socket/SocketRuntime';
import { mqttManager } from '@core/runtime/MqttManager';
import { LucideWifi, LucideZap, LucideGlobe, LucideActivity, LucideRefreshCw } from 'lucide-react';

export default function OperationalPanel() {
  const infrastructure = useSystemStore(selectInfrastructure);
  const eventQueueSize = useSystemStore(selectEventQueueSize);

  const [socketMetrics, setSocketMetrics] = React.useState(() => socketRuntime.getHealthMetrics());
  const [mqttState, setMqttState] = React.useState(() => mqttManager.getState());
  const [reconnectCooldown, setReconnectCooldown] = React.useState(false);
  const [resetCooldown, setResetCooldown] = React.useState(false);
  const reconnectTimeoutRef = React.useRef<number | null>(null);
  const resetTimeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const t = setInterval(() => {
      setSocketMetrics(socketRuntime.getHealthMetrics());
      setMqttState(mqttManager.getState());
    }, 2500);
    return () => {
      clearInterval(t);
      if (reconnectTimeoutRef.current) window.clearTimeout(reconnectTimeoutRef.current);
      if (resetTimeoutRef.current) window.clearTimeout(resetTimeoutRef.current);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <OrionCard className="p-4">
          <div className="flex items-center gap-3">
            <LucideWifi size={20} className="text-primary" />
            <div>
              <div className="text-xs font-mono text-neutral-400">MQTT</div>
              <div className="text-lg font-display font-bold text-white">{infrastructure.mqtt.broker}</div>
              <div className="text-[11px] text-neutral-500">State: {mqttState}</div>
            </div>
          </div>
        </OrionCard>

        <OrionCard className="p-4">
          <div className="flex items-center gap-3">
            <LucideGlobe size={20} className="text-primary" />
            <div>
              <div className="text-xs font-mono text-neutral-400">Socket Transport</div>
              <div className="text-lg font-display font-bold text-white">{socketMetrics.transport}</div>
              <div className="text-[11px] text-neutral-500">Status: {socketMetrics.connected ? 'CONNECTED' : socketMetrics.status}</div>
            </div>
          </div>
        </OrionCard>

        <OrionCard className="p-4">
          <div className="flex items-center gap-3">
            <LucideActivity size={20} className="text-primary" />
            <div>
              <div className="text-xs font-mono text-neutral-400">Telemetry</div>
              <div className="text-lg font-display font-bold text-white">Events: {eventQueueSize}</div>
              <div className="text-[11px] text-neutral-500">Last socket reconnects: {socketMetrics.reconnectCount}</div>
            </div>
          </div>
        </OrionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <OrionPanel title="Transport Diagnostics" className="col-span-2">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-display font-bold text-white">Socket/Reconnection Health</div>
                <div className="text-[12px] text-neutral-500">Last connected: {socketMetrics.lastConnectedAt ? new Date(socketMetrics.lastConnectedAt).toLocaleString() : 'never'}</div>
              </div>
              <div className="flex items-center gap-2">
                <OrionButton size="sm" variant="outline" onClick={() => {
                  if (reconnectCooldown) return;
                  if (reconnectTimeoutRef.current) window.clearTimeout(reconnectTimeoutRef.current);
                  setReconnectCooldown(true);
                  socketRuntime.reconnect('manual_ui');
                  reconnectTimeoutRef.current = window.setTimeout(() => {
                    setReconnectCooldown(false);
                    reconnectTimeoutRef.current = null;
                  }, 3000);
                }} disabled={reconnectCooldown}>
                  Reconnect
                </OrionButton>
                <OrionButton size="sm" variant="secondary" onClick={() => {
                  if (resetCooldown) return;
                  if (resetTimeoutRef.current) window.clearTimeout(resetTimeoutRef.current);
                  setResetCooldown(true);
                  socketRuntime.resetStaleConnection('ui_reset');
                  resetTimeoutRef.current = window.setTimeout(() => {
                    setResetCooldown(false);
                    resetTimeoutRef.current = null;
                  }, 3000);
                }} disabled={resetCooldown}>
                  Reset
                </OrionButton>
              </div>
            </div>

            <div className="bg-black/40 p-3 rounded-md text-[12px] font-mono text-neutral-300 max-h-[140px] overflow-y-auto">
              <div className="text-neutral-500 italic mb-2">// Transport_Diagnostics_Buffer</div>
              <div className="text-neutral-500">Realtime telemetry and exhaustive logs are available in the <span className="text-primary cursor-pointer hover:underline" onClick={() => window.location.hash = '/observability'}>Runtime Observatory</span>.</div>
            </div>

            <div className="flex items-center gap-2">
              <OrionButton size="sm" variant="primary" onClick={() => window.location.hash = '/observability'}>Open Runtime Observatory</OrionButton>
            </div>
          </div>
        </OrionPanel>

        <OrionPanel title="Quick Diagnostics" className="p-4">
          <div className="space-y-3 text-[13px]">
            <div className="flex items-center justify-between">
              <span>MQTT State</span>
              <OrionStatusBadge status={mqttState === 'CONNECTED' ? 'operational' : 'recovery'} label={mqttState} />
            </div>
            <div className="flex items-center justify-between">
              <span>Socket Status</span>
              <OrionStatusBadge status={socketMetrics.connected ? 'operational' : 'recovery'} label={socketMetrics.status} />
            </div>
            <div className="flex items-center justify-between">
              <span>Transport</span>
              <span className="text-neutral-400">{socketMetrics.transport}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Reconnect Attempts</span>
              <span className="text-neutral-400">{socketMetrics.reconnectCount}</span>
            </div>
          </div>
        </OrionPanel>
      </div>
    </div>
  );
}
