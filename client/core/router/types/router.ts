import { ReactNode } from 'react';

export enum RouteState {
  IDLE = 'IDLE',
  RESOLVING = 'RESOLVING',
  TRANSITIONING = 'TRANSITIONING',
  ACTIVE = 'ACTIVE',
  ERROR = 'ERROR'
}

export interface OrionRoute {
  path: string;
  moduleId: string;
  layout?: 'DEFAULT' | 'FULLSCREEN' | 'DIAGNOSTIC' | 'MODAL';
  guards?: string[];
  metadata?: Record<string, any>;
}

export interface NavigationState {
  currentPath: string;
  previousPath: string | null;
  history: string[];
  lastTransition: number;
}
