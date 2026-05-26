import { ReactNode, LazyExoticComponent } from 'react';

export enum ModuleState {
  REGISTERED = 'REGISTERED',
  INITIALIZING = 'INITIALIZING',
  ACTIVE = 'ACTIVE',
  DEGRADED = 'DEGRADED',
  FAILED = 'FAILED',
  DISABLED = 'DISABLED'
}

export interface OrionModule {
  id: string;
  name: string;
  version: string;
  icon: any; // We'll use the Lucide icon reference
  route: string;
  component: LazyExoticComponent<any>;
  permissions?: string[];
  dependencies?: string[];
  enabled?: boolean;
  hidden?: boolean;
  healthcheck?: () => Promise<boolean>;
  initialize?: () => Promise<void>;
  destroy?: () => Promise<void>;
  metadata?: Record<string, any>;
}

export interface RegisteredModule extends OrionModule {
  state: ModuleState;
  lastHealthCheck: number;
}
