
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../../lib/supabase';
import { Message, ChatConfig, Attachment, ConversationTree, LivingPersona } from '../../types';
import { getOrCreateChatSession, sendMessageStream, formatHistory, uploadFileToStorage, transcribeAudio, invalidateChatSession, generateWithExplicitCache } from '../../services/geminiService';
import { createHumanResponsePlan, HumanResponsePlan, PersonaContext, streamHumanResponse } from '../../services/humanResponseService';
import { analyzeMoodFromConversation } from '../../services/moodAnalysisService';
import { modelManager } from '../../services/modelManager';
import { processInteraction, generateResponseContext, generatePromptContext, initializeConsciousness } from '../../services/agiConsciousness';
import { getLivingPersonaContext, processInteraction as processLivingInteraction } from '../../services/livingPersona';
import { searchMemories, extractMemoryFromConversation } from '../../services/memoryService';
import { sanitizeResponse, detectForbiddenPatterns } from '../../services/outputSanitizer';
import { buildHierarchicalContext, extractRelationshipUpdates } from '../../services/conversationSummarizer';
import { bgResponseManager } from '../../services/backgroundResponseManager';
// AGI Masterclass: Cognitive Architecture
import {
    applyAttentionFilter,
    generateAttentionContextInjection,
    initializeTimingModel,
    generateNextDelay,
    ResponseTimingModel,
    AttentionState
} from '../../services/cognitiveArchitecture';

// 🔥 SOTA: Gemini Explicit Context Caching Feature Flag
// Set to true to use Gemini's explicit caching API for 42k+ personas
// This preserves FULL persona quality while reducing costs by ~75%
const USE_EXPLICIT_CACHING = true;

// Helper to wait
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to extract persona context
const getPersonaContext = (persona: LivingPersona | undefined): PersonaContext => {
    if (!persona) return { vocabulary: [], emojiFrequency: 0.5, baseMood: 'neutral' };

    const emojiMap: Record<string, number> = {
        'none': 0, 'rare': 0.2, 'occasional': 0.5, 'frequent': 0.8
    };

    const emojiFreq = persona.communication?.emojiUsage ? emojiMap[persona.communication.emojiUsage] : 0.5;

    return {
        vocabulary: persona.communication?.signaturePhrases || [],
        emojiFrequency: emojiFreq,
        baseMood: persona.emotional_states?.baseline_state || 'neutral',
        emotionalState: persona.emotional_states,
    };
};

