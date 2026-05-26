import { create } from 'zustand';
import { SystemState, ModuleHealth, InfrastructureStatus } from '../schemas/system.schema';

interface SystemActions {
  setCurrentView: (view: string) => void;
  updateModuleHealth: (id: string, health: Partial<ModuleHealth>) => void;
  updateRegistryModules: (modules: { id: string, name: string, state: string, version: string }[]) => void;
  updateInfraStatus: (key: keyof InfrastructureStatus, status: any) => void;
  setCPUPressure: (pressure: 'LOW' | 'MODERATE' | 'HIGH') => void;
  setAuthenticating: (status: boolean) => void;
  incrementEventQueue: () => void;
  decrementEventQueue: () => void;
}

export const useSystemStore = create<SystemState & SystemActions>((set) => ({
  infrastructure: {
    mqtt: { 
      connected: false, 
      broker: 'mqtt.orion.local',
      mqttMode: 'REALTIME',
      mqttRecoveryState: 'STABLE',
      reconnectAttempts: 0,
      circuitBreakerState: 'CLOSED',
      lastSuccessfulHandshake: Date.now()
    },
    socket: { connected: false, transport: 'polling' },
    googleHome: { linked: false, lastSync: 0 }
  },
  isAuthenticating: false,
  cpuPressure: 'LOW',
  memoryUsage: 0,
  eventQueueSize: 0,
  currentView: 'dashboard',
  modules: [
    { id: 'VOICE_ENGINE', name: 'Voice Processor', status: 'ONLINE', latency: 45 },
    { id: 'MQTT_SERVICE', name: 'MQTT Service', status: 'ONLINE', latency: 12 },
    { id: 'GEMINI_ORCHESTRATOR', name: 'Gemini Orchestrator', status: 'ONLINE', latency: 150 },
    { id: 'SMART_HOME_BRIDGE', name: 'Google Home Bridge', status: 'OFFLINE', latency: 0 },
    { id: 'TRIGGER_CMD', name: 'TriggerCMD Engine', status: 'DISCONNECTED', latency: 0 },
    { id: 'AUTO_RUNNER', name: 'Automation Core', status: 'ONLINE', latency: 8 }
  ],
  registryModules: [],

  setCurrentView: (view) => set({ currentView: view }),
  updateModuleHealth: (id, health) => set((state) => ({
    modules: state.modules.map((m) => m.id === id ? { ...m, ...health } : m)
  })),
  updateRegistryModules: (modules) => set({ registryModules: modules }),
  updateInfraStatus: (key, status) => set((state) => ({
    infrastructure: { ...state.infrastructure, [key]: { ...state.infrastructure[key], ...status } }
  })),
  setCPUPressure: (pressure) => set({ cpuPressure: pressure }),
  setAuthenticating: (status) => set({ isAuthenticating: status }),
  incrementEventQueue: () => set((state) => ({ eventQueueSize: state.eventQueueSize + 1 })),
  decrementEventQueue: () => set((state) => ({ eventQueueSize: Math.max(0, state.eventQueueSize - 1) })),
}));
