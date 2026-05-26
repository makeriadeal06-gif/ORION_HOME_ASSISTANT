import { create } from 'zustand';
import { OrionDevice, EcosystemMap } from '../types';
import { EcosystemMapper } from '../ecosystem/EcosystemMapper';

interface DeviceState {
  devices: Record<string, OrionDevice>;
  ecosystem: EcosystemMap;
  lastSync: number;
}

interface DeviceActions {
  setDevices: (devices: OrionDevice[]) => void;
  updateDevice: (id: string, update: Partial<OrionDevice>) => void;
  syncEcosystem: () => void;
  addDevice: (device: OrionDevice) => void;
  removeDevice: (id: string) => void;
  connectDevice: (id: string) => void;
  disconnectDevice: (id: string) => void;
  markBluetooth: (id: string, present: boolean) => void;
  markWifi: (id: string, ssid?: string | null) => void;
}

export const useDeviceStore = create<DeviceState & DeviceActions>((set, get) => ({
  devices: {},
  ecosystem: { rooms: {}, unassigned: [] },
  lastSync: 0,

  setDevices: (devicesList) => {
    const devices: Record<string, OrionDevice> = {};
    devicesList.forEach(d => devices[d.id] = d);
    set({ devices, lastSync: Date.now() });
    get().syncEcosystem();
  },

  updateDevice: (id, update) => {
    set((state) => {
      const device = state.devices[id];
      if (!device) return state;
      return {
        devices: { ...state.devices, [id]: { ...device, ...update } }
      };
    });
    get().syncEcosystem();
  },

  addDevice: (device) => {
    set((state) => ({ devices: { ...state.devices, [device.id]: device } }));
    get().syncEcosystem();
  },

  removeDevice: (id) => {
    set((state) => {
      const next = { ...state.devices };
      delete next[id];
      return { devices: next };
    });
    get().syncEcosystem();
  },

  connectDevice: (id) => {
    set((state) => {
      const d = state.devices[id];
      if (!d) return state;
      return { devices: { ...state.devices, [id]: { ...d, status: 'ONLINE' } } };
    });
    get().syncEcosystem();
  },

  disconnectDevice: (id) => {
    set((state) => {
      const d = state.devices[id];
      if (!d) return state;
      return { devices: { ...state.devices, [id]: { ...d, status: 'OFFLINE' } } };
    });
    get().syncEcosystem();
  },

  markBluetooth: (id, present) => {
    set((state) => {
      const d = state.devices[id];
      if (!d) return state;
      return { devices: { ...state.devices, [id]: { ...d, bluetooth: present } } };
    });
    get().syncEcosystem();
  },

  markWifi: (id, ssid) => {
    set((state) => {
      const d = state.devices[id];
      if (!d) return state;
      return { devices: { ...state.devices, [id]: { ...d, wifi: ssid || null } } };
    });
    get().syncEcosystem();
  },

  syncEcosystem: () => {
    const ecosystem = EcosystemMapper.map();
    set({ ecosystem });
  }
}));
