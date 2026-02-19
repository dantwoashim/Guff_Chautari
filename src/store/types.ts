import { ChatConfig, Conversation, Message, Persona } from '../../types';
import { KeyHealthStatus } from '../byok/types';

export interface AuthSessionShape {
  user?: {
    id?: string;
    email?: string | null;
  };
}

export interface AuthSlice {
  session: AuthSessionShape | null;
  isAuthLoading: boolean;
  byokStatus: KeyHealthStatus;
  byokFingerprint: string | null;
  setSession: (session: AuthSessionShape | null) => void;
  setAuthLoading: (isLoading: boolean) => void;
  setByokState: (status: KeyHealthStatus, fingerprint?: string | null) => void;
}

export interface ChatSlice {
  activeThreadId: string | null;
  threads: Conversation[];
  messagesByThread: Record<string, Message[]>;
  typingState: Record<string, boolean>;
  isConversationLoading: boolean;
  chatConfig: ChatConfig;
  setActiveThreadId: (threadId: string | null) => void;
  setThreads: (threads: Conversation[]) => void;
  upsertThread: (thread: Conversation) => void;
  setThreadMessages: (threadId: string, messages: Message[]) => void;
  appendThreadMessage: (threadId: string, message: Message) => void;
  updateThreadMessage: (threadId: string, messageId: string, updates: Partial<Message>) => void;
  setTypingState: (threadId: string, isTyping: boolean) => void;
  setConversationLoading: (isLoading: boolean) => void;
  setChatConfig: (config: ChatConfig) => void;
  patchChatConfig: (updates: Partial<ChatConfig>) => void;
}

export interface PersonaSlice {
  activePersonaId: string | null;
  personas: Persona[];
  personaRuntimeStates: Record<string, unknown>;
  setActivePersonaId: (personaId: string | null) => void;
  setPersonas: (personas: Persona[]) => void;
  setPersonaRuntimeState: (personaId: string, value: unknown) => void;
}

export interface UiSlice {
  isSidebarOpen: boolean;
  isSettingsOpen: boolean;
  isNewChatModalOpen: boolean;
  isSessionModalOpen: boolean;
  deleteModalState: { isOpen: boolean; chatId: string | null };
  showSqlSetup: boolean;
  isDarkMode: boolean;
  isFullscreen: boolean;
  currentView: string;
  navView: string;
  searchTerm: string;
  mobileView: 'list' | 'content';
  isChatListOpen: boolean;
  isAdminOpen: boolean;
  setIsSidebarOpen: (value: boolean) => void;
  setIsSettingsOpen: (value: boolean) => void;
  setIsNewChatModalOpen: (value: boolean) => void;
  setIsSessionModalOpen: (value: boolean) => void;
  setDeleteModalState: (value: { isOpen: boolean; chatId: string | null }) => void;
  setShowSqlSetup: (value: boolean) => void;
  setIsDarkMode: (value: boolean) => void;
  setIsFullscreen: (value: boolean) => void;
  setCurrentView: (value: string) => void;
  setNavView: (value: string) => void;
  setSearchTerm: (value: string) => void;
  setMobileView: (value: 'list' | 'content') => void;
  setIsChatListOpen: (value: boolean) => void;
  setIsAdminOpen: (value: boolean) => void;
}

export type AppStore = AuthSlice & ChatSlice & PersonaSlice & UiSlice;
