export type SharedPlatform = 'web' | 'mobile';

export interface SharedMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  createdAtIso: string;
  pendingSync?: boolean;
}

export interface SharedConversation {
  id: string;
  title: string;
  lastMessageAtIso?: string;
  unreadCount: number;
}

export interface SharedSyncEvent {
  id: string;
  type: 'message.created' | 'message.synced' | 'workflow.approved' | 'knowledge.created';
  entityId: string;
  createdAtIso: string;
  payload?: Record<string, string | number | boolean | null>;
}

export interface SharedApiRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface SharedApiResponse<TData = unknown> {
  status: number;
  ok: boolean;
  data?: TData;
  error?: {
    code: string;
    message: string;
  };
}

export interface SharedStoreState {
  platform: SharedPlatform;
  activeConversationId: string | null;
  conversations: SharedConversation[];
  messagesByConversationId: Record<string, SharedMessage[]>;
  syncQueueDepth: number;
}
