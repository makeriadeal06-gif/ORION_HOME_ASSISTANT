export enum Environment {
  DEVELOPMENT = 'development',
  STAGING = 'staging',
  PRODUCTION = 'production'
}

export interface SubsystemHealth {
  id: string;
  name: string;
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  lastPing: number;
  message?: string;
}

export interface InfrastructureHealth {
  version: string;
  env: Environment;
  uptime: number;
  subsystems: Record<string, SubsystemHealth>;
  memoryUsage?: number;
}
