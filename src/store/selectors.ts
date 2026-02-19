import type { AppStore } from './types';

export const selectSession = (store: AppStore) => store.session;
export const selectIsAuthLoading = (store: AppStore) => store.isAuthLoading;

export const selectCurrentView = (store: AppStore) => store.currentView;
export const selectNavView = (store: AppStore) => store.navView;
export const selectSearchTerm = (store: AppStore) => store.searchTerm;
export const selectMobileView = (store: AppStore) => store.mobileView;
export const selectIsChatListOpen = (store: AppStore) => store.isChatListOpen;
export const selectIsAdminOpen = (store: AppStore) => store.isAdminOpen;

export const selectIsSettingsOpen = (store: AppStore) => store.isSettingsOpen;
export const selectIsNewChatModalOpen = (store: AppStore) => store.isNewChatModalOpen;
export const selectIsSessionModalOpen = (store: AppStore) => store.isSessionModalOpen;
export const selectDeleteModalState = (store: AppStore) => store.deleteModalState;

export const selectSetCurrentView = (store: AppStore) => store.setCurrentView;
export const selectSetNavView = (store: AppStore) => store.setNavView;
export const selectSetSearchTerm = (store: AppStore) => store.setSearchTerm;
export const selectSetMobileView = (store: AppStore) => store.setMobileView;
export const selectSetIsChatListOpen = (store: AppStore) => store.setIsChatListOpen;
export const selectSetIsAdminOpen = (store: AppStore) => store.setIsAdminOpen;
export const selectSetByokState = (store: AppStore) => store.setByokState;
export const selectSetIsSettingsOpen = (store: AppStore) => store.setIsSettingsOpen;
export const selectSetDeleteModalState = (store: AppStore) => store.setDeleteModalState;
export const selectSetIsNewChatModalOpen = (store: AppStore) => store.setIsNewChatModalOpen;
export const selectSetIsSessionModalOpen = (store: AppStore) => store.setIsSessionModalOpen;
