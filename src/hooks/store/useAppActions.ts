import { useAppStore } from '../../store';
import {
  selectSetByokState,
  selectSetCurrentView,
  selectSetDeleteModalState,
  selectSetIsAdminOpen,
  selectSetIsChatListOpen,
  selectSetIsNewChatModalOpen,
  selectSetIsSessionModalOpen,
  selectSetIsSettingsOpen,
  selectSetMobileView,
  selectSetNavView,
  selectSetSearchTerm,
} from '../../store/selectors';

export const useSetCurrentViewAction = () => useAppStore(selectSetCurrentView);
export const useSetNavViewAction = () => useAppStore(selectSetNavView);
export const useSetSearchTermAction = () => useAppStore(selectSetSearchTerm);
export const useSetMobileViewAction = () => useAppStore(selectSetMobileView);
export const useSetIsChatListOpenAction = () => useAppStore(selectSetIsChatListOpen);
export const useSetIsAdminOpenAction = () => useAppStore(selectSetIsAdminOpen);
export const useSetByokStateAction = () => useAppStore(selectSetByokState);
export const useSetIsSettingsOpenAction = () => useAppStore(selectSetIsSettingsOpen);
export const useSetDeleteModalStateAction = () => useAppStore(selectSetDeleteModalState);
export const useSetIsNewChatModalOpenAction = () => useAppStore(selectSetIsNewChatModalOpen);
export const useSetIsSessionModalOpenAction = () => useAppStore(selectSetIsSessionModalOpen);
