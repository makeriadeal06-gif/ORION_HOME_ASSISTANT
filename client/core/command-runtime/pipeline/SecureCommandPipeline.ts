import { CommandRequest, CommandResponse, CommandStatus, CommandType, AuditLogEntry } from '../types';
import { PipelineValidator } from '../validation/PipelineValidator';
import { commandQueue } from '../execution/CommandExecutionQueue';
import { useCommandStore } from '../state/useCommandStore';
import { useAuthStore } from '../../state/stores/useAuthStore';
import { logger } from '../../logger/Logger';
import { socketRuntime } from '../../socket/SocketRuntime';

export class SecureCommandPipeline {
  public static async execute(type: CommandType, deviceId: string, action: string, payload?: any) {
    const id = `cmd_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = Date.now();
    
    const request: CommandRequest = {
      id,
      type,
      deviceId,
      action,
      payload,
      timestamp
    };

    logger.info('COMMAND_PIPELINE', `Initiating command: ${action} [${id}]`);
    useCommandStore.getState().updateCommandStatus(id, CommandStatus.VALIDATING);

    // 1. Validation
    const validation = PipelineValidator.validate(request);
    if (!validation.valid) {
      this.rejectCommand(request, validation.error || 'VALIDATION_FAILED');
      return;
    }

    // 2. Audit Log (Initial)
    this.audit(request, CommandStatus.PENDING);

    // 3. Enqueue
    commandQueue.enqueue(request);

    // 4. Realtime Feedback
    socketRuntime.emit('command:initiated', { id, action, deviceId });

    return id;
  }

  private static rejectCommand(request: CommandRequest, reason: string) {
    logger.warn('COMMAND_VALIDATION', `Command rejected: ${request.id} - ${reason}`);
    const response: CommandResponse = {
      commandId: request.id,
      status: CommandStatus.FAILED,
      message: reason
    };
    useCommandStore.getState().updateCommandStatus(request.id, CommandStatus.FAILED);
    useCommandStore.getState().setResponse(response);
    this.audit(request, CommandStatus.FAILED, reason);
  }

  private static audit(request: CommandRequest, status: CommandStatus, error?: string) {
    const user = useAuthStore.getState().user;
    const entry: AuditLogEntry = {
      id: `audit_${Math.random().toString(36).substr(2, 9)}`,
      commandId: request.id,
      type: request.type,
      deviceId: request.deviceId,
      action: request.action,
      status,
      userEmail: user?.email || 'SYSTEM',
      timestamp: Date.now(),
      error
    };
    useCommandStore.getState().addAuditEntry(entry);
  }
}
