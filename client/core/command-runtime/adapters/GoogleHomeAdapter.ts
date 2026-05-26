import { CommandRequest, CommandResponse, CommandStatus, CommandType } from '../types';
import { CommandAdapter } from './CommandAdapter';
import { logger } from '../../logger/Logger';

export class GoogleHomeAdapter implements CommandAdapter {
  public canHandle(type: string): boolean {
    return type === CommandType.GOOGLE_HOME;
  }

  public async execute(request: CommandRequest): Promise<CommandResponse> {
    if (!request || !request.id || !request.deviceId || !request.action) {
      return {
        commandId: request?.id || 'unknown',
        status: CommandStatus.FAILED,
        message: 'INVALID_GOOGLE_HOME_COMMAND'
      };
    }

    logger.info('GOOGLE_HOME', `Executing action: ${request.action} on ${request.deviceId}`);
    
    // In a real scenario, this would call a backend protected API
    // For this simulation phase, we use a delay to represent execution
    await new Promise(resolve => setTimeout(resolve, 1200));

    // Simulated success
    return {
      commandId: request.id,
      status: CommandStatus.SUCCESS,
      message: `Action ${request.action} completed via Google Home Homegraph`
    };
  }
}
