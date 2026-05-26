import { create } from 'zustand';
import { Environment, InfrastructureHealth, SubsystemHealth } from '../types';

interface ProductionStore {
  health: InfrastructureHealth;
  updateSubsystem: (id: string, update: Partial<SubsystemHealth>) => void;
  setEnv: (env: Environment) => void;
}

export const useProductionStore = create<ProductionStore>((set) => ({
  health: {
    version: '0.1.0-stable',
    env: (import.meta.env.MODE as Environment) || Environment.DEVELOPMENT,
    uptime: Date.now(),
    subsystems: {
      INTERNAL_RUNTIME: { id: 'INTERNAL_RUNTIME', name: 'Internal Runtime', status: 'HEALTHY', lastPing: Date.now() },
      SOCKET_LAYER: { id: 'SOCKET_LAYER', name: 'WebSocket Layer', status: 'HEALTHY', lastPing: Date.now() },
      MQTT_LAYER: { id: 'MQTT_LAYER', name: 'MQTT Infrastructure', status: 'HEALTHY', lastPing: Date.now() },
      DATABASE_SYNC: { id: 'DATABASE_SYNC', name: 'Cloud Sync Engine', status: 'HEALTHY', lastPing: Date.now() },
      COGNITIVE_CORE: { id: 'COGNITIVE_CORE', name: 'Cognitive Core', status: 'HEALTHY', lastPing: Date.now() }
    }
  },

  setEnv: (env) => set((state) => ({
    health: { ...state.health, env }
  })),

  updateSubsystem: (id, update) => set((state) => ({
    health: {
      ...state.health,
      subsystems: {
        ...state.health.subsystems,
        [id]: { ...state.health.subsystems[id], ...update, lastPing: Date.now() }
      }
    }
  }))
}));
