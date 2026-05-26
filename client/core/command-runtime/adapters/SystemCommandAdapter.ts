import { CommandAdapter } from './CommandAdapter';
import { CommandRequest, CommandResponse, CommandStatus, CommandType } from '../types';
import { logger } from '../../logger/Logger';
import { socketRuntime } from '../../socket/SocketRuntime';
import { runtimeIdentity } from '@core/runtime/RuntimeIdentity';
import { setScopedStorageValue } from '@core/runtime/ScopedBrowserStorage';
import { triggerManager } from '../../runtime/TriggerManager';
import { isExecutablePathValid } from '@core/automation-runtime/AutomationAssetRegistry';

type SystemAction =
  | 'speech_say'
  | 'runtime_socket_reconnect'
  | 'runtime_hydration_revalidate'
  | 'runtime_restart_listening'
  | 'runtime_interrupt_playback'
  | 'local_open_spotify'
  | 'local_open_discord'
  | 'local_open_app'
  | 'local_open_url'
  | 'local_execute_command'
  | 'local_execute_executable_path'
  | 'local_set_focus_mode'
  | 'local_set_performance_mode'
  | 'automation_run'
  | 'automation_wait_noop'
  | 'future_device_action_placeholder';

export class SystemCommandAdapter implements CommandAdapter {
  public canHandle(type: string): boolean {
    return type === CommandType.SYSTEM;
  }

