import { create } from 'zustand';
import { AndroidAwarenessState } from './types';

interface AndroidAwarenessStore extends AndroidAwarenessState {
  updateState: (partial: Partial<AndroidAwarenessState>) => void;
  updateBattery: (battery: Partial<AndroidAwarenessState['battery']>) => void;
  updateNetwork: (network: Partial<AndroidAwarenessState['network']>) => void;
  updateBluetooth: (bluetooth: Partial<AndroidAwarenessState['bluetooth']>) => void;
  updatePower: (power: Partial<AndroidAwarenessState['power']>) => void;
  updateAudio: (audio: Partial<AndroidAwarenessState['audio']>) => void;
  updateLocation: (location: Partial<AndroidAwarenessState['location']>) => void;
  updatePermissions: (permissions: Partial<AndroidAwarenessState['permissions']>) => void;
}

const initialState: AndroidAwarenessState = {
  battery: { level: 0, status: 'unknown', temperature: 0, updatedAt: 0 },
  network: { type: 'unknown', isConnected: false, isMetered: false, updatedAt: 0 },
  bluetooth: { status: 'unknown', updatedAt: 0 },
  power: { isPowerSaveMode: false, isInteractive: true, updatedAt: 0 },
  audio: { volume: 0, isMuted: false, isMusicActive: false, updatedAt: 0 },
  location: { status: 'unknown', latitude: null, longitude: null, accuracy: null, updatedAt: 0 },
  permissions: { microphone: 'unknown', notifications: 'unknown', location: 'unknown', camera: 'unknown', updatedAt: 0 },
  lastUpdated: 0,
};

export const useAndroidAwarenessStore = create<AndroidAwarenessStore>((set) => ({
  ...initialState,
  
  updateState: (partial) => set((state) => ({ ...state, ...partial, lastUpdated: Date.now() })),
  
  updateBattery: (battery) => set((state) => ({ 
    battery: { ...state.battery, ...battery, updatedAt: Date.now() },
    lastUpdated: Date.now(),
  })),

  updateNetwork: (network) => set((state) => ({ 
    network: { ...state.network, ...network, updatedAt: Date.now() },
    lastUpdated: Date.now(),
  })),

  updateBluetooth: (bluetooth) => set((state) => ({ 
    bluetooth: { ...state.bluetooth, ...bluetooth, updatedAt: Date.now() },
    lastUpdated: Date.now(),
  })),

  updatePower: (power) => set((state) => ({ 
    power: { ...state.power, ...power, updatedAt: Date.now() },
    lastUpdated: Date.now(),
  })),

  updateAudio: (audio) => set((state) => ({ 
    audio: { ...state.audio, ...audio, updatedAt: Date.now() },
    lastUpdated: Date.now(),
  })),

  updateLocation: (location) => set((state) => ({ 
    location: { ...state.location, ...location, updatedAt: Date.now() },
    lastUpdated: Date.now(),
  })),

  updatePermissions: (permissions) => set((state) => ({ 
    permissions: { ...state.permissions, ...permissions, updatedAt: Date.now() },
    lastUpdated: Date.now(),
  })),
}));
