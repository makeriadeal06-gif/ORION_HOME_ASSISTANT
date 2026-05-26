import { logger } from '../../logger/Logger';
import { socketRuntime } from '@core/socket/SocketRuntime';
import { mqttManager } from '@core/runtime/MqttManager';
import { automationStoreService } from '@core/automation-runtime/AutomationStore';
import { voiceRuntimeManager } from '@core/voice-runtime/VoiceRuntimeManager';

type LogType = 'runtime' | 'mqtt' | 'voice' | 'automation' | 'errors';

class DownloadLogsRuntime {
  private static instance: DownloadLogsRuntime;

  private constructor() {}

  public static getInstance(): DownloadLogsRuntime {
    if (!DownloadLogsRuntime.instance) {
      DownloadLogsRuntime.instance = new DownloadLogsRuntime();
    }
    return DownloadLogsRuntime.instance;
  }

  public init() {
    logger.info('DOWNLOAD_LOGS', 'Download logs runtime ready');
  }

  // Returns a Promise that resolves to a Blob with the requested logs
  public async download(opts: { types: LogType[]; format: 'log' | 'json' | 'zip'; filename?: string }): Promise<Blob> {
    const parts: { name: string; content: string }[] = [];

    for (const t of opts.types) {
      try {
        const content = await this.gatherLog(t);
        parts.push({ name: `${t}.${opts.format === 'json' ? 'json' : 'log'}`, content });
      } catch (e: any) {
        parts.push({ name: `${t}.log`, content: `Failed to collect ${t} logs: ${e?.message || String(e)}` });
      }
    }

    // For zip format we will use a simple multipart blob with separators to avoid new deps
    if (opts.format === 'zip') {
      const combined = parts.map((p) => `---- ${p.name} ----\n${p.content}\n`).join('\n');
      return new Blob([combined], { type: 'application/zip' });
    }

    if (opts.format === 'json') {
      const payload = JSON.stringify(parts.reduce((acc, cur) => ({ ...acc, [cur.name]: cur.content }), {}), null, 2);
      return new Blob([payload], { type: 'application/json' });
    }

    // plain log
    const plain = parts.map((p) => `---- ${p.name} ----\n${p.content}\n`).join('\n');
    return new Blob([plain], { type: 'text/plain' });
  }

  private async gatherLog(type: LogType): Promise<string> {
    switch (type) {
      case 'runtime':
        return this.gatherRuntimeLogs();
      case 'mqtt':
        return this.gatherMqttLogs();
      case 'voice':
        return this.gatherVoiceLogs();
      case 'automation':
        return this.gatherAutomationLogs();
      case 'errors':
        return this.gatherErrorLogs();
      default:
        return '';
    }
  }

  private async gatherRuntimeLogs(): Promise<string> {
    // Use buffered logs from logger when available
    try {
      // Dynamic import to avoid circular dependencies
      const { logger: central } = await import('../../logger/Logger');
      // @ts-ignore getBufferedLogs exists
      const logs = central.getBufferedLogs?.({ limit: 2000 }) || [];
      return logs.map((l: any) => `[${new Date(l.timestamp).toISOString()}] ${l.category} ${l.message} ${l.data ? JSON.stringify(l.data) : ''}`).join('\n');
    } catch (e) {
      return `runtime log collection failed: ${String(e)}`;
    }
  }

  private async gatherMqttLogs(): Promise<string> {
    try {
      const state = { state: mqttManager.getState() };
      return `MQTT_STATE: ${JSON.stringify(state, null, 2)}`;
    } catch (e) {
      return `mqtt log collection failed: ${String(e)}`;
    }
  }

  private async gatherVoiceLogs(): Promise<string> {
    try {
      const state = voiceRuntimeManager.getState?.() || {};
      return `VOICE_STATE: ${JSON.stringify(state, null, 2)}`;
    } catch (e) {
      return `voice log collection failed: ${String(e)}`;
    }
  }

  private async gatherAutomationLogs(): Promise<string> {
    try {
      const list = automationStoreService.listAutomations();
      return `AUTOMATIONS: ${JSON.stringify(list, null, 2)}`;
    } catch (e) {
      return `automation log collection failed: ${String(e)}`;
    }
  }

  private async gatherErrorLogs(): Promise<string> {
    // Best-effort: extract recent ERROR level logs from buffer
    try {
      const { logger: central } = await import('../../logger/Logger');
      // @ts-ignore
      const logs = central.getBufferedLogs?.({ limit: 2000 }) || [];
      const errors = logs.filter((l: any) => l.level === 4 || /error/i.test(String(l.message)));
      return errors.map((l: any) => `[${new Date(l.timestamp).toISOString()}] ${l.category} ${l.message} ${l.data ? JSON.stringify(l.data) : ''}`).join('\n');
    } catch (e) {
      return `error log collection failed: ${String(e)}`;
    }
  }
}

export const downloadLogsRuntime = DownloadLogsRuntime.getInstance();
