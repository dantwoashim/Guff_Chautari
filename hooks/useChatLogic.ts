
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ChatConfig, Message, Attachment, ConversationTree, Persona, LivingPersona } from '../types';
import { useConversationManager } from './useConversationManager';
import { useSessionManager } from './useSessionManager';
import { useMessages } from './chat/useMessages';
import { useSendMessage } from './chat/useSendMessage';
import { useAGI } from './chat/useAGI';
import { useExternalMessageListener } from './useExternalMessageListener';
import { useSpontaneousMessaging } from './useSpontaneousMessaging';
import { branchingService } from '../services/branchingService';
import { useAppStore } from '../src/store';
import { messageRepository } from '../src/data/repositories';

export const useChatLogic = () => {
    // --- Auth & Session State (Zustand) ---
    const session = useAppStore((state) => state.session);
    const isAuthLoading = useAppStore((state) => state.isAuthLoading);
    const setSession = useAppStore((state) => state.setSession);
    const setIsAuthLoading = useAppStore((state) => state.setAuthLoading);

    // --- UI State (Zustand) ---
    const isSidebarOpen = useAppStore((state) => state.isSidebarOpen);
    const isSettingsOpen = useAppStore((state) => state.isSettingsOpen);
    const isNewChatModalOpen = useAppStore((state) => state.isNewChatModalOpen);
    const isSessionModalOpen = useAppStore((state) => state.isSessionModalOpen);
    const deleteModalState = useAppStore((state) => state.deleteModalState);
    const showSqlSetup = useAppStore((state) => state.showSqlSetup);
    const isDarkMode = useAppStore((state) => state.isDarkMode);
    const isFullscreen = useAppStore((state) => state.isFullscreen);
    const currentView = useAppStore((state) => state.currentView);

    const setIsSidebarOpen = useAppStore((state) => state.setIsSidebarOpen);
    const setIsSettingsOpen = useAppStore((state) => state.setIsSettingsOpen);
    const setIsNewChatModalOpen = useAppStore((state) => state.setIsNewChatModalOpen);
    const setIsSessionModalOpen = useAppStore((state) => state.setIsSessionModalOpen);
    const setDeleteModalState = useAppStore((state) => state.setDeleteModalState);
    const setShowSqlSetup = useAppStore((state) => state.setShowSqlSetup);
    const setIsFullscreen = useAppStore((state) => state.setIsFullscreen);
    const setCurrentView = useAppStore((state) => state.setCurrentView);
    const setActivePersonaId = useAppStore((state) => state.setActivePersonaId);
    const config = useAppStore((state) => state.chatConfig);
    const setConfig = useAppStore((state) => state.setChatConfig);
    const patchConfig = useAppStore((state) => state.patchChatConfig);

    // --- Initialize Auth ---
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setIsAuthLoading(false);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setIsAuthLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    // --- Fullscreen Sync ---
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const handleToggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch((err) => {
                console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }, []);

    // --- Sub-Managers ---
    const conversationManager = useConversationManager(session?.user?.id);
    const sessionManager = useSessionManager(session?.user?.id);

    // We sync current session ID from conversation manager
    const currentSessionId = conversationManager.currentConversationId || '';
    const setCurrentSessionId = conversationManager.setCurrentConversationId;

    // --- Messages State ---
    const {
        messages,
        setMessages,
        messagesEndRef
    } = useMessages(currentSessionId || null);

    // Load Messages when Session Changes
    useEffect(() => {
        if (!currentSessionId) {
            setMessages([]);
            return;
        }
        const load = async () => {
            const storedMessages = await messageRepository.getMessages(currentSessionId);
            setMessages(storedMessages);
        };
        load();
    }, [currentSessionId, setMessages]);

    // Explicit refresh for background responses and notifications
    const refreshMessages = useCallback(async (sessionId?: string) => {
        const targetId = sessionId || currentSessionId;
        if (!targetId) return;

        console.log('[ChatLogic] Refreshing messages for session:', targetId);
        const storedMessages = await messageRepository.getMessages(targetId);
        setMessages(storedMessages);
    }, [currentSessionId, setMessages]);

    // --- Persona Logic ---
    // Load Persona for config when session changes
    const isProcessingPersona = sessionManager.isSwitching;

    useEffect(() => {
        const loadPersona = async () => {
            if (!currentSessionId || !session?.user?.id) return;

            const conversation = conversationManager.conversations.find(c => c.id === currentSessionId);
            if (conversation?.persona_id) {
                setActivePersonaId(conversation.persona_id);
                // Try to get from cache or process
                const persona = sessionManager.getPersona(conversation.persona_id)
                    || await sessionManager.processAndCachePersona(conversation.persona_id);

                if (persona) {
                    patchConfig({
                        personaId: conversation.persona_id, // [FIX] For per-persona reference images
                        livingPersona: persona,
                        personaAvatarUrl: conversation.persona?.avatar_url, // For notifications
                        systemInstruction: persona.compiledPrompt || config.systemInstruction
                    });
                }
            } else {
                // No persona (default chat)
                setActivePersonaId(null);
                patchConfig({ livingPersona: undefined });
            }
        };
        loadPersona();
    }, [currentSessionId, conversationManager.conversations, sessionManager, session?.user?.id, setActivePersonaId, patchConfig, config.systemInstruction]);

    // --- AGI Logic ---
    const agiLogic = useAGI(session, currentSessionId, config);

    // --- Branching Logic ---
    const [branchTree, setBranchTree] = useState<ConversationTree | null>(null);

    useEffect(() => {
        if (currentSessionId) {
            branchingService.getBranchTree(currentSessionId).then(setBranchTree);
        } else {
            setBranchTree(null);
        }
    }, [currentSessionId]);

    // --- Sending Messages ---
    const localMessageIdsRef = useRef<Set<string>>(new Set());

    const sendMessageHandlers = useSendMessage(
        session,
        currentSessionId,
        config,
        messages,
        setMessages,
        branchTree,
        (id) => branchingService.getBranchTree(id).then(setBranchTree),
        localMessageIdsRef,
        agiLogic
    );

    // --- Listeners ---
    useExternalMessageListener({
        session,
        config,
        sessions: [],
        setSessions: () => { },
        currentSessionId,
        isStreaming: sendMessageHandlers.isStreaming,
        currentView,
        localMessageIdsRef,
        setMessages
    });

    useSpontaneousMessaging(
        session?.user?.id,
        currentSessionId,
        !sendMessageHandlers.isStreaming,
        config.livingPersona?.core?.name || 'Ashim'
    );

    // --- Handlers Wrapper ---
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        sendMessageHandlers.handleFileSelect(e);
    };

    const handleNewChat = useCallback(() => {
        setIsNewChatModalOpen(true);
    }, []);

    /**
     * Handle persona selection from NewChatModal.
     */
    const handleSelectPersona = useCallback(async (personaId: string, withMemory: boolean) => {
        console.log(`[ChatLogic] handleSelectPersona: persona=${personaId}, withMemory=${withMemory}`);

        const mode = withMemory ? 'new_with_memory' : 'fresh';

        const newConversationId = await conversationManager.selectPersona(personaId, mode);

        if (newConversationId) {
            setCurrentSessionId(newConversationId);
            console.log(`[ChatLogic] New conversation started: ${newConversationId}`);
        }
        setIsNewChatModalOpen(false);
    }, [conversationManager, setCurrentSessionId]);

    /**
     * Handle "New Chat" action for CURRENT persona
     */
    const handleNewChatWithCurrentPersona = useCallback(async () => {
        // Get persona ID from current conversation (more reliable)
        const currentConversation = conversationManager.conversations.find(c => c.id === currentSessionId);
        const personaId = currentConversation?.persona_id || config.livingPersona?.id;

        if (!personaId) {
            console.warn('[ChatLogic] No persona ID available for new chat');
            return;
        }

        console.log('[ChatLogic] Starting new chat with persona:', personaId);
        const newConversationId = await conversationManager.selectPersona(personaId, 'fresh');
        if (newConversationId) {
            setCurrentSessionId(newConversationId);
        }
    }, [currentSessionId, conversationManager, config.livingPersona, setCurrentSessionId]);

    /**
     * Handle Branching Logic - Resume conversation from a specific message
     * Truncates messages after the fork point and saves old conversation as backup
     */
    const handleBranching = useCallback(async (messageId: string) => {
        if (!currentSessionId) return;

        const msgIndex = messages.findIndex(m => m.id === messageId);
        if (msgIndex === -1) return;

        try {
            // 1. Save current full conversation as a backup branch (for potential undo)
            const activeBranchId = branchTree?.activeBranchId || null;
            await branchingService.createBranch(
                currentSessionId,
                activeBranchId,
                messages.length - 1,
                `Backup ${new Date().toLocaleTimeString()}`
            ).catch(() => { }); // Don't fail if backup fails

            // 2. Truncate messages to fork point (include the clicked message)
            const truncatedMessages = messages.slice(0, msgIndex + 1);
            setMessages(truncatedMessages);

            // 3. Save truncated messages to DB immediately
            await messageRepository.saveMessages(currentSessionId, truncatedMessages);

            // 4. Refresh branch tree
            branchingService.getBranchTree(currentSessionId).then(setBranchTree).catch(() => { });

            // 5. Stay in chat view - user continues chatting from this point!
            console.log(`[Branching] Resumed from message ${msgIndex + 1}, discarded ${messages.length - msgIndex - 1} messages`);
        } catch (e) {
            console.error("Failed to resume conversation from point", e);
        }
    }, [currentSessionId, messages, branchTree, setMessages]);

    /**
     * Handle user clicking on a conversation in the list.
     */
    const handleUpdateCurrentSession = useCallback(async (id: string) => {
        console.log(`[ChatLogic] handleUpdateCurrentSession called with id: ${id}`);

        if (id.startsWith('virtual-')) {
            const personaId = id.replace('virtual-', '');
            const realId = await conversationManager.selectPersona(personaId, 'fresh');

            if (realId) {
                setCurrentSessionId(realId);
            } else {
                console.error('[ChatLogic] Failed to create new conversation for virtual click');
            }
        } else {
            setCurrentSessionId(id);
        }

        setIsSidebarOpen(false);
    }, [conversationManager, setCurrentSessionId, setIsSidebarOpen]);

    const handleSaveConfig = useCallback((newConfig: ChatConfig) => {
        setConfig(newConfig);
    }, [setConfig]);

    return {
        state: {
            isAuthLoading,
            session,
            conversations: conversationManager.conversations,
            currentSessionId,
            sessionManager,
            isSettingsOpen,
            isNewChatModalOpen,
            isSessionModalOpen,
            personas: conversationManager.personas,
            deleteModalState,
            showSqlSetup,
            isSidebarOpen,
            currentAshimSession: null,
            isDarkMode,
            currentView,
            config,
            isProcessingPersona,
            messages,
            attachments: sendMessageHandlers.attachments,
            isUploading: sendMessageHandlers.isUploading,
            inputText: sendMessageHandlers.inputText,
            isStreaming: sendMessageHandlers.isStreaming,
            hasMoreMessages: false,
            branchTree,
            isFullscreen
        },
        handlers: {
            updateCurrentSession: handleUpdateCurrentSession,
            handleNewChat,
            handleSelectPersona,
            handleNewChatWithCurrentPersona,
            handleBranching,
            fetchSessions: conversationManager.refreshConversations,
            setIsSettingsOpen,
            saveConfig: handleSaveConfig,
            setDeleteModalState,
            setIsNewChatModalOpen,
            setIsSessionModalOpen,
            setShowSqlSetup,
            setCurrentAshimSession: (_session: any) => { },
            setIsSidebarOpen,
            setCurrentView,
            setAttachments: sendMessageHandlers.setAttachments,
            handleFileSelect,
            setInputText: sendMessageHandlers.setInputText,
            sendMessage: sendMessageHandlers.sendMessage,
            sendVoiceMessage: sendMessageHandlers.sendVoiceMessage,
            handleRegenerate: sendMessageHandlers.handleRegenerate,
            handleEdit: sendMessageHandlers.handleEdit,
            handlePaste: sendMessageHandlers.handlePaste,
            loadMoreMessages: () => { },
            setMessages,
            toggleFullscreen: handleToggleFullscreen,
            refreshMessages
        },
        refs: {
            messagesEndRef,
            fileInputRef: sendMessageHandlers.fileInputRef
        }
    };
};
