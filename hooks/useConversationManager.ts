
import { useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Conversation, Persona } from '../types';
import { useAppStore } from '../src/store';
import { conversationRepository, personaRepository } from '../src/data/repositories';

export const useConversationManager = (userId: string | null) => {
    const conversations = useAppStore((state) => state.threads) as Conversation[];
    const personas = useAppStore((state) => state.personas) as Persona[];
    const currentConversationId = useAppStore((state) => state.activeThreadId);
    const isLoading = useAppStore((state) => state.isConversationLoading);
    const setConversations = useAppStore((state) => state.setThreads);
    const setPersonas = useAppStore((state) => state.setPersonas);
    const setCurrentConversationId = useAppStore((state) => state.setActiveThreadId);
    const setConversationLoading = useAppStore((state) => state.setConversationLoading);

    const refreshConversations = useCallback(async () => {
        if (!userId) return;
        try {
            const data = await conversationRepository.listByUser(userId);
            setConversations(data);
        } catch (error) {
            console.error('Error fetching conversations:', error);
        }
    }, [userId]);

    const fetchPersonas = useCallback(async () => {
        if (!userId) return;
        try {
            const data = await personaRepository.listByUserOrGlobal(userId);
            setPersonas(data);
        } catch (error) {
            console.error('Error fetching personas:', error);
        }
    }, [userId]);

    // Initial Load
    useEffect(() => {
        if (userId) {
            setConversationLoading(true);
            Promise.all([refreshConversations(), fetchPersonas()]).finally(() => setConversationLoading(false));
        } else {
            setConversations([]);
            setPersonas([]);
        }
    }, [userId, refreshConversations, fetchPersonas, setConversations, setPersonas, setConversationLoading]);

    // Realtime Subscriptions
    useEffect(() => {
        if (!userId) return;

        // Subscribe to conversation changes
        const conversationChannel = supabase.channel(`conversations-${userId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `user_id=eq.${userId}` }, () => {
                refreshConversations();
            })
            .subscribe();

        // Subscribe to persona changes (Fixes 23503 by keeping list fresh)
        const personaChannel = supabase.channel(`personas-${userId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'personas', filter: `user_id=eq.${userId}` }, () => {
                fetchPersonas();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(conversationChannel);
            supabase.removeChannel(personaChannel);
        };
    }, [userId, refreshConversations, fetchPersonas]);

    /**
     * Select or create a conversation with a persona.
     * 
     * @param personaId - The persona to chat with
     * @param mode - How to handle existing conversations:
     *   - 'resume': Open the most recent existing conversation (default)
     *   - 'new_with_memory': Create new conversation with injected context summary
     *   - 'fresh': Create completely new conversation with no context
     * @returns The conversation ID that was selected/created
     */
    const selectPersona = useCallback(async (
        personaId: string,
        mode: 'resume' | 'new_with_memory' | 'fresh' = 'resume'
    ): Promise<string | undefined> => {
        if (!userId) {
            console.error('[ConversationManager] No userId, cannot select persona');
            return undefined;
        }

        // PRE-VALIDATION: Check if persona exists locally (soft check - don't block)
        const localPersona = personas.find(p => p.id === personaId);
        if (!localPersona) {
            console.warn(`[ConversationManager] Persona ${personaId} not found in local cache. Refreshing and continuing...`);
            // Refresh personas in background but don't block - persona might exist in DB
            fetchPersonas();
        }

        // Find ALL existing conversations with this persona, sorted by recency
        const existingChats = conversations
            .filter(c => c.persona_id === personaId)
            .sort((a, b) => {
                const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
                const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
                return timeB - timeA; // Most recent first
            });

        // MODE: Resume existing conversation
        if (mode === 'resume' && existingChats.length > 0) {
            const mostRecent = existingChats[0];
            console.log(`[ConversationManager] Resuming chat ${mostRecent.id} with persona ${personaId}`);
            setCurrentConversationId(mostRecent.id);
            return mostRecent.id;
        }

        // MODE: Create new conversation (both 'new_with_memory' and 'fresh' create new rows)
        try {
            console.log(`[ConversationManager] Creating new ${mode} chat with persona ${personaId}`);

            // Build initial context if memory mode
            let initialContext: any = null;
            if (mode === 'new_with_memory' && existingChats.length > 0) {
                const contextSummary = existingChats.slice(0, 3).map(chat => {
                    const preview = chat.last_message_text?.slice(0, 100) || '';
                    return `[Previous conversation ending: "${preview}..."]`;
                }).join('\n');
                initialContext = { memory_injection: contextSummary };
            }

            // Create new conversation in database
            let newConversation: { id: string };
            try {
                newConversation = await conversationRepository.createConversation({
                    userId,
                    personaId
                });
            } catch (error: any) {
                console.error('[ConversationManager] Failed to create conversation:', error);

                // FIX: Handle Foreign Key Violation (Persona Deleted)
                if (error.code === '23503') {
                    // 1. Optimistically remove from UI immediately
                    setPersonas(personas.filter(p => p.id !== personaId));

                    // 2. Alert user
                    alert("This Persona no longer exists in the database. The list has been refreshed.");

                    // 3. Sync with DB to be sure
                    fetchPersonas();
                }
                else if (error.code === 'PGRST204') {
                    alert("Database schema cache is stale. Please go to Settings -> SQL Setup and run the update script.");
                }
                return undefined;
            }

            // Create corresponding chat record for messages
            try {
                await conversationRepository.createChat({
                    id: newConversation.id,
                    userId,
                    personaId,
                    title: `Chat with ${personas.find(p => p.id === personaId)?.name || 'Persona'}`,
                    metadata: initialContext || {}
                });
            } catch (chatError) {
                console.error('[ConversationManager] Failed to create chat record:', chatError);
                // Rollback conversation creation if chat part fails
                await conversationRepository.deleteConversation(newConversation.id);
                return undefined;
            }

            // Refresh conversation list to include new entry
            await refreshConversations();

            // Select the new conversation
            setCurrentConversationId(newConversation.id);
            return newConversation.id;

        } catch (err) {
            console.error('[ConversationManager] Error in selectPersona:', err);
            return undefined;
        }
    }, [conversations, userId, personas, refreshConversations, fetchPersonas]);

    /**
     * Start a new chat with the currently active persona.
     * Creates a fresh conversation (does not resume existing).
     */
    const startNewChat = useCallback(async (personaId: string) => {
        // Force 'fresh' mode to always create a new conversation
        return selectPersona(personaId, 'fresh');
    }, [selectPersona]);

    const sortedConversations = useMemo(() => conversations, [conversations]);

    return {
        conversations: sortedConversations,
        personas,
        currentConversationId,
        setCurrentConversationId,
        isLoading,
        refreshConversations,
        selectPersona,
        startNewChat  // NEW: Exposed for "Start New Chat" button
    };
};
