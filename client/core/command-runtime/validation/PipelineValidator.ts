import { CommandRequest, CommandResponse, CommandStatus } from '../types';
import { deviceRegistry } from '../../google-home/registry/OrionDeviceRegistry';
import { DeviceConnectionStatus } from '../../device-runtime/lifecycle/DeviceLifecycle';

export class PipelineValidator {
  public static validate(request: CommandRequest): { valid: boolean; error?: string } {
    // 1. Basic Check
    if (!request.deviceId || !request.action) {
      return { valid: false, error: 'MISSING_COMMAND_METADATA' };
    }

    // 2. Device Check
    const device = deviceRegistry.getDevice(request.deviceId);
    if (!device) {
      return { valid: false, error: 'UNKNOWN_DEVICE_ID' };
    }

    // 3. Status Check
    if (device.status !== DeviceConnectionStatus.ONLINE) {
      return { valid: false, error: 'DEVICE_OFFLINE' };
    }

    // 4. Rate Limiting Check (Future Implementation)
    
    return { valid: true };
  }
}
