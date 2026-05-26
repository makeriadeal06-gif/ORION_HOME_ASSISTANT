import { deviceRegistry } from '../registry/OrionDeviceRegistry';
import { EcosystemMap, EcosystemRoom } from '../types';
import { logger } from '../../logger/Logger';

export class EcosystemMapper {
  public static map(): EcosystemMap {
    logger.info('ECOSYSTEM', 'Mapping connected environment...');
    const devices = deviceRegistry.getAllDevices();
    const rooms: Record<string, EcosystemRoom> = {};
    const unassigned: string[] = [];

    devices.forEach(device => {
      if (device.room) {
        if (!rooms[device.room]) {
          rooms[device.room] = {
            id: device.room.toLowerCase().replace(/\s+/g, '_'),
            name: device.room,
            devices: []
          };
        }
        rooms[device.room].devices.push(device.id);
      } else {
        unassigned.push(device.id);
      }
    });

    return { rooms, unassigned };
  }
}
