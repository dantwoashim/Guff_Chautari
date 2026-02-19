import { useAppStore } from '../../store';
import {
  selectCurrentView,
  selectDeleteModalState,
  selectIsAdminOpen,
  selectIsAuthLoading,
  selectIsChatListOpen,
  selectIsNewChatModalOpen,
  selectIsSessionModalOpen,
  selectIsSettingsOpen,
  selectMobileView,
  selectNavView,
  selectSearchTerm,
  selectSession,
} from '../../store/selectors';

export const useSessionSelector = () => useAppStore(selectSession);
export const useAuthLoadingSelector = () => useAppStore(selectIsAuthLoading);

export const useCurrentViewSelector = () => useAppStore(selectCurrentView);
export const useNavViewSelector = () => useAppStore(selectNavView);
export const useSearchTermSelector = () => useAppStore(selectSearchTerm);
export const useMobileViewSelector = () => useAppStore(selectMobileView);
export const useIsChatListOpenSelector = () => useAppStore(selectIsChatListOpen);
export const useIsAdminOpenSelector = () => useAppStore(selectIsAdminOpen);

export const useIsSettingsOpenSelector = () => useAppStore(selectIsSettingsOpen);
export const useIsNewChatModalOpenSelector = () => useAppStore(selectIsNewChatModalOpen);
export const useIsSessionModalOpenSelector = () => useAppStore(selectIsSessionModalOpen);
export const useDeleteModalStateSelector = () => useAppStore(selectDeleteModalState);
