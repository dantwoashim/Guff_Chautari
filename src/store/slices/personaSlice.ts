import { StateCreator } from 'zustand';
import { AppStore, PersonaSlice } from '../types';

export const createPersonaSlice: StateCreator<AppStore, [], [], PersonaSlice> = (set) => ({
  activePersonaId: null,
  personas: [],
  personaRuntimeStates: {},
  setActivePersonaId: (activePersonaId) => set({ activePersonaId }),
  setPersonas: (personas) => set({ personas }),
  setPersonaRuntimeState: (personaId, value) =>
    set((state) => ({
      personaRuntimeStates: {
        ...state.personaRuntimeStates,
        [personaId]: value,
      },
    })),
});
