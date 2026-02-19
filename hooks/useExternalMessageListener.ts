
/**
 * @file useExternalMessageListener.ts
 * @description Listens for new user messages from external sources (e.g., ASHIM ASI site)
 * and automatically generates AI responses.
 */
import React, { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { Message, ChatConfig, ChatSession } from '../types';
import { createChatSession, sendMessageStream, formatHistory } from '../services/geminiService';
import { messageRepository } from '../src/data';
import {
    initializeConsciousness,
    processInteraction as processAGI,
    generateResponseContext,
    generatePromptContext
} from '../services/agiConsciousness';
import { createHumanResponsePlan } from '../services/humanResponseService';

interface UseExternalMessageListenerProps {
    session: any;
    config: ChatConfig;
    sessions: ChatSession[];
    setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
    currentSessionId: string;
    isStreaming: boolean;
    currentView?: string;
    localMessageIdsRef?: React.MutableRefObject<Set<string>>;
    setMessages?: React.Dispatch<React.SetStateAction<Message[]>>;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Deterministic ID generator for external messages lacking IDs
const generateStableId = (content: string, timestamp: any) => {
    return `ext-${content.slice(0, 15)}-${timestamp}`;
};

/**
 * Get reply context by fetching the message being replied to
 * Handles: standard replies, replies to deleted messages, reply chains
 */
const buildReplyContext = (
    userMsg: Message,
    allMessages: Message[]
): { contextPrefix: string; referencedMessages: Message[] } => {
    if (!userMsg.replyToId) {
        return { contextPrefix: '', referencedMessages: [] };
    }

    const referencedMessages: Message[] = [];
    let currentReplyToId: string | undefined = userMsg.replyToId;
    const MAX_CHAIN_DEPTH = 3; // Don't go more than 3 levels deep
    let depth = 0;

    // Walk up the reply chain
    while (currentReplyToId && depth < MAX_CHAIN_DEPTH) {
        const msg = allMessages.find(m => m.id === currentReplyToId);
        if (!msg) break;

        referencedMessages.unshift(msg); // Add to front to maintain order
        currentReplyToId = msg.replyToId;
        depth++;
    }

    if (referencedMessages.length === 0) {
        return {
            contextPrefix: '[User is replying to a message that no longer exists]\n\n',
            referencedMessages: []
        };
    }

    // Build context string
    let contextPrefix = '';

    if (referencedMessages.length === 1) {
        // Simple reply
        const ref = referencedMessages[0];
        const sender = ref.role === 'model' ? 'You (AI) previously said' : 'The user previously said';
        const msgText = ref.text?.slice(0, 500) || '[attachment/media message]';
        const timestamp = ref.timestamp ? new Date(ref.timestamp).toLocaleString() : '';

        // Check for attachments
        let attachmentInfo = '';
        if (ref.attachments && ref.attachments.length > 0) {
            const types = ref.attachments.map(a => a.type).join(', ');
            attachmentInfo = ` [with ${ref.attachments.length} attachment(s): ${types}]`;
        }

        contextPrefix = `[REPLY CONTEXT - The user is directly responding to this specific message:]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${sender}: "${msgText}"${attachmentInfo}
${timestamp ? `(Sent: ${timestamp})` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[INSTRUCTION: The user's message below is a DIRECT RESPONSE to the quoted message above. Your response MUST acknowledge this context. If the original was about a topic (job, event, feeling), reference it specifically.]
`;
    } else {
        // Reply chain
        contextPrefix = `[REPLY CHAIN CONTEXT - Conversation thread being replied to:]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
        referencedMessages.forEach((ref, idx) => {
            const sender = ref.role === 'model' ? 'AI' : 'User';
            const msgText = ref.text?.slice(0, 200) || '[attachment]';
            contextPrefix += `${idx + 1}. ${sender}: "${msgText}"
`;
        });

        contextPrefix += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[The user is now continuing this thread. Respond with awareness of this full context.]
`;
    }

    return { contextPrefix, referencedMessages };
};

export const useExternalMessageListener = ({
    session,
    config,
    sessions,
    setSessions,
    currentSessionId,
    isStreaming,
    currentView,
    localMessageIdsRef,
    setMessages
}: UseExternalMessageListenerProps) => {
    // RACE FIX 1: Use Map with timestamps for duplicate checking
    const processingRef = useRef<Map<string, number>>(new Map());
    const queueRef = useRef<Promise<void>>(Promise.resolve());

    // Batching State
    const batchRef = useRef<{
        chatId: string;
        messages: Message[];
        timer: ReturnType<typeof setTimeout> | null;
        lastProcessedIndex: number;
    }>({
        chatId: '',
        messages: [],
        timer: null,
        lastProcessedIndex: -1
    });
    const BATCH_DELAY_MS = 3000; // Wait 3 seconds for consecutive messages

    // Always use latest refs
    const configRef = useRef(config);
    const currentSessionIdRef = useRef(currentSessionId);

    configRef.current = config;
    currentSessionIdRef.current = currentSessionId;

    useEffect(() => {
        const userId = session?.user?.id;
        if (!userId) return;

        // Cleanup interval for processing cache to prevent memory leaks
        const cleanupInterval = setInterval(() => {
            const now = Date.now();
            const cutoff = now - 60000; // 1 minute
            for (const [id, timestamp] of processingRef.current.entries()) {
                if (timestamp < cutoff) {
                    processingRef.current.delete(id);
                }
            }
        }, 60000);

        const channel = supabase
            .channel(`external-listener-${userId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'chats',
                    filter: `user_id=eq.${userId}`
                },
                async (payload) => {
                    const newData = payload.new;
                    const chatId = newData.id;
                    const messages: Message[] = newData.messages || [];

                    if (messages.length === 0) return;

                    // Get index offset based on whether we are continuing a batch in the same chat
                    const lastProcessedIdx = batchRef.current.chatId === chatId
                        ? batchRef.current.lastProcessedIndex
                        : -1;

                    // Find NEW user messages since last processed index
                    const newUserMessages: Message[] = [];
                    // We iterate from the last processed index + 1
                    const startIndex = lastProcessedIdx === -1 ? 0 : lastProcessedIdx + 1;

                    for (let i = startIndex; i < messages.length; i++) {
                        const msg = messages[i];

                        // We only care about USER messages for triggering responses
                        if (msg.role !== 'user') continue;

                        const msgId = msg.id || generateStableId(msg.text || '', msg.timestamp);

                        // Skip if local (we sent it)
                        if (localMessageIdsRef?.current.has(msgId)) continue;

                        // RACE FIX 1: Timestamp-based duplicate check
                        const now = Date.now();
                        const lastProcessed = processingRef.current.get(msgId);
                        // Skip if processed within last 5 seconds (debounce double-fires)
                        if (lastProcessed && (now - lastProcessed) < 5000) continue;

                        // Mark as seen immediately
                        processingRef.current.set(msgId, now);
                        newUserMessages.push(msg);
                    }

                    if (newUserMessages.length === 0) {
                        // Just update the index pointer if we processed everything
                        if (batchRef.current.chatId === chatId) {
                            batchRef.current.lastProcessedIndex = messages.length - 1;
                        }
                        return;
                    }

                    console.log(`[ExternalListener] Detected ${newUserMessages.length} new user message(s)`);

                    // Initialize or Update Batch
                    if (batchRef.current.chatId !== chatId) {
                        // New chat context, reset batch
                        if (batchRef.current.timer) clearTimeout(batchRef.current.timer);
                        batchRef.current = {
                            chatId,
                            messages: newUserMessages,
                            timer: null,
                            lastProcessedIndex: messages.length - 1
                        };
                    } else {
                        // Same chat, append messages
                        batchRef.current.messages.push(...newUserMessages);
                        batchRef.current.lastProcessedIndex = messages.length - 1;
                    }

                    // Reset Debounce Timer
                    if (batchRef.current.timer) {
                        clearTimeout(batchRef.current.timer);
                    }

                    batchRef.current.timer = setTimeout(() => {
                        const batchMessages = [...batchRef.current.messages];
                        const batchChatId = batchRef.current.chatId;

                        // Clear batch state
                        batchRef.current.messages = [];
                        batchRef.current.timer = null;

                        if (batchMessages.length === 0) return;

                        // Queue the response
                        queueRef.current = queueRef.current.then(async () => {
                            const isActiveSession = batchChatId === currentSessionIdRef.current;

                            // Fetch fresh history from DB to ensure we have context
                            const freshAllMessages = await messageRepository.getMessages(batchChatId);

                            // Filter out the batched messages from history to avoid duplication in prompt
                            const batchIds = new Set(batchMessages.map(m => m.id));
                            const historyMessages = freshAllMessages.filter(m => !batchIds.has(m.id));

                            await processBatchedMessages(
                                batchMessages,
                                batchChatId,
                                isActiveSession,
                                historyMessages
                            );
                        }).catch(err => console.error("[ExternalListener] Batch queue error:", err));

                    }, BATCH_DELAY_MS);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            clearInterval(cleanupInterval);
        };
    }, [session?.user?.id, setSessions, setMessages]); // Minimal deps

    /**
     * Process a BATCH of user messages as a single AI request
     */
    const processBatchedMessages = async (
        userMessages: Message[],
        chatId: string,
        isActiveSession: boolean,
        historyMessages: Message[]
    ) => {
        if (userMessages.length === 0) return;

        console.log(`[ExternalListener] Processing batch of ${userMessages.length} messages`);

        // 1. Mark all messages as read (DB & Local)
        // [SYNC] DB Update
        await messageRepository.markUserMessagesRead(chatId, { touchUpdatedAt: false });

        // [SYNC] Local UI - RACE FIX 3: Verify session ID
        if (isActiveSession && setMessages && chatId === currentSessionIdRef.current) {
            setMessages(prev => {
                const batchIds = new Set(userMessages.map(m => m.id));
                const needsUpdate = prev.some(m => batchIds.has(m.id) && m.status !== 'read');
                if (!needsUpdate) return prev;

                return prev.map(m => batchIds.has(m.id) ? { ...m, status: 'read' as const } : m);
            });
        }

        // 2. Show single typing indicator (Clean any existing first) - Prompt 4
        const aiMsgId = uuidv4();
        const placeholder: Message = {
            id: aiMsgId,
            role: 'model',
            text: '',
            timestamp: Date.now(),
            isTyping: true
        };

        if (isActiveSession && setMessages && chatId === currentSessionIdRef.current) {
            setMessages(prev => {
                // Ensure only ONE typing indicator exists
                const withoutTyping = prev.filter(m => !m.isTyping);
                return [...withoutTyping, placeholder];
            });
        }

        // FAILSAFE: Auto-remove typing indicator if request hangs - Prompt 4
        const typingTimeout = setTimeout(() => {
            console.warn('[ExternalListener] Typing timeout - removing stuck indicator');
            if (isActiveSession && setMessages && chatId === currentSessionIdRef.current) {
                setMessages(prev => prev.filter(m => m.id !== aiMsgId));
            }
        }, 60000);

        try {
            const baseConfig = configRef.current;

            // 3. Construct Combined Prompt WITH REPLY CONTEXT
            let combinedPrompt = '';

            if (userMessages.length === 1) {
                // Single message case - Full reply context if applicable
                const msg = userMessages[0];
                const { contextPrefix } = buildReplyContext(msg, historyMessages);
                combinedPrompt = contextPrefix + (msg.text || (msg.attachments?.length ? '[attachment]' : ''));
            } else {
                // Multiple messages case - Individual reply contexts
                combinedPrompt = `[The user sent ${userMessages.length} messages in quick succession. Respond to ALL of them naturally as a single response:]\n`;

                userMessages.forEach((msg, idx) => {
                    // Context includes previous batch messages for reference
                    const currentContext = historyMessages.concat(userMessages.slice(0, idx));
                    const { contextPrefix } = buildReplyContext(msg, currentContext);
                    const content = msg.text || (msg.attachments?.length ? '[attachment]' : '');

                    combinedPrompt += `\n--- Message ${idx + 1} ---\n`;
                    if (contextPrefix) combinedPrompt += `${contextPrefix}\n`;
                    combinedPrompt += `${content}\n`;
                });

                combinedPrompt += `\n[Respond to these messages together naturally, as if the user said all of this in one conversation turn. Don't respond to each separately.]`;
            }

            // 4. Build History & Config
            // Context history includes everything UP TO the batch
            const fullHistory = formatHistory(historyMessages);

            // AGI Context Injection
            let agiContext = "";
            try {
                const agiState = initializeConsciousness(chatId);
                // We use the combined text for AGI processing
                const combinedUserText = userMessages.map(m => m.text).join(' ');
                const updatedAgi = processAGI(agiState, combinedUserText, 'neutral');
                const responseCtx = generateResponseContext(updatedAgi, combinedUserText);
                agiContext = generatePromptContext(updatedAgi, responseCtx);
            } catch (e) { /* Ignore AGI fail */ }

            const effectiveConfig: ChatConfig = {
                ...baseConfig,
                agiContext,
                model: baseConfig.model || 'gemini-3-pro-preview',
                thinkingBudget: baseConfig.thinkingBudget ?? 10
            };

            // 5. Execute Generation
            const chatSession = await createChatSession(effectiveConfig, fullHistory);
            let fullText = "";
            let generatedImageUrl = "";
            let generatedCaption = "";
            let preText: string | undefined = undefined;

            await sendMessageStream(
                chatSession,
                combinedPrompt,
                [],
                (chunk) => { fullText += chunk; },
                async () => {
                    // Clear timeout as we are now processing completion - Prompt 4
                    clearTimeout(typingTimeout);

                    // Add delay for smooth transition from "thinking" to "responding" - Prompt 4
                    await delay(300);

                    // Remove placeholder
                    if (isActiveSession && setMessages && chatId === currentSessionIdRef.current) {
                        setMessages(prev => prev.filter(m => m.id !== aiMsgId));
                    }

                    // Generate Human Plan
                    const totalMessageCount = historyMessages.length + userMessages.length + 1;
                    const startTime = historyMessages.length > 0 ? historyMessages[0].timestamp : Date.now();
                    const lastUserMsg = userMessages[userMessages.length - 1];

                    const plan = createHumanResponsePlan(
                        fullText,
                        lastUserMsg.text.length,
                        historyMessages.concat(userMessages),
                        totalMessageCount,
                        startTime,
                        {
                            personaVibe: 'casual',
                            mood: 'normal'
                        }
                    );

                    // Build Sequence
                    const sequence = [];
                    if (preText) sequence.push({ text: preText, delay: 1000 });

                    plan.messages.forEach(m => {
                        sequence.push({ text: m.text, delay: m.typingDuration || 1500 });
                    });

                    if (generatedImageUrl) {
                        sequence.push({ text: "", imageUrl: generatedImageUrl, delay: 2000 });
                    }
                    if (generatedCaption && generatedCaption !== fullText.trim()) {
                        sequence.push({ text: generatedCaption, delay: 1500 });
                    }

                    // Execute Sequence
                    for (const item of sequence) {
                        // Show Typing
                        const typingId = 'typing-' + Date.now();
                        const typingMsg: Message = { id: typingId, role: 'model', text: '', isTyping: true, timestamp: Date.now() };

                        // RACE FIX 3: Check Session ID before UI update
                        if (isActiveSession && setMessages && chatId === currentSessionIdRef.current) {
                            setMessages(prev => [...prev, typingMsg]);
                        }

                        await delay(item.delay);

                        // Add Real Message
                        const realMsg: Message = {
                            id: uuidv4(),
                            role: 'model',
                            text: item.text || '',
                            timestamp: Date.now(),
                            attachments: (item as any).imageUrl ? [{
                                id: uuidv4(),
                                type: 'image',
                                url: (item as any).imageUrl,
                                mimeType: 'image/png'
                            }] : undefined
                        };

                        // Update Local State - RACE FIX 3: Check Session ID
                        if (isActiveSession && setMessages && chatId === currentSessionIdRef.current) {
                            setMessages(prev => {
                                const clean = prev.filter(m => m.id !== typingId && m.id !== aiMsgId);
                                return [...clean, realMsg];
                            });
                        }

                        // RACE FIX 2: Atomic DB Update using repository (RPC + fallback internally)
                        try {
                            await messageRepository.upsertMessage(chatId, realMsg);
                        } catch (e) {
                            console.error("[ExternalListener] DB Update Error:", e);
                        }

                        // Update Session List if needed (for sidebar preview)
                        if (setSessions) {
                            setSessions(prev => prev.map(s => {
                                if (s.id === chatId) {
                                    // Optimistic update for session list
                                    const currentMsgs = s.messages || [];
                                    return { ...s, messages: [...currentMsgs, realMsg] };
                                }
                                return s;
                            }));
                        }

                        await delay(300);
                    }
                },
                effectiveConfig,
                undefined,
                (url, caption, pt) => {
                    generatedImageUrl = url;
                    generatedCaption = caption;
                    preText = pt;
                },
                undefined,
                () => { },
                userMessages // Pass context messages for image inference
            );

        } catch (e) {
            clearTimeout(typingTimeout);
            console.error("Batch generation failed", e);
            if (isActiveSession && setMessages && chatId === currentSessionIdRef.current) {
                setMessages(prev => prev.filter(m => m.id !== aiMsgId));
            }
        }
    };
};
