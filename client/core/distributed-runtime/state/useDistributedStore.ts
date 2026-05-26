import { create } from 'zustand';
import { NodeMode, NodeInfo, ConnectivityStatus, NodeType } from '../types';

interface DistributedStore {
  currentNode: NodeInfo | null;
  activeNodes: Record<string, NodeInfo>;
  connectivity: ConnectivityStatus;
  
  setCurrentNode: (node: NodeInfo) => void;
  updateNode: (id: string, info: Partial<NodeInfo>) => void;
  upsertNode: (node: NodeInfo) => void;
  removeNode: (id: string) => void;
  setConnectivity: (status: Partial<ConnectivityStatus>) => void;
}

export const useDistributedStore = create<DistributedStore>((set) => ({
  currentNode: null,
  activeNodes: {},
  connectivity: {
    online: navigator.onLine,
    latency: 0,
    quality: 'EXCELLENT',
    lastChange: Date.now()
  },

  setCurrentNode: (node) => {
    if (!node || !node.id) return;
    set({ currentNode: node });
  },
  
  updateNode: (id, info) => {
    if (!id) return;
    set((state) => {
      const existing = state.activeNodes[id];
      if (!existing) return state;

      return {
        activeNodes: {
          ...state.activeNodes,
          [id]: { ...existing, ...info }
        },
        // Keep currentNode in sync if it's the one being updated
        currentNode: state.currentNode?.id === id ? { ...state.currentNode, ...info } : state.currentNode
      };
    });
  },

  upsertNode: (node) => {
    if (!node || !node.id) return;
    set((state) => ({
      activeNodes: { ...state.activeNodes, [node.id]: node }
    }));
  },

  removeNode: (id) => {
    if (!id) return;
    set((state) => ({
      activeNodes: Object.fromEntries(
        Object.entries(state.activeNodes || {}).filter(([key]) => key !== id)
      )
    }));
  },

  setConnectivity: (status) => set((state) => ({
    connectivity: { ...state.connectivity, ...status, lastChange: Date.now() }
  }))
}));
