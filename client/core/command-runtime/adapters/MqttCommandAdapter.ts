import { CommandRequest, CommandResponse, CommandStatus, CommandType } from '../types';
import { CommandAdapter } from './CommandAdapter';
import { mqttManager, MqttState } from '../../runtime/MqttManager';
import { logger } from '../../logger/Logger';

export class MqttCommandAdapter implements CommandAdapter {
  public canHandle(type: string): boolean {
    return type === CommandType.MQTT;
  }

  public async execute(request: CommandRequest): Promise<CommandResponse> {
    if (!request || !request.id || !request.deviceId || !request.action) {
      return {
        commandId: request?.id || 'unknown',
        status: CommandStatus.FAILED,
        message: 'INVALID_MQTT_COMMAND'
      };
    }

    const mqttState = mqttManager.getState();
    if (mqttState !== MqttState.CONNECTED && mqttState !== MqttState.DEGRADED) {
      return {
        commandId: request.id,
        status: CommandStatus.FAILED,
        message: `MQTT_NOT_READY_${mqttState}`
      };
    }

    logger.info('MQTT', `Publishing command: ${request.action} to ${request.deviceId}`);
    
    // MQTT actions usually involve publishing to a specific topic
    const topic = `orion/devices/${request.deviceId}/cmd`;
    const message = JSON.stringify({ action: request.action, ...request.payload });

    try {
      mqttManager.publish(topic, message);
      return {
        commandId: request.id,
        status: CommandStatus.SUCCESS,
        message: 'MQTT message delivered to broker'
      };
    } catch (error: any) {
      return {
        commandId: request.id,
        status: CommandStatus.FAILED,
        message: `MQTT_BROKER_ERROR: ${error.message}`
      };
    }
  }
}
