import { create } from 'zustand';
import { createAuthSlice } from './slices/authSlice';
import { createChatSlice } from './slices/chatSlice';
import { createPersonaSlice } from './slices/personaSlice';
import { createUiSlice } from './slices/uiSlice';
import { AppStore } from './types';

export const useAppStore = create<AppStore>()((...args) => ({
  ...createAuthSlice(...args),
  ...createChatSlice(...args),
  ...createPersonaSlice(...args),
  ...createUiSlice(...args),
}));

export type { AppStore } from './types';
