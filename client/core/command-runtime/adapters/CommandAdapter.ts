import { CommandRequest, CommandResponse } from '../types';

export interface CommandAdapter {
  execute(request: CommandRequest): Promise<CommandResponse>;
  canHandle(type: string): boolean;
}
