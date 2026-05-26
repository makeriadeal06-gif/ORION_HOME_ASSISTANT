import { CommandRequest, CommandResponse, CommandStatus, CommandType } from '../types';
import { CommandAdapter } from './CommandAdapter';
import { logger } from '../../logger/Logger';
import { runtimeIdentity } from '../../runtime/RuntimeIdentity';
import { triggerManager } from '../../runtime/TriggerManager';
import { findBestMatch, MATCH_CONFIDENCE_THRESHOLD } from '../../voice-runtime/utils/voiceMatcher';

export class TriggerCmdAdapter implements CommandAdapter {
  public canHandle(type: string): boolean {
    return type === CommandType.TRIGGER_CMD;
  }

  private resolveDevice(request: CommandRequest) {
    const devices = triggerManager.getDevices();
    const currentUserId = triggerManager.getUserId();
    const requestedUserId = request.payload?.triggerUserId ?? null;

    if (requestedUserId && currentUserId && requestedUserId !== currentUserId) {
      return {
        device: null,
        reason: `user_mismatch request=${requestedUserId} current=${currentUserId}`,
        confidence: 0,
        matchType: 'none'
      };
    }

    const directDevice = devices.find((device) => device.id === request.deviceId);
    if (directDevice) {
      return {
        device: directDevice,
        reason: 'direct_device_id',
        confidence: 1,
        matchType: 'exact_name'
      };
    }

    const match = findBestMatch(request.action, devices);
    return {
      device: match.device,
      reason: match.matchType,
      confidence: match.confidence,
      matchType: match.matchType
    };
  }

  public async execute(request: CommandRequest): Promise<CommandResponse> {
    if (!request || !request.id || !request.action) {
      return {
        commandId: request?.id || 'unknown',
        status: CommandStatus.FAILED,
        message: 'INVALID_TRIGGER_COMMAND'
      };
    }

    const devices = triggerManager.getDevices();
    const requestedUserId = request.payload?.triggerUserId ?? request.taskContext?.ownerId ?? null;
    if (!runtimeIdentity.runtimeExecutionGuard('trigger_command_execute', { ownerId: requestedUserId })) {
      return {
        commandId: request.id,
        status: CommandStatus.FAILED,
        message: 'PREVIEW_MODE_EXECUTION_BLOCKED'
      };
    }

    logger.info('VOICE_EXECUTION', `available_devices=${devices.length} action="${request.action}"`);

    const resolution = this.resolveDevice(request);
    logger.info(
      'VOICE_MATCH',
      `adapter_resolution type=${resolution.matchType} confidence=${resolution.confidence} reason=${resolution.reason}`
    );

    if (!resolution.device) {
      logger.warn('TRIGGER_HEALTH', `preflight=false reason=${resolution.reason}`);
      logger.warn('VOICE_EXECUTION', `trigger_found=false reason=${resolution.reason}`);
      return {
        commandId: request.id,
        status: CommandStatus.FAILED,
        message: `TRIGGER_NOT_FOUND: ${resolution.reason}`
      };
    }

    if (resolution.matchType === 'multiple_matches') {
      logger.warn('VOICE_EXECUTION', 'trigger_found=false reason=multiple_matches');
      return {
        commandId: request.id,
        status: CommandStatus.FAILED,
        message: 'TRIGGER_AMBIGUOUS_MATCH'
      };
    }

    if (resolution.confidence < MATCH_CONFIDENCE_THRESHOLD) {
      logger.warn('VOICE_EXECUTION', `trigger_found=false reason=low_confidence confidence=${resolution.confidence}`);
      return {
        commandId: request.id,
        status: CommandStatus.FAILED,
        message: `TRIGGER_LOW_CONFIDENCE: ${resolution.confidence}`
      };
    }

    const bridgeStatus = triggerManager.getConnectionStatus();
    const hasConfig = Boolean(triggerManager.getConfig()?.hasToken);
    if (!hasConfig) {
      logger.warn('EXECUTION_PREFLIGHT', 'trigger_preflight=false reason=no_bridge_config');
      return {
        commandId: request.id,
        status: CommandStatus.FAILED,
        message: 'TRIGGER_BRIDGE_NOT_CONFIGURED'
      };
    }

    if (bridgeStatus !== 'connected') {
      logger.warn('TRIGGER_HEALTH', `preflight=false reason=bridge_${bridgeStatus}`);
      return {
        commandId: request.id,
        status: CommandStatus.FAILED,
        message: `TRIGGER_BRIDGE_${bridgeStatus.toUpperCase()}`
      };
    }

    if ((resolution.device.provider || 'TriggerCMD') !== 'TriggerCMD') {
      logger.warn('TRIGGER_HEALTH', `preflight=false reason=invalid_provider provider=${resolution.device.provider || 'none'}`);
      return {
        commandId: request.id,
        status: CommandStatus.FAILED,
        message: 'TRIGGER_INVALID_PROVIDER'
      };
    }

    logger.info(
      'VOICE_EXECUTION',
      `trigger_found=true deviceId=${resolution.device.id} deviceName="${resolution.device.name}"`
    );
    logger.info('EXECUTION_PREFLIGHT', `trigger_preflight=true deviceId=${resolution.device.id} provider=${resolution.device.provider || 'TriggerCMD'} source=${resolution.device.source || resolution.device.server}`);

    const executionSuccess = await triggerManager.execute(resolution.device.id);
    if (!executionSuccess) {
      return {
        commandId: request.id,
        status: CommandStatus.FAILED,
        message: `TRIGGER_DISPATCH_FAILED: ${resolution.device.id}`
      };
    }

    return {
      commandId: request.id,
      status: CommandStatus.SUCCESS,
      message: `Trigger ${resolution.device.id} executed`,
      result: {
        deviceId: resolution.device.id,
        deviceName: resolution.device.name,
        confidence: resolution.confidence,
        matchType: resolution.matchType,
      }
    };
  }
}
