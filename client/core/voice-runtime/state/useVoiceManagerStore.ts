import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface CustomVoice {
  id: string;
  name: string;
  voiceId: string;
}

interface VoiceManagerState {
  customVoices: CustomVoice[];
  activeCustomVoiceId: string | null;
  addVoice: (name: string, voiceId: string) => void;
  removeVoice: (id: string) => void;
  setActiveVoice: (id: string | null) => void;
}

export const useVoiceManagerStore = create<VoiceManagerState>()(
  persist(
    (set) => ({
      customVoices: [],
      activeCustomVoiceId: null,
      addVoice: (name, voiceId) => set((state) => ({
        customVoices: [...state.customVoices, { id: `custom_${Date.now()}`, name, voiceId }]
      })),
      removeVoice: (id) => set((state) => ({
        customVoices: state.customVoices.filter((v) => v.id !== id),
        activeCustomVoiceId: state.activeCustomVoiceId === id ? null : state.activeCustomVoiceId
      })),
      setActiveVoice: (id) => set({ activeCustomVoiceId: id }),
    }),
    {
      name: 'orion.voice-manager.v1',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
