
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Conversation, Persona } from '../types';

export const useConversationManager = (userId: string | null) => {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [personas, setPersonas] = useState<Persona[]>([]);
    const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const refreshConversations = useCallback(async () => {
        if (!userId) return;
        try {
            const { data, error } = await supabase
                .from('conversations')
                .select(`
          *,
          persona:personas(*)
        `)
                .eq('user_id', userId)
                .order('last_message_at', { ascending: false });

            if (error) throw error;
            setConversations(data || []);
        } catch (error) {
            console.error('Error fetching conversations:', error);
        }
    }, [userId]);

    const fetchPersonas = useCallback(async () => {
        if (!userId) return;
        try {
            const { data, error } = await supabase
                .from('personas')
                .select('*')
                .or(`is_global.eq.true,user_id.eq.${userId}`)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('[ConversationManager] Error fetching personas:', error);
                throw error;
            }

            // Filter active global personas client-side
            const filteredData = (data || []).filter(p =>
                p.user_id === userId || (p.is_global && p.is_active !== false)
            );

            setPersonas(filteredData);
        } catch (error) {
            console.error('Error fetching personas:', error);
        }
    }, [userId]);

    // Initial Load
    useEffect(() => {
        if (userId) {
            setIsLoading(true);
            Promise.all([refreshConversations(), fetchPersonas()]).finally(() => setIsLoading(false));
        } else {
            setConversations([]);
            setPersonas([]);
        }
    }, [userId, refreshConversations, fetchPersonas]);

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
            const { data: newConversation, error } = await supabase
                .from('conversations')
                .insert({
                    user_id: userId,
                    persona_id: personaId,
                    created_at: new Date().toISOString(),
                    // updated_at omitted to rely on DB default/trigger and avoid schema cache errors
                    last_message_at: new Date().toISOString(),
                    last_message_text: null,
                    unread_count: 0,
                    is_pinned: false,
                    is_muted: false,
                    is_archived: false
                })
                .select('id, user_id, persona_id, created_at') // Explicit select to avoid PGRST204 on wildcards
                .single();

            if (error) {
                console.error('[ConversationManager] Failed to create conversation:', error);

                // FIX: Handle Foreign Key Violation (Persona Deleted)
                if (error.code === '23503') {
                    // 1. Optimistically remove from UI immediately
                    setPersonas(prev => prev.filter(p => p.id !== personaId));

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
            const { error: chatError } = await supabase
                .from('chats')
                .insert({
                    id: newConversation.id,
                    session_id: newConversation.id,
                    user_id: userId,
                    persona_id: personaId,
                    title: `Chat with ${personas.find(p => p.id === personaId)?.name || 'Persona'}`,
                    messages: [],
                    metadata: initialContext || {}, // Store context in chats table
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });

            if (chatError) {
                console.error('[ConversationManager] Failed to create chat record:', chatError);
                // Rollback conversation creation if chat part fails
                await supabase.from('conversations').delete().eq('id', newConversation.id);
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

    return {
        conversations,
        personas,
        currentConversationId,
        setCurrentConversationId,
        isLoading,
        refreshConversations,
        selectPersona,
        startNewChat  // NEW: Exposed for "Start New Chat" button
    };
};
