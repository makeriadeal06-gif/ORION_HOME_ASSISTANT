import { create } from 'zustand';
import { CommandStatus, CommandResponse, AuditLogEntry } from '../types';

interface CommandStore {
  activeCommands: Record<string, CommandStatus>;
  lastResponse: CommandResponse | null;
  auditHistory: AuditLogEntry[];
  
  updateCommandStatus: (id: string, status: CommandStatus) => void;
  setResponse: (response: CommandResponse) => void;
  addAuditEntry: (entry: AuditLogEntry) => void;
}

export const useCommandStore = create<CommandStore>((set) => ({
  activeCommands: {},
  lastResponse: null,
  auditHistory: [],

  updateCommandStatus: (id, status) => set((state) => ({
    activeCommands: { ...state.activeCommands, [id]: status }
  })),

  setResponse: (response) => {
    set({ lastResponse: response });
    setTimeout(() => {
      set({ lastResponse: null });
    }, 5000);
  },

  addAuditEntry: (entry) => set((state) => ({
    auditHistory: [entry, ...state.auditHistory].slice(0, 100)
  }))
}));
