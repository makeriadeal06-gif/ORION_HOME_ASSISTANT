import { create } from 'zustand';
import { AutomationDraft, AutomationRecord } from '@core/automation-runtime/types';

interface AutomationState {
  hydrated: boolean;
  loading: boolean;
  automations: AutomationRecord[];
  draft: AutomationDraft | null;
  editorOpen: boolean;
  setHydrated: (hydrated: boolean) => void;
  setLoading: (loading: boolean) => void;
  setAutomations: (automations: AutomationRecord[]) => void;
  setDraft: (draft: AutomationDraft | null) => void;
  setEditorOpen: (editorOpen: boolean) => void;
}

export const useAutomationStore = create<AutomationState>((set) => ({
  hydrated: false,
  loading: true,
  automations: [],
  draft: null,
  editorOpen: false,
  setHydrated: (hydrated) => set({ hydrated }),
  setLoading: (loading) => set({ loading }),
  setAutomations: (automations) => set({ automations }),
  setDraft: (draft) => set({ draft }),
  setEditorOpen: (editorOpen) => set({ editorOpen }),
}));
