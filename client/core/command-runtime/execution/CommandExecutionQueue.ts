import { CommandRequest, CommandResponse, CommandStatus, CommandType } from '../types';
import { CommandAdapter } from '../adapters/CommandAdapter';
import { logger } from '../../logger/Logger';
import { useCommandStore } from '../state/useCommandStore';

type CommandQueueLifecycleEvent = {
  phase: 'queued' | 'executing' | 'completed' | 'failed';
  request: CommandRequest;
  response?: CommandResponse;
  error?: string;
};

export class CommandExecutionQueue {
  private queue: Array<{
    request: CommandRequest;
    resolve: (response: CommandResponse) => void;
  }> = [];
  private processing = false;
  private adapters: CommandAdapter[] = [];
  private listeners: Array<(event: CommandQueueLifecycleEvent) => void> = [];

  public registerAdapter(adapter: CommandAdapter) {
    this.adapters.push(adapter);
  }

  public subscribe(listener: (event: CommandQueueLifecycleEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((entry) => entry !== listener);
    };
  }

  public async enqueue(request: CommandRequest): Promise<CommandResponse> {
    logger.info('COMMAND_PIPELINE', `Enqueued: ${request.action} for ${request.deviceId}`);
    useCommandStore.getState().updateCommandStatus(request.id, CommandStatus.QUEUED);
    this.emit({ phase: 'queued', request });

    return new Promise((resolve) => {
      this.queue.push({ request, resolve });
      this.process();
    });
  }

  private async process() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    const entry = this.queue.shift()!;
    const { request, resolve } = entry;
    useCommandStore.getState().updateCommandStatus(request.id, CommandStatus.EXECUTING);
    logger.info('COMMAND_QUEUE', `processing: ${request.action}`);
    this.emit({ phase: 'executing', request });

    const start = Date.now();
    try {
      const adapter = this.adapters.find(a => a.canHandle(request.type));
      
      if (!adapter) {
        throw new Error(`NO_ADAPTER_FOR_TYPE_${request.type}`);
      }

      logger.info('COMMAND_QUEUE', `adapter found, executing: ${request.type}`);
      const response = await adapter.execute(request);
      response.duration = Date.now() - start;
      
      useCommandStore.getState().updateCommandStatus(request.id, response.status);
      useCommandStore.getState().setResponse(response);
      resolve(response);
      
      logger.info('COMMAND_QUEUE', `execution completed: ${response.status}`);
      logger.info('COMMAND_EXECUTION', `Executed: ${request.action} status: ${response.status} duration: ${response.duration}ms`);
      this.emit({ phase: 'completed', request, response });
    } catch (error: any) {
      const duration = Date.now() - start;
      const response: CommandResponse = {
        commandId: request.id,
        status: CommandStatus.FAILED,
        message: error.message,
        duration
      };
      useCommandStore.getState().updateCommandStatus(request.id, CommandStatus.FAILED);
      useCommandStore.getState().setResponse(response);
      resolve(response);
      logger.error('COMMAND_EXECUTION', `Execution failed: ${error.message}`);
      this.emit({ phase: 'failed', request, response, error: error.message });
    } finally {
      this.processing = false;
      this.process();
    }
  }

  private emit(event: CommandQueueLifecycleEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

export const commandQueue = new CommandExecutionQueue();