export const useSendMessage = (
    session: any,
    currentSessionId: string,
    config: ChatConfig,
    messages: Message[],
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
    branchTree: ConversationTree | null,
    loadBranchTree: (id: string) => void,
    localMessageIdsRef: React.MutableRefObject<Set<string>>,
    agiLogic: any
) => {
    const [inputText, setInputText] = useState('');
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [isUploading, setIsUploading] = useState(false);

    const [isInternalProcessing, setIsInternalProcessing] = useState(false);
    const [isTyping, setIsTyping] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Refs for logic
    const messagesRef = useRef(messages);
    const configRef = useRef(config);
    const currentSessionIdRef = useRef(currentSessionId);
    const sessionRef = useRef(session);
    const playbackQueueRef = useRef<Promise<void>>(Promise.resolve());

    // SMART INTERRUPTION REFS - Per-session abort controllers for concurrent persona responses
    const sessionAbortControllers = useRef<Map<string, AbortController>>(new Map());
    const pendingProcessingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    // AGI MASTERCLASS: Non-stationary timing model for anti-detection
    const timingModelRef = useRef<ResponseTimingModel>(initializeTimingModel());

    useEffect(() => {
        messagesRef.current = messages;
        configRef.current = config;
        currentSessionIdRef.current = currentSessionId;
        sessionRef.current = session;
    }, [messages, config, currentSessionId, session]);

    // Clean up on unmount ONLY - NOT on session change
    // This allows background responses to continue when switching personas
    useEffect(() => {
        return () => {
            // Only abort on unmount, not session change
            // Background responses should continue
            if (pendingProcessingTimeout.current) {
                clearTimeout(pendingProcessingTimeout.current);
            }
        };
    }, []);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0 && session?.user?.id) {
            setIsUploading(true);
            const newAttachments: Attachment[] = [];
            for (let i = 0; i < e.target.files.length; i++) {
                const file = e.target.files[i];

                // [FIX] Store base64 data NOW while we have the file object
                // This avoids CORS issues when trying to re-fetch from Supabase URL later
                const base64Data = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        const result = reader.result as string;
                        // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
                        const base64 = result.split(',')[1] || '';
                        resolve(base64);
                    };
                    reader.onerror = () => resolve('');
                    reader.readAsDataURL(file);
                });

                const url = await uploadFileToStorage(file, 'chat-assets', undefined, session.user.id);
                if (url) {
                    newAttachments.push({
                        id: uuidv4(),
                        type: file.type.startsWith('video/') ? 'video' : 'image',
                        mimeType: file.type,
                        url,
                        data: base64Data, // Use existing 'data' field for base64
                        metadata: { name: file.name }
                    });
                    console.log(`[Attachment] Stored ${file.name} with base64 (${base64Data.length} chars)`);
                }
            }
            setAttachments(prev => [...prev, ...newAttachments]);
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const markUserMessagesAsRead = useCallback(() => {
        setMessages(prev => {
            // Optimization: Only update if there are unread user messages
            const hasUnread = prev.some(m => m.role === 'user' && m.status !== 'read');
            if (!hasUnread) return prev;

            const updated = prev.map(m =>
                m.role === 'user' && m.status !== 'read'
                    ? { ...m, status: 'read' as const }
                    : m
            );

            // [SYNC] Persist read status to DB
            if (currentSessionIdRef.current) {
                supabase.from('chats')
                    .update({
                        messages: updated,
                        // We intentionally do NOT update updated_at here to prevent chat reordering just for read receipts
                    })
                    .eq('id', currentSessionIdRef.current)
                    .then(({ error }) => {
                        if (error) console.error("[ReadReceipt] Failed to sync:", error);
                    });
            }

            return updated;
        });
    }, [setMessages]);

    // Updated to use streamHumanResponse generator with robustness (Prompt F5)
    const executeMessagePlan = async (
        plan: HumanResponsePlan,
        generatedImageUrl: string,
        generatedCaption: string,
        preText: string | undefined,
        sessionId: string,
        replyToId: string | undefined,
        signal: AbortSignal
    ) => {
        let hasReplied = false;

        try {
            // [AGI MASTERCLASS] Non-stationary initial delay
            // Uses drifting distribution with autocorrelation - statistically undetectable
            const timingResult = generateNextDelay(timingModelRef.current);
            timingModelRef.current = timingResult.model;
            console.log('[Cognitive] Non-stationary delay:', timingResult.delay, 'ms',
                timingResult.model.burstMode ? '(BURST MODE)' : '');

            await delay(timingResult.delay);
            if (signal.aborted) return;

            // 1. Handle Pre-text (Tool usage announcement like "Hold on...")
            if (preText) {
                try {
                    setIsTyping(true);
                    await delay(1000 + Math.random() * 500);
                    if (signal.aborted) { setIsTyping(false); return; }
                    setIsTyping(false);
                    addMessageToState(preText, undefined, sessionId, replyToId);
                    hasReplied = true;
                    await delay(500);
                } catch (e) {
                    console.error("Error executing pre-text:", e);
                    // Continue to next steps despite pre-text failure
                }
            }

            // 2. Handle Generated Image
            if (generatedImageUrl) {
                try {
                    setIsTyping(true);
                    await delay(2000 + Math.random() * 1000); // Simulate upload/processing
                    if (signal.aborted) { setIsTyping(false); return; }
                    setIsTyping(false);

                    addMessageToState("", [{
                        id: uuidv4(),
                        type: 'image',
                        url: generatedImageUrl,
                        mimeType: 'image/png'
                    }], sessionId, !hasReplied ? replyToId : undefined);

                    hasReplied = true;
                    await delay(800);
                } catch (e) {
                    console.error("Error executing image delivery:", e);
                }
            }

            // 3. Stream Text Messages using Generator (Prompt D4)
            // This handles realistic typing delays, interruptions, and chunking
            const typingCallback = (typing: boolean) => setIsTyping(typing);

            try {
                for await (const humanMsg of streamHumanResponse(plan, typingCallback)) {
                    if (signal.aborted) {
                        setIsTyping(false);
                        return;
                    }

                    try {
                        addMessageToState(
                            humanMsg.text,
                            undefined,
                            sessionId,
                            !hasReplied ? replyToId : undefined
                        );
                        hasReplied = true;
                    } catch (innerErr) {
                        console.error("Error executing text chunk:", innerErr);
                        // Skip this chunk but try to continue or cleanup
                    }
                }
            } catch (streamErr) {
                console.error("Error in human response stream:", streamErr);
                // Fallback: If streaming failed completely, try to dump raw text if available from plan
                // But 'plan' object structure is complex. We'll rely on what has been delivered.
            }

            // 4. Handle Caption (if separate from text)
            if (generatedImageUrl && generatedCaption && generatedCaption.length > 0) {
                try {
                    setIsTyping(true);
                    await delay(1500);
                    if (signal.aborted) { setIsTyping(false); return; }
                    setIsTyping(false);

                    addMessageToState(generatedCaption, undefined, sessionId, undefined);
                } catch (e) {
                    console.error("Error executing caption:", e);
                }
            }
        } catch (err) {
            console.error("Fatal error in executeMessagePlan:", err);
        } finally {
            setIsTyping(false);
        }
    };

    const addMessageToState = (
        text: string,
        attachments: Attachment[] | undefined,
        sessionId: string,
        replyToId: string | undefined
    ) => {
        const newMessageId = uuidv4();

        // 🔥 FIX: Check if user is still viewing the SAME persona that sent the request
        // If user switched personas, we should NOT update UI (would show wrong persona's response)
        // But we SHOULD still update DB with correct sessionId
        const currentActiveSession = currentSessionIdRef.current;
        const isActiveSession = currentActiveSession === sessionId;

        if (!isActiveSession) {
            console.log(`[Session] Response for ${sessionId.slice(0, 8)}... arrived but user is now on ${currentActiveSession?.slice(0, 8)}... - updating DB only`);
        }

        // Always update DB (with correct sessionId)
        const newMessage: Message = {
            id: newMessageId,
            role: 'model',
            text,
            timestamp: Date.now(),
            attachments,
            replyToId
        };

        // Update DB regardless of which session user is viewing
        supabase.from('chats')
            .select('messages')
            .eq('id', sessionId)
            .single()
            .then(({ data, error }) => {
                if (error || !data) {
                    console.error('[Session] Failed to fetch current messages for DB update:', error);
                    return;
                }
                const currentDbMessages = data.messages || [];
                const updatedDbMessages = [...currentDbMessages, newMessage];

                return supabase.from('chats')
                    .update({
                        messages: updatedDbMessages,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', sessionId);
            });

        // Only update UI state if user is still on the same session
        if (isActiveSession) {
            setMessages(current => {
                // Avoid duplicates
                if (current.some(m => m.id === newMessageId)) return current;
                return [...current, newMessage];
            });
        }
    };

    const processAIResponse = async (contextSnapshot?: { sessionId: string }) => {
        // PROMPT F4: Use captured context if provided, else use current refs
        const sessionId = contextSnapshot?.sessionId || currentSessionIdRef.current;

        // FRESHNESS CHECK: If the session ID changed since the debounce started, abort.
        if (sessionId !== currentSessionIdRef.current) {
            console.log('[Debounce] Session changed, aborting response generation.');
            return;
        }

        const currentConfig = configRef.current;
        const userId = sessionRef.current?.user?.id;

        const controller = new AbortController();
        // Track abort controller per session for concurrent responses
        sessionAbortControllers.current.set(sessionId, controller);
        const signal = controller.signal;

        if (!sessionId || !userId) return;

        setIsInternalProcessing(true);

        // [BACKGROUND RESPONSE] Register job with background manager
        // LivingPersona has core.name, regular persona in config may have name directly
        const livingPersona = currentConfig.livingPersona;
        const personaName = livingPersona?.core?.name || (currentConfig as any)?.personaName || 'AI';
        const personaAvatar = currentConfig.personaAvatarUrl; // From ChatConfig
        const personaId = livingPersona?.id || 'default';
        bgResponseManager.startResponse(sessionId, personaId, personaName, personaAvatar);

        const prepareContext = () => {
            const allMessages = messagesRef.current;
            let lastModelIndex = -1;
            for (let i = allMessages.length - 1; i >= 0; i--) {
                if (allMessages[i].role === 'model' && !allMessages[i].isError) {
                    lastModelIndex = i;
                    break;
                }
            }
            const contextMessages = allMessages.slice(lastModelIndex + 1);
            if (contextMessages.length === 0) return null;

            const lastUserMessageId = contextMessages[contextMessages.length - 1].id;
            const userContentLength = contextMessages.reduce((acc, m) => acc + m.text.length, 0);

            // [AI QUALITY FIX v2] Smart History Windowing
            // Problem: Simple window loses emotionally significant context
            // Solution: Keep establishment + impactful middle + recent
            const MAX_RECENT = 12;
            const ESTABLISHMENT_MESSAGES = 2;

            const fullHistoryMessages = allMessages.slice(0, lastModelIndex + 1);
            let historyMessages: typeof allMessages;

            if (fullHistoryMessages.length <= MAX_RECENT + ESTABLISHMENT_MESSAGES + 3) {
                // Short conversation - use all history
                historyMessages = fullHistoryMessages;
            } else {
                // Long conversation - smart window
                const establishmentMsgs = fullHistoryMessages.slice(0, ESTABLISHMENT_MESSAGES);
                const recentMsgs = fullHistoryMessages.slice(-MAX_RECENT);

                // From the middle, extract HIGH-IMPACT exchanges
                const middle = fullHistoryMessages.slice(ESTABLISHMENT_MESSAGES, -MAX_RECENT);
                const impactful = middle.filter(m => {
                    if (!m.text) return false;
                    const text = m.text.toLowerCase();
                    // Substantial content
                    if (m.text.length > 200) return true;
                    // Questions (continuity markers)
                    if (m.text.includes('?')) return true;
                    // Emotional weight
                    if (/love|hate|feel|remember|told you|scared|happy|sad|secret|dream|hope|miss you/i.test(text)) return true;
                    // Persona-defining moments
                    if (/always|never|my favorite|i think|honestly|actually/i.test(text)) return true;
                    return false;
                });

                // Keep up to 5 impactful from middle
                const sampledMiddle = impactful.slice(-5);

                // Build coherent history with subtle gap indicator
                const gapCount = middle.length - sampledMiddle.length;
                if (gapCount > 0) {
                    const gapIndicator = {
                        role: 'model' as const,
                        text: `[${gapCount} routine exchanges]`,
                        id: 'gap-indicator',
                        timestamp: 0
                    };
                    historyMessages = [...establishmentMsgs, gapIndicator as any, ...sampledMiddle, ...recentMsgs];
                } else {
                    historyMessages = [...establishmentMsgs, ...sampledMiddle, ...recentMsgs];
                }

                console.log(`[Context] Smart window: ${fullHistoryMessages.length} → ${historyMessages.length} (kept ${sampledMiddle.length} impactful from ${middle.length} middle)`);
            }

            const history = formatHistory(historyMessages);

            let promptText = "";
            if (contextMessages.length > 1) {
                promptText = "The user has sent multiple messages in a row. Please respond to the full context of this burst:\n\n";
                promptText += contextMessages.map((m, i) => {
                    const content = m.attachments?.length ? `[User sent attachments] ${m.text}` : m.text;
                    return `[Message ${i + 1}]: ${content}`;
                }).join('\n');
            } else {
                const m = contextMessages[0];
                promptText = m.attachments?.length ? `[User sent attachments] ${m.text}` : m.text;
            }

            // INSERT REPLY LOGIC HERE
            const currentMessage = contextMessages[contextMessages.length - 1];
            if (currentMessage?.replyToId) {
                const referencedMessage = allMessages.find(m => m.id === currentMessage.replyToId);
                if (referencedMessage) {
                    const replyContext = `
[CONTEXT: User is replying to this specific message:]
---
${referencedMessage.role === 'model' ? 'You previously said' : 'User previously said'}: "${referencedMessage.text?.slice(0, 500) || '[attachment]'}"
${referencedMessage.timestamp ? `(Sent: ${new Date(referencedMessage.timestamp).toLocaleString()})` : ''}
---
[INSTRUCTION: The user's current message is a DIRECT RESPONSE to the above. Consider this context carefully when responding.]
`;
                    promptText = replyContext + "\n" + promptText;
                }
            }

            // [FIX] Only trigger image generation when user explicitly REQUESTS a photo
            // NOT when they're asking about an attached image (e.g., "can you see this image?")
            const hasAttachments = contextMessages.some(m => m.attachments && m.attachments.length > 0);
            const isAskingForPhoto = /send.*(pic|photo|selfie)|take.*selfie|show me.*(you|your|face)|can you send.*pic/i.test(promptText);

            if (!hasAttachments && isAskingForPhoto) {
                promptText += "\n\n[SYSTEM OVERRIDE: The user requested an image. You possess a 'generate_image' tool. You MUST call it. Do not refuse. Do not apologize.]";
            } else if (hasAttachments) {
                // User sent attachments - tell AI to analyze them, NOT generate new ones
                promptText += "\n\n[CONTEXT: The user has sent you image(s)/video(s). Look at and analyze what they sent. Do NOT call generate_image. Describe or respond to what you SEE in their attachment.]";
            }

            // 🔥 LONG RESPONSE MODE - Detect // message // markers for detailed responses
            const longResponseMatch = promptText.match(/\/\/\s*([\s\S]*?)\s*\/\//);
            if (longResponseMatch) {
                const cleanedRequest = longResponseMatch[1].trim();
                promptText = cleanedRequest + `\n\n[EXTENDED RESPONSE MODE ACTIVATED]
The user has requested a DETAILED, COMPREHENSIVE response. You MUST:
- Write at MINIMUM 1500+ words with vivid, immersive detail
- Develop every idea thoroughly with examples, nuance, and depth
- Use natural flowing paragraphs, NOT bullet points or lists
- If the response is very long, you may break it into natural parts
- Take your time - quality and depth over brevity
- Be extremely thorough and leave no aspect unexplored

This is not a request for a summary. Give the user everything.`;
                console.log('[LongResponse] Extended mode activated for:', cleanedRequest.slice(0, 50) + '...');
            }

            return {
                promptText,
                history,
                contextMessages,
                lastUserMessageId,
                userContentLength,
                totalMessageCount: allMessages.length,
                firstMessageTime: allMessages.length > 0 ? allMessages[0].timestamp : Date.now()
            };
        };

        const contextData = prepareContext();
        if (!contextData) {
            setIsInternalProcessing(false);
            return;
        }

        markUserMessagesAsRead();

        // 🔥 PARALLEL CONTEXT FETCHING - Run independent async operations together
        // Pattern from react-best-practices: async-parallel
        const contextPersonaId = currentConfig.livingPersona?.id || (currentConfig as any).personaId || 'default';
        const contextPersonaName = currentConfig.livingPersona?.core?.name || 'AI';
        const HIERARCHICAL_THRESHOLD = 100;

        const [memoryResult, hierarchicalResult] = await Promise.all([
            // Memory Retrieval
            (async () => {
                try {
                    const relevantMemories = await searchMemories(
                        userId,
                        contextData.promptText,
                        undefined,
                        5
                    );
                    if (relevantMemories.length > 0) {
                        return `\n[RELEVANT MEMORIES]:\n${relevantMemories.map(m => `- ${m.content}`).join('\n')}\n`;
                    }
                    return "";
                } catch (err) {
                    console.error("Memory retrieval error:", err);
                    return "";
                }
            })(),

            // Hierarchical Context (for 100+ messages)
            (async () => {
                try {
                    if (contextData.totalMessageCount > HIERARCHICAL_THRESHOLD) {
                        const hierarchical = await buildHierarchicalContext(
                            sessionId,
                            userId,
                            contextPersonaId,
                            messagesRef.current,
                            contextPersonaName
                        );
                        if (hierarchical.contextInjection) {
                            console.log(`[Hierarchical] Injected ${hierarchical.checkpointsUsed} checkpoint summaries for ${contextData.totalMessageCount} messages`);
                            return '\n' + hierarchical.contextInjection + '\n';
                        }
                    }
                    return "";
                } catch (err) {
                    console.error("[Hierarchical] Context build error:", err);
                    return "";
                }
            })()
        ]);

        const memoryContext = memoryResult;
        const hierarchicalContext = hierarchicalResult;

        // [AGI MASTERCLASS] Attention Filter - Simulate human selective attention
        // Humans don't process every word equally - they focus on emotional content and miss details
        let attentionContext = "";
        try {
            const currentHour = new Date().getHours();
            const isTired = currentHour >= 23 || currentHour < 6;
            const currentMood = agiLogic?.livingInstance?.personaState?.physicalState?.energyLevel < 0 ? 'tired' : 'neutral';

            const attentionState = applyAttentionFilter(contextData.promptText, {
                currentCapacity: isTired ? 0.6 : 0.9,  // Reduced capacity when tired
                emotionalBias: ['tired', 'upset', 'stressed'].includes(currentMood) ? 0.5 : 0.2,
                currentMood
            });

            // Generate context injection about what was focused on / missed
            if (attentionState.missedSegments.length > 0 || attentionState.misunderstoodSegments.length > 0) {
                attentionContext = generateAttentionContextInjection(attentionState);
                console.log('[Cognitive] Attention filter applied:', {
                    processed: attentionState.processedSegments.length,
                    missed: attentionState.missedSegments.length
                });
            }
        } catch (err) {
            console.error('[Cognitive] Attention filter error:', err);
        }

        // [INTEGRATION] AGI Consciousness & Living Persona (Prompt E2/E5)
        // [AI QUALITY FIX] Simplified context - only essential modifiers
        // Problem: Too much context noise drowns out conversation
        // Solution: Keep only mood/stage modifiers, omit verbose blocks
        let agiContextInjection = "";
        try {
            if (agiLogic) {
                let currentState = agiLogic.agiState;
                let currentLiving = agiLogic.livingInstance;

                // 1. Initialize if needed
                if (!currentState && userId) {
                    console.log('[AGI] Initializing consciousness for local session');
                    currentState = initializeConsciousness(currentSessionIdRef.current);
                    agiLogic.setAgiState(currentState);
                }

                // 2. Process AGI Consciousness (internal state update only)
                if (currentState) {
                    const userText = contextData.contextMessages.map(m => m.text).join('\n');
                    const updatedState = processInteraction(currentState, userText, 'neutral');
                    agiLogic.setAgiState(updatedState);
                    if (agiLogic.saveAGIState) agiLogic.saveAGIState();
                    // NOTE: Omitting verbose consciousness context injection
                }

                // 3. Living Persona - ESSENTIAL MODIFIERS ONLY
                if (currentLiving) {
                    const lifeData = getLivingPersonaContext(currentLiving);
                    const essentialModifiers: string[] = [];

                    // Only include the most impactful modifiers
                    if (lifeData.responseModifiers.moodModifier) {
                        essentialModifiers.push(lifeData.responseModifiers.moodModifier);
                    }
                    if (lifeData.responseModifiers.stageModifier) {
                        essentialModifiers.push(lifeData.responseModifiers.stageModifier);
                    }

                    // Inside jokes are high-value, include if present
                    if (lifeData.responseModifiers.insideJokeToUse) {
                        essentialModifiers.push(`[Maybe reference: "${lifeData.responseModifiers.insideJokeToUse}"]`);
                    }

                    if (essentialModifiers.length > 0) {
                        agiContextInjection = essentialModifiers.join('\n');
                        console.log(`[Context] Injecting ${essentialModifiers.length} essential modifiers (simplified)`);
                    }
                }

                // OMITTED: Verbose blocks (COGNITIVE STATE, AGI CONSCIOUSNESS, LIFE CONTEXT)
                // These were drowning out the actual conversation
            }
        } catch (err) {
            console.error('[AGI/Life] Processing failed:', err);
        }

        // Inject memories, hierarchical context (for long convos), AND user prompt
        const finalPromptText = `${memoryContext}${hierarchicalContext}\n${contextData.promptText}`;

        let currentModel = currentConfig.model || 'gemini-3-pro-preview';
        let retryCount = 0;
        const maxRetries = 1;

        while (retryCount <= maxRetries) {
            try {
                if (signal.aborted) return;

                const attemptConfig = {
                    ...currentConfig,
                    model: currentModel,
                    agiContext: agiContextInjection // AGI & Life Context injected here
                };

                // SOTA Token Optimization: Use cached session
                const { chat: chatSession, fromCache } = await getOrCreateChatSession(
                    sessionId, // conversationId
                    attemptConfig,
                    contextData.history
                );

                if (fromCache) {
                    console.log('[TokenOpt] Session reused - saved ~5K tokens');
                } else {
                    console.log('[TokenOpt] New session created and cached');
                }

                let fullResponseBuffer = "";
                let generatedImageUrl = "";
                let generatedCaption = "";
                let preText: string | undefined = undefined;

                await sendMessageStream(
                    chatSession,
                    finalPromptText, // Use prompt with memories
                    contextData.contextMessages.flatMap(m => m.attachments || []),
                    (chunk) => {
                        fullResponseBuffer += chunk;
                        // [BACKGROUND RESPONSE] Add chunk to background manager
                        bgResponseManager.addChunk(sessionId, chunk);
                    },
                    async () => {
                        // [CRITICAL FIX] Sanitize AI response to remove AI patterns
                        const sanitized = sanitizeResponse(fullResponseBuffer);
                        const { hasForbidden, detected } = detectForbiddenPatterns(fullResponseBuffer);
                        if (hasForbidden) {
                            console.warn('[Sanitize] Removed AI patterns:', detected);
                        }

                        // [INTEGRATION] Memory Extraction (Prompt E1)
                        if (userId) {
                            const interactionForMemory = [
                                ...contextData.contextMessages,
                                { role: 'model', text: sanitized, id: uuidv4(), timestamp: Date.now() } as Message
                            ];
                            // Fire and forget extraction
                            extractMemoryFromConversation(userId, interactionForMemory)
                                .catch(e => console.error("Memory extraction failed", e));

                            // [NEW] Update relationship state
                            const personaId = currentConfig.livingPersona?.id || (currentConfig as any).personaId || 'default';
                            extractRelationshipUpdates(userId, personaId, interactionForMemory)
                                .catch(e => console.error("Relationship update failed", e));
                        }

                        // [INTEGRATION] Update Living Persona State (Prompt E5)
                        if (agiLogic && agiLogic.livingInstance && agiLogic.setLivingInstance) {
                            // Update trust, relationship stage, and life events based on this interaction
                            const updatedInstance = processLivingInteraction(
                                agiLogic.livingInstance,
                                contextData.promptText,
                                sanitized
                            );
                            agiLogic.setLivingInstance(updatedInstance);
                        }

                        const allHistoryForAnalysis = [...messagesRef.current, ...contextData.contextMessages];
                        const moodAnalysis = analyzeMoodFromConversation(allHistoryForAnalysis);

                        const mappedMood = ['sad', 'angry', 'serious'].includes(moodAnalysis.mood)
                            ? 'upset'
                            : (['tired'].includes(moodAnalysis.mood) ? 'tired' : (moodAnalysis.mood === 'excited' ? 'excited' : 'normal'));

                        const mappedVibe = moodAnalysis.personaVibe === 'chaotic'
                            ? 'chaotic'
                            : (moodAnalysis.personaVibe === 'formal' ? 'formal' : 'casual');

                        const personaContext = getPersonaContext(currentConfig.livingPersona);

                        const plan = createHumanResponsePlan(
                            sanitized, // Use sanitized response instead of raw
                            contextData.userContentLength,
                            messagesRef.current, // PASS FULL HISTORY for abbreviation learning
                            contextData.totalMessageCount,
                            contextData.firstMessageTime,
                            {
                                personaVibe: mappedVibe,
                                mood: mappedMood,
                                enableInterruptions: true,
                                personaContext
                            }
                        );

                        // Use playback queue to prevent overlapping messages
                        playbackQueueRef.current = playbackQueueRef.current
                            .then(() => executeMessagePlan(plan, generatedImageUrl, generatedCaption, preText, sessionId, contextData.lastUserMessageId, signal))
                            .catch(err => console.error("Playback queue error recovered:", err));
                    },
                    attemptConfig,
                    signal,
                    (url, caption, pt) => {
                        generatedImageUrl = url;
                        generatedCaption = caption;
                        preText = pt;
                    },
                    undefined,
                    () => { },
                    contextData.contextMessages
                );

                // [BACKGROUND RESPONSE] Mark job complete
                bgResponseManager.completeResponse(sessionId);
                break;

            } catch (e: any) {
                if (e.name === 'AbortError' || e.message === 'Aborted') {
                    console.log('AI Response interrupted by user.');
                    break;
                }
                if (modelManager.isQuotaError(e)) {
                    console.warn(`[Quota Hit] Model ${currentModel} exhausted.`);
                    if (retryCount < maxRetries) {
                        currentModel = 'gemini-3-flash-preview';
                        retryCount++;
                        continue;
                    }
                }
                console.error(e);
                if (!signal.aborted) {
                    addMessageToState("Sorry, I encountered an error.", undefined, sessionId, undefined);
                }
                break;
            }
        }

        // Clean up this session's abort controller
        const thisController = sessionAbortControllers.current.get(sessionId);
        if (thisController === controller) {
            sessionAbortControllers.current.delete(sessionId);
            // Only update UI state if we're still on this session
            if (currentSessionIdRef.current === sessionId) {
                setIsInternalProcessing(false);
                setIsTyping(false);
            }
        }
    };

    const sendMessage = async (text: string, replyToId?: string) => {
        if ((!text.trim() && attachments.length === 0) || !currentSessionId || !session?.user?.id) return;

        // INTERRUPTION: Cancel any ongoing AI activity for THIS SESSION ONLY
        // Other sessions' responses should continue in background
        const existingController = sessionAbortControllers.current.get(currentSessionId);
        if (existingController) {
            existingController.abort();
            sessionAbortControllers.current.delete(currentSessionId);
            setIsTyping(false);
            setIsInternalProcessing(false);
        }

        if (pendingProcessingTimeout.current) {
            clearTimeout(pendingProcessingTimeout.current);
        }

        const userMessage: Message = {
            id: uuidv4(),
            role: 'user',
            text: text,
            timestamp: Date.now(),
            attachments: attachments,
            replyToId,
            status: 'sent'
        };

        localMessageIdsRef.current.add(userMessage.id);

        setMessages(prev => {
            const newState = [...prev, userMessage];
            messagesRef.current = newState;

            supabase.from('chats').update({
                messages: newState,
                updated_at: new Date().toISOString()
            }).eq('id', currentSessionId).then();

            return newState;
        });

        setInputText('');
        setAttachments([]);

        setTimeout(() => {
            setMessages(prev => {
                const updated = prev.map(m => m.id === userMessage.id ? { ...m, status: 'delivered' as const } : m);

                // [SYNC] Persist delivered status
                if (currentSessionIdRef.current) {
                    supabase.from('chats')
                        .update({ messages: updated })
                        .eq('id', currentSessionIdRef.current)
                        .then();
                }

                return updated;
            });
        }, 600);

        // Debounce & Trigger AI Response with Context Capture (PROMPT F4)
        const contextSnapshot = {
            sessionId: currentSessionId,
        };

        pendingProcessingTimeout.current = setTimeout(() => {
            processAIResponse(contextSnapshot);
        }, 1200);
    };

    const sendVoiceMessage = async (audioBlob: Blob, duration: number) => {
        if (!currentSessionId || !session?.user?.id) return;

        const tempId = uuidv4();
        const localUrl = URL.createObjectURL(audioBlob);

        // 1. Optimistic Update: Add message immediately with local URL and empty text
        const optimisticMessage: Message = {
            id: tempId,
            role: 'user',
            text: "", // Hidden for voice notes via CSS/Component logic
            timestamp: Date.now(),
            attachments: [{
                id: uuidv4(),
                type: 'audio',
                mimeType: audioBlob.type,
                url: localUrl,
                metadata: { name: 'Voice Message', size: audioBlob.size, duration }
            }],
            status: 'sending'
        };

        localMessageIdsRef.current.add(tempId);
        setMessages(prev => [...prev, optimisticMessage]);

        try {
            // 2. Parallel Processing: Upload & Transcribe
            const file = new File([audioBlob], `voice_${Date.now()}.webm`, { type: audioBlob.type });

            const uploadPromise = uploadFileToStorage(file, 'chat-assets', undefined, session.user.id);

            const transcriptPromise = new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = async () => {
                    const base64 = (reader.result as string).split(',')[1];
                    const text = await transcribeAudio(base64, audioBlob.type);
                    resolve(text);
                };
            });

            const [storageUrl, transcript] = await Promise.all([uploadPromise, transcriptPromise]);

            if (!storageUrl) throw new Error("Voice message upload failed");

            // 3. Update Local State with Final Data
            setMessages(prev => prev.map(m => {
                if (m.id === tempId) {
                    return {
                        ...m,
                        text: transcript || "", // Stored but hidden in UI
                        attachments: m.attachments?.map(a => ({ ...a, url: storageUrl })), // Switch to persistent URL
                        status: 'sent'
                    };
                }
                return m;
            }));

            // 4. Persist to DB
            const finalMessage = {
                ...optimisticMessage,
                text: transcript || "",
                attachments: optimisticMessage.attachments?.map(a => ({ ...a, url: storageUrl })),
                status: 'sent'
            };

            // Fetch latest history to append safely
            const { data: chatData } = await supabase
                .from('chats')
                .select('messages')
                .eq('id', currentSessionId)
                .single();

            if (chatData) {
                const updatedHistory = [...(chatData.messages || []), finalMessage];
                await supabase
                    .from('chats')
                    .update({
                        messages: updatedHistory,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', currentSessionId);
            }

            // 5. Trigger AI Response
            const contextSnapshot = {
                sessionId: currentSessionId,
            };
            pendingProcessingTimeout.current = setTimeout(() => {
                processAIResponse(contextSnapshot);
            }, 1000);

        } catch (e) {
            console.error("Failed to send voice message", e);
            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'error' } : m));
        }
    };

    const handleRegenerate = useCallback((id: string) => { }, []);
    const handleEdit = useCallback((id: string, newText: string) => { }, []);
    const handlePaste = useCallback((e: React.ClipboardEvent) => { }, []);

    return {
        inputText,
        setInputText,
        attachments,
        setAttachments,
        isUploading,
        isStreaming: isTyping || isInternalProcessing,
        fileInputRef,
        handleFileSelect,
        sendMessage,
        sendVoiceMessage,
        handleRegenerate,
        handleEdit,
        handlePaste
    };
};
