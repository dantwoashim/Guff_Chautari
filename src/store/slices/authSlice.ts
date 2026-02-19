import { StateCreator } from 'zustand';
import { AppStore, AuthSlice } from '../types';

export const createAuthSlice: StateCreator<AppStore, [], [], AuthSlice> = (set) => ({
  session: null,
  isAuthLoading: true,
  byokStatus: 'unknown',
  byokFingerprint: null,
  setSession: (session) => set({ session }),
  setAuthLoading: (isAuthLoading) => set({ isAuthLoading }),
  setByokState: (byokStatus, byokFingerprint = null) => set({ byokStatus, byokFingerprint }),
});