  public async execute(request: CommandRequest): Promise<CommandResponse> {
    const action = (request.payload?.systemAction || request.action) as SystemAction;
    const ownerId = String(request.taskContext?.ownerId || request.payload?.triggerUserId || runtimeIdentity.getOwnerId() || '').trim() || null;

    if (!request?.id || !action) {
      return {
        commandId: request?.id || 'unknown',
        status: CommandStatus.FAILED,
        message: 'INVALID_SYSTEM_COMMAND',
      };
    }

    if (!runtimeIdentity.runtimeExecutionGuard(`system_command_${action}`, { ownerId })) {
      return {
        commandId: request.id,
        status: CommandStatus.FAILED,
        message: 'PREVIEW_MODE_EXECUTION_BLOCKED',
      };
    }

    logger.info('AUTOMATION_EXECUTION', `system_action=${action} taskId=${request.taskContext?.taskId || 'none'}`);

    try {
      switch (action) {
        case 'speech_say': {
          const text = String(request.payload?.text || '').trim();
          if (!text) {
            throw new Error('MISSING_SPEECH_TEXT');
          }
          const { voiceRuntimeManager } = await import('@core/voice-runtime/VoiceRuntimeManager');
          voiceRuntimeManager.speak(text, request.id);
          break;
        }
        case 'runtime_socket_reconnect': {
          socketRuntime.reconnect('automation_runtime');
          break;
        }
        case 'runtime_hydration_revalidate': {
          const config = await triggerManager.loadConfig();
          if (config?.hasToken) {
            await triggerManager.syncDevices();
          }
          break;
        }
        case 'runtime_restart_listening': {
          const { voiceRuntimeManager } = await import('@core/voice-runtime/VoiceRuntimeManager');
          voiceRuntimeManager.startListening();
          break;
        }
        case 'runtime_interrupt_playback': {
          const { voiceRuntimeManager } = await import('@core/voice-runtime/VoiceRuntimeManager');
          voiceRuntimeManager.interrupt();
          break;
        }
        case 'local_open_spotify': {
          this.openUrl('https://open.spotify.com/', 'spotify');
          break;
        }
        case 'local_open_discord': {
          this.openUrl('https://discord.com/app', 'discord');
          break;
        }
        case 'local_open_app': {
          const target = String(request.payload?.appTarget || '').toLowerCase();
          this.openKnownApp(target);
          break;
        }
        case 'local_open_url': {
          const url = String(request.payload?.url || '').trim();
          if (!url) {
            throw new Error('MISSING_URL');
          }
          this.openUrl(url, 'custom_url');
          break;
        }
        case 'local_execute_command': {
          const commandText = String(request.payload?.commandText || '').trim();
          if (!commandText) {
            throw new Error('MISSING_COMMAND_TEXT');
          }
          window.dispatchEvent(new CustomEvent('orion:system-action', { detail: { action, commandText } }));
          break;
        }
        case 'local_execute_executable_path': {
          const executablePath = String(request.payload?.executablePath || '').trim();
          if (!executablePath) {
            throw new Error('MISSING_EXECUTABLE_PATH');
          }
          logger.info('EXECUTABLE_VALIDATION', `path="${executablePath}" valid=${isExecutablePathValid(executablePath)}`);
          if (!isExecutablePathValid(executablePath)) {
            throw new Error('INVALID_EXECUTABLE_PATH');
          }
          const provider = String(request.payload?.executableProvider || 'system_bridge');
          const runtimeConnected = socketRuntime.getHealthMetrics().connected;
          const bridgeConnected = triggerManager.getConnectionStatus() === 'connected';
          logger.info('EXECUTION_PREFLIGHT', `executable_preflight path="${executablePath}" provider=${provider} runtime_connected=${runtimeConnected} bridge_connected=${bridgeConnected}`);
          if (provider === 'triggercmd' && !bridgeConnected) {
            throw new Error('TRIGGERCMD_BRIDGE_OFFLINE');
          }
          window.dispatchEvent(new CustomEvent('orion:system-action', {
            detail: {
              action,
              executablePath,
              category: request.payload?.executableCategory,
              icon: request.payload?.executableIcon,
              registryId: request.payload?.executableRegistryId,
              provider: request.payload?.executableProvider || 'system_bridge',
            },
          }));
          break;
        }
        case 'local_set_focus_mode': {
          if (!runtimeIdentity.requiresPersistentExecution('system_focus_mode')) {
            throw new Error('PREVIEW_MODE_EXECUTION_BLOCKED');
          }
          setScopedStorageValue('orion.local.mode.focus', 'active');
          window.dispatchEvent(new CustomEvent('orion:system-action', { detail: { action, value: 'active' } }));
          break;
        }
        case 'local_set_performance_mode': {
          if (!runtimeIdentity.requiresPersistentExecution('system_performance_mode')) {
            throw new Error('PREVIEW_MODE_EXECUTION_BLOCKED');
          }
          setScopedStorageValue('orion.local.mode.performance', 'active');
          window.dispatchEvent(new CustomEvent('orion:system-action', { detail: { action, value: 'active' } }));
          break;
        }
        case 'automation_run': {
          const targetAutomationId = String(request.payload?.targetAutomationId || '').trim();
          if (!targetAutomationId) {
            throw new Error('MISSING_TARGET_AUTOMATION');
          }
          const { automationStoreService } = await import('@core/automation-runtime/AutomationStore');
          const started = automationStoreService.runAutomation(targetAutomationId, 'task_action');
          if (!started) {
            throw new Error('TARGET_AUTOMATION_NOT_DISPATCHED');
          }
          break;
        }
        case 'automation_wait_noop': {
          break;
        }
        case 'future_device_action_placeholder': {
          window.dispatchEvent(new CustomEvent('orion:system-action', {
            detail: {
              action,
              futureDeviceAction: request.payload?.futureDeviceAction,
              targetId: request.payload?.targetId,
              value: request.payload?.value,
            },
          }));
          break;
        }
        default:
          throw new Error(`UNSUPPORTED_SYSTEM_ACTION_${action}`);
      }

      return {
        commandId: request.id,
        status: CommandStatus.SUCCESS,
        message: `System action ${action} executed`,
        result: {
          action,
        },
      };
    } catch (error: any) {
      return {
        commandId: request.id,
        status: CommandStatus.FAILED,
        message: error?.message || 'SYSTEM_ACTION_FAILED',
      };
    }
  }

  private openUrl(url: string, target: string): void {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      logger.warn('AUTOMATION_EXECUTION', `window_open_blocked target=${target}`);
    }
  }

  private openKnownApp(target: string): void {
    if (target === 'spotify') {
      this.openUrl('https://open.spotify.com/', 'spotify');
      return;
    }
    if (target === 'discord') {
      this.openUrl('https://discord.com/app', 'discord');
      return;
    }

    if (!target) {
      throw new Error('MISSING_APP_TARGET');
    }

    this.openUrl(`https://www.google.com/search?q=${encodeURIComponent(target)}`, target);
  }
}
