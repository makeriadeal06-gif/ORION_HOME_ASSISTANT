import { MqttInfrastructure } from './mqtt.schema';
import { SocketInfrastructure } from './socket.schema';
import { GoogleHomeInfrastructure } from './google.schema';

export interface ModuleHealth {
  id: string;
  name: string;
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'DISCONNECTED';
  latency: number;
}

export interface InfrastructureStatus {
  mqtt: MqttInfrastructure;
  socket: SocketInfrastructure;
  googleHome: GoogleHomeInfrastructure;
}

export interface SystemState {
  infrastructure: InfrastructureStatus;
  isAuthenticating: boolean;
  cpuPressure: 'LOW' | 'MODERATE' | 'HIGH';
  memoryUsage: number;
  eventQueueSize: number;
  modules: ModuleHealth[];
  registryModules: { id: string, name: string, state: string, version: string }[];
  currentView: string;
}
