import { logger } from '../../logger/Logger';
import { mqttManager } from '@core/runtime/MqttManager';
import { socketRuntime } from '@core/socket/SocketRuntime';
import { automationStoreService } from '@core/automation-runtime/AutomationStore';
import { voiceRuntimeManager } from '@core/voice-runtime/VoiceRuntimeManager';
import { stateSync } from '@core/state/synchronization/StateSync';

class DiagnosticReportRuntime {
  private static instance: DiagnosticReportRuntime;

  private constructor() {}

  public static getInstance(): DiagnosticReportRuntime {
    if (!DiagnosticReportRuntime.instance) {
      DiagnosticReportRuntime.instance = new DiagnosticReportRuntime();
    }
    return DiagnosticReportRuntime.instance;
  }

  public init() {
    logger.info('DIAGNOSTICS', 'Diagnostic report runtime initialized');
  }

  public async generateReport(): Promise<{ json: any; txt: string }> {
    const now = Date.now();
    const modules = {
      mqtt: {
        state: mqttManager.getState(),
      },
      socket: socketRuntime.getHealthMetrics(),
      automations: {
        count: automationStoreService.listAutomations().length,
      },
      voice: {
        state: voiceRuntimeManager.getState?.() || null,
      }
    };

    // Basic health analysis
    const degradedModules: string[] = [];
    if (modules.mqtt.state !== 'CONNECTED') degradedModules.push('MQTT');
    const socketHealthy = Boolean(socketRuntime.getHealthMetrics().connected);
    if (!socketHealthy) degradedModules.push('SOCKET');

    const reconnectLoops = this.estimateReconnectLoops();

    const report = {
      generatedAt: now,
      degradedModules,
      reconnectLoops,
      socketMetrics: socketRuntime.getHealthMetrics(),
      mqtt: {
        state: mqttManager.getState(),
      },
      telemetry: {
        uptimeMs: Date.now() - (stateSync as any).startTime || 0,
      },
      automations: {
        count: automationStoreService.listAutomations().length,
      },
      voice: modules.voice,
      runtimeHealth: {
        // area for future extension
      }
    };

    const txt = this.formatTxt(report);
    return { json: report, txt };
  }

  private estimateReconnectLoops() {
    try {
      const metrics = socketRuntime.getHealthMetrics();
      return { socketReconnects: metrics.reconnectCount || 0, mqttReconnects: 0 };
    } catch (e) {
      return { socketReconnects: 0, mqttReconnects: 0 };
    }
  }

  private formatTxt(report: any) {
    const lines: string[] = [];
    lines.push(`ORION DIAGNOSTIC REPORT — ${new Date(report.generatedAt).toISOString()}`);
    lines.push('');
    lines.push(`Degraded Modules: ${report.degradedModules.join(', ') || 'none'}`);
    lines.push(`Socket Reconnects: ${report.reconnectLoops.socketReconnects}`);
    lines.push('');
    lines.push('MQTT:');
    lines.push(JSON.stringify(report.mqtt, null, 2));
    lines.push('');
    lines.push('Socket:');
    lines.push(JSON.stringify(report.socketMetrics || socketRuntime.getHealthMetrics(), null, 2));
    lines.push('');
    lines.push('Automations:');
    lines.push(JSON.stringify({ count: report.automations.count }, null, 2));
    return lines.join('\n');
  }
}

export const diagnosticReportRuntime = DiagnosticReportRuntime.getInstance();
