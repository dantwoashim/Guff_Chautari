
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Message, ChatConfig, Attachment, ConversationTree, LivingPersona } from '../../types';
import type { HumanResponsePlan, PersonaContext } from '../../services/humanResponseService';
import { messageRepository } from '../../src/data';
import {
    enqueueMessage,
    listQueuedMessages,
    removeQueuedMessage,
    updateQueuedMessage
} from '../../src/offline/messageQueue';
import {
    createTraceId,
    trackTelemetryEvent
} from '../../src/observability/telemetry';
import {
    isShadowModeEnabled,
    linkTraceToAssistantMessage,
    recordShadowTrace
} from '../../src/observability/shadowMode';
import type { ResponseTimingModel } from '../../services/cognitiveArchitecture';

// 🔥 SOTA: Gemini Explicit Context Caching Feature Flag
// Set to true to use Gemini's explicit caching API for 42k+ personas
// This preserves FULL persona quality while reducing costs by ~75%
const USE_EXPLICIT_CACHING = true;

// Helper to wait
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isRemoteHttpUrl = (value: string | undefined): boolean => {
    return typeof value === 'string' && /^https?:\/\//i.test(value);
};

const extractBase64Payload = (attachment: Attachment): string => {
    if (attachment.data && attachment.data.length > 0) return attachment.data;
    if (attachment.url?.startsWith('data:')) {
        const payload = attachment.url.split(',')[1];
        return payload || '';
    }
    return '';
};

const attachmentToFile = (attachment: Attachment): File | null => {
    const base64Payload = extractBase64Payload(attachment);
    if (!base64Payload || typeof atob !== 'function') return null;

    try {
        const binary = atob(base64Payload);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        const fallbackExt = attachment.mimeType?.split('/')[1] || 'bin';
        const fallbackName = `attachment-${attachment.id}.${fallbackExt}`;
        const fileName = attachment.metadata?.name || fallbackName;

        return new File([bytes], fileName, {
            type: attachment.mimeType || 'application/octet-stream',
        });
    } catch {
        return null;
    }
};

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

interface RuntimeServiceModules {
    geminiService: typeof import('../../services/geminiService');
    humanResponseService: typeof import('../../services/humanResponseService');
    moodAnalysisService: typeof import('../../services/moodAnalysisService');
    modelManagerModule: typeof import('../../services/modelManager');
    agiConsciousness: typeof import('../../services/agiConsciousness');
    livingPersona: typeof import('../../services/livingPersona');
    memoryService: typeof import('../../services/memoryService');
    outputSanitizer: typeof import('../../services/outputSanitizer');
    conversationSummarizer: typeof import('../../services/conversationSummarizer');
    backgroundResponseManagerModule: typeof import('../../services/backgroundResponseManager');
    cognitiveArchitecture: typeof import('../../services/cognitiveArchitecture');
}

interface PipelineRuntimeModules {
    createPipelineOrchestrator: typeof import('@ashim/engine').createPipelineOrchestrator;
}

interface ByokRuntimeModules {
    BYOKKeyManager: typeof import('../../src/byok/keyManager').BYOKKeyManager;
    getRuntimeGeminiKey: typeof import('../../src/byok/runtimeKey').getRuntimeGeminiKey;
}

interface PluginRuntimeModules {
    listPluginTools: typeof import('../../src/plugins').listPluginTools;
    invokePluginTool: typeof import('../../src/plugins').invokePluginTool;
}

let runtimeServiceModulesPromise: Promise<RuntimeServiceModules> | null = null;
let pipelineRuntimeModulesPromise: Promise<PipelineRuntimeModules> | null = null;
let byokRuntimeModulesPromise: Promise<ByokRuntimeModules> | null = null;
let pluginRuntimeModulesPromise: Promise<PluginRuntimeModules> | null = null;

const loadRuntimeServiceModules = async (): Promise<RuntimeServiceModules> => {
    if (runtimeServiceModulesPromise) {
        return runtimeServiceModulesPromise;
    }

    runtimeServiceModulesPromise = Promise.all([
        import('../../services/geminiService'),
        import('../../services/humanResponseService'),
        import('../../services/moodAnalysisService'),
        import('../../services/modelManager'),
        import('../../services/agiConsciousness'),
        import('../../services/livingPersona'),
        import('../../services/memoryService'),
        import('../../services/outputSanitizer'),
        import('../../services/conversationSummarizer'),
        import('../../services/backgroundResponseManager'),
        import('../../services/cognitiveArchitecture'),
    ]).then(([
        geminiService,
        humanResponseService,
        moodAnalysisService,
        modelManagerModule,
        agiConsciousness,
        livingPersona,
        memoryService,
        outputSanitizer,
        conversationSummarizer,
        backgroundResponseManagerModule,
        cognitiveArchitecture,
    ]) => ({
        geminiService,
        humanResponseService,
        moodAnalysisService,
        modelManagerModule,
        agiConsciousness,
        livingPersona,
        memoryService,
        outputSanitizer,
        conversationSummarizer,
        backgroundResponseManagerModule,
        cognitiveArchitecture,
    }));

    return runtimeServiceModulesPromise;
};

const loadPipelineRuntimeModules = async (): Promise<PipelineRuntimeModules> => {
    if (pipelineRuntimeModulesPromise) {
        return pipelineRuntimeModulesPromise;
    }

    pipelineRuntimeModulesPromise = import('@ashim/engine')
        .then((orchestratorModule) => ({
            createPipelineOrchestrator: orchestratorModule.createPipelineOrchestrator,
        }));

    return pipelineRuntimeModulesPromise;
};

const loadByokRuntimeModules = async (): Promise<ByokRuntimeModules> => {
    if (byokRuntimeModulesPromise) {
        return byokRuntimeModulesPromise;
    }

    byokRuntimeModulesPromise = Promise.all([
        import('../../src/byok/keyManager'),
        import('../../src/byok/runtimeKey'),
    ]).then(([keyManagerModule, runtimeKeyModule]) => ({
        BYOKKeyManager: keyManagerModule.BYOKKeyManager,
        getRuntimeGeminiKey: runtimeKeyModule.getRuntimeGeminiKey,
    }));

    return byokRuntimeModulesPromise;
};

const loadPluginRuntimeModules = async (): Promise<PluginRuntimeModules> => {
    if (pluginRuntimeModulesPromise) {
        return pluginRuntimeModulesPromise;
    }

    pluginRuntimeModulesPromise = import('../../src/plugins')
        .then((pluginModule) => ({
            listPluginTools: pluginModule.listPluginTools,
            invokePluginTool: pluginModule.invokePluginTool,
        }));

    return pluginRuntimeModulesPromise;
};

const resolveGeminiApiKey = async (): Promise<string | null> => {
    const byok = await loadByokRuntimeModules();
    const runtimeKey = byok.getRuntimeGeminiKey()?.trim();
    if (runtimeKey) {
        return runtimeKey;
    }

    const decryptedKey = await byok.BYOKKeyManager.getDecryptedKey('gemini');
    return decryptedKey?.trim() || null;
};

const toPipelinePersona = (
    persona: LivingPersona | undefined,
    fallbackPersonaId: string,
    fallbackInstruction: string
) => {
    if (!persona) {
        return {
            id: fallbackPersonaId,
            name: 'Assistant',
            systemInstruction: fallbackInstruction || 'Respond naturally and stay context-aware.',
        };
    }

    const attachmentStyleCandidate = (persona as any)?.relationship_dynamics?.attachment_style
        || (persona as any)?.attachmentStyle;
    const attachmentStyle = ['secure', 'anxious', 'avoidant', 'disorganized'].includes(attachmentStyleCandidate)
        ? attachmentStyleCandidate
        : undefined;

    return {
        id: persona.id || fallbackPersonaId,
        name: persona.core?.name || 'Assistant',
        systemInstruction: persona.compiledPrompt || fallbackInstruction || 'Respond naturally and stay context-aware.',
        compiledPrompt: persona.compiledPrompt,
        attachmentStyle,
        emotionalDebt: typeof (persona as any)?.emotionalDebt === 'number'
            ? (persona as any).emotionalDebt
            : undefined,
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
    const offlineFlushQueueRef = useRef<Promise<void>>(Promise.resolve());

    // AGI MASTERCLASS: Non-stationary timing model for anti-detection
    const timingModelRef = useRef<ResponseTimingModel | null>(null);

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
            const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
            const services = isOnline ? await loadRuntimeServiceModules() : null;
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

                const attachmentType: Attachment['type'] = file.type.startsWith('audio/')
                    ? 'audio'
                    : file.type.startsWith('video/')
                        ? 'video'
                        : file.type.startsWith('image/')
                            ? 'image'
                            : 'file';
                const localDataUrl = base64Data ? `data:${file.type};base64,${base64Data}` : '';

                let uploadedUrl: string | null = null;
                if (isOnline && services) {
                    uploadedUrl = await services.geminiService.uploadFileToStorage(file, 'chat-assets', undefined, session.user.id);
                }

                if (uploadedUrl || localDataUrl) {
                    newAttachments.push({
                        id: uuidv4(),
                        type: attachmentType,
                        mimeType: file.type,
                        url: uploadedUrl || localDataUrl,
                        data: base64Data, // Use existing 'data' field for base64
                        metadata: { name: file.name, size: file.size }
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
                messageRepository
                    .markUserMessagesRead(currentSessionIdRef.current, { touchUpdatedAt: false })
                    .catch((error) => {
                        console.error("[ReadReceipt] Failed to sync:", error);
                    });
            }

            return updated;
        });
    }, [setMessages]);

    const updateLocalMessageStatus = useCallback((messageId: string, status: Message['status']) => {
        setMessages(prev => prev.map((message) => (
            message.id === messageId ? { ...message, status } : message
        )));
    }, [setMessages]);

    const persistMessageToChat = useCallback(async (sessionId: string, message: Message) => {
        await messageRepository.upsertMessage(sessionId, message);
    }, []);

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
            const services = await loadRuntimeServiceModules();

            // [AGI MASTERCLASS] Non-stationary initial delay
            // Uses drifting distribution with autocorrelation - statistically undetectable
            const timingModel = timingModelRef.current || services.cognitiveArchitecture.initializeTimingModel();
            const timingResult = services.cognitiveArchitecture.generateNextDelay(timingModel);
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
                for await (const humanMsg of services.humanResponseService.streamHumanResponse(plan, typingCallback)) {
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
        replyToId: string | undefined,
        traceId?: string
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

        if (traceId) {
            linkTraceToAssistantMessage({
                traceId,
                assistantMessageId: newMessageId,
            });
        }

        // Update DB regardless of which session user is viewing
        void (async () => {
            try {
                await messageRepository.upsertMessage(sessionId, newMessage);
            } catch (error) {
                console.error('[Session] Failed to persist model message:', error);
            }
        })();

        // Only update UI state if user is still on the same session
        if (isActiveSession) {
            setMessages(current => {
                // Avoid duplicates
                if (current.some(m => m.id === newMessageId)) return current;
                return [...current, newMessage];
            });
        }
    };

    const executePipelineMessages = async (
        messages: Array<{
            text: string;
            delayBefore: number;
            typingDuration: number;
            readDelay: number;
            revision?: { shouldRevise: boolean; pauseMs: number };
        }>,
        sessionId: string,
        replyToId: string | undefined,
        signal: AbortSignal,
        traceId?: string
    ) => {
        let hasReplied = false;

        for (const pipelineMessage of messages) {
            if (signal.aborted) {
                setIsTyping(false);
                return;
            }

            const preDelay = Math.max(0, (pipelineMessage.delayBefore || 0) + (pipelineMessage.readDelay || 0));
            if (preDelay > 0) {
                await delay(preDelay);
            }

            if (signal.aborted) {
                setIsTyping(false);
                return;
            }

            setIsTyping(true);
            await delay(Math.max(120, pipelineMessage.typingDuration || 0));

            if (pipelineMessage.revision?.shouldRevise && (pipelineMessage.revision.pauseMs || 0) > 0) {
                await delay(pipelineMessage.revision.pauseMs);
            }

            if (signal.aborted) {
                setIsTyping(false);
                return;
            }

            setIsTyping(false);
            addMessageToState(
                pipelineMessage.text,
                undefined,
                sessionId,
                !hasReplied ? replyToId : undefined,
                traceId
            );
            hasReplied = true;
        }
    };

    const processAIResponse = async (contextSnapshot?: { sessionId: string; traceId?: string }) => {
        // PROMPT F4: Use captured context if provided, else use current refs
        const sessionId = contextSnapshot?.sessionId || currentSessionIdRef.current;
        const traceId = contextSnapshot?.traceId || createTraceId('msg');

        // FRESHNESS CHECK: If the session ID changed since the debounce started, abort.
        if (sessionId !== currentSessionIdRef.current) {
            console.log('[Debounce] Session changed, aborting response generation.');
            return;
        }

        const currentConfig = configRef.current;
        const userId = sessionRef.current?.user?.id;
        if (!sessionId || !userId) return;

        const services = await loadRuntimeServiceModules();
        const bgResponseManager = services.backgroundResponseManagerModule.bgResponseManager;

        const controller = new AbortController();
        // Track abort controller per session for concurrent responses
        sessionAbortControllers.current.set(sessionId, controller);
        const signal = controller.signal;
        const finalizeResponseState = () => {
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

        setIsInternalProcessing(true);
        trackTelemetryEvent('ai.response.started', {
            session_id: sessionId,
            message_count: messagesRef.current.length
        }, traceId);

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

            const history = services.geminiService.formatHistory(historyMessages);

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
            finalizeResponseState();
            return;
        }

        markUserMessagesAsRead();

        const geminiApiKey = await resolveGeminiApiKey();
        if (!geminiApiKey) {
            const errorMessage = 'Gemini key unavailable. Re-open BYOK setup and validate your key.';
            bgResponseManager.errorResponse(sessionId, errorMessage);
            trackTelemetryEvent('ai.response.failed', {
                session_id: sessionId,
                message: errorMessage
            }, traceId);
            if (!signal.aborted) {
                addMessageToState('Your Gemini key is missing. Open BYOK settings and validate your key.', undefined, sessionId, undefined);
            }
            finalizeResponseState();
            return;
        }

        // 🔥 PARALLEL CONTEXT FETCHING - Run independent async operations together
        // Pattern from react-best-practices: async-parallel
        const contextPersonaId = currentConfig.livingPersona?.id || (currentConfig as any).personaId || 'default';
        const contextPersonaName = currentConfig.livingPersona?.core?.name || 'AI';
        const HIERARCHICAL_THRESHOLD = 100;

        const [memoryResult, hierarchicalResult] = await Promise.all([
            // Memory Retrieval
            (async () => {
                try {
                    const relevantMemories = await services.memoryService.searchMemories(
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
                        const hierarchical = await services.conversationSummarizer.buildHierarchicalContext(
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

            const attentionState = services.cognitiveArchitecture.applyAttentionFilter(contextData.promptText, {
                currentCapacity: isTired ? 0.6 : 0.9,  // Reduced capacity when tired
                emotionalBias: ['tired', 'upset', 'stressed'].includes(currentMood) ? 0.5 : 0.2,
                currentMood
            });

            // Generate context injection about what was focused on / missed
            if (attentionState.missedSegments.length > 0 || attentionState.misunderstoodSegments.length > 0) {
                attentionContext = services.cognitiveArchitecture.generateAttentionContextInjection(attentionState);
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
                    currentState = services.agiConsciousness.initializeConsciousness(currentSessionIdRef.current);
                    agiLogic.setAgiState(currentState);
                }

                // 2. Process AGI Consciousness (internal state update only)
                if (currentState) {
                    const userText = contextData.contextMessages.map(m => m.text).join('\n');
                    const updatedState = services.agiConsciousness.processInteraction(currentState, userText, 'neutral');
                    agiLogic.setAgiState(updatedState);
                    if (agiLogic.saveAGIState) agiLogic.saveAGIState();
                    // NOTE: Omitting verbose consciousness context injection
                }

                // 3. Living Persona - ESSENTIAL MODIFIERS ONLY
                if (currentLiving) {
                    const lifeData = services.livingPersona.getLivingPersonaContext(currentLiving);
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
        const finalPromptText = `${memoryContext}${hierarchicalContext}${attentionContext ? `\n${attentionContext}\n` : '\n'}${contextData.promptText}`;

        const latestUserMessage = contextData.contextMessages[contextData.contextMessages.length - 1];

        // Pipeline-only path for all turns, including attachment turns.
        if (!latestUserMessage) {
            const pipelineErrorMessage = 'No user message available for pipeline execution.';
            bgResponseManager.errorResponse(sessionId, pipelineErrorMessage);
            trackTelemetryEvent('ai.response.failed', {
                session_id: sessionId,
                message: pipelineErrorMessage,
                pipeline: true
            }, traceId);
            finalizeResponseState();
            return;
        }

        try {
                const { createPipelineOrchestrator } = await loadPipelineRuntimeModules();
                const pluginRuntime = await loadPluginRuntimeModules();
                const availablePluginTools = pluginRuntime
                    .listPluginTools()
                    .map((entry) => `${entry.pluginId}.${entry.tool.id}`);
                const orchestrator = createPipelineOrchestrator();

                const pipelineResult = await orchestrator.run({
                    threadId: sessionId,
                    userId,
                    personaId: contextPersonaId,
                    userMessage: latestUserMessage,
                    timestamp: latestUserMessage.timestamp || Date.now(),
                    abortSignal: signal,
                    provider: 'gemini',
                    model: currentConfig.model || 'gemini-2.5-flash',
                    apiKey: geminiApiKey,
                    temperature: currentConfig.temperature,
                    persona: toPipelinePersona(
                        currentConfig.livingPersona,
                        contextPersonaId,
                        currentConfig.systemInstruction
                    ),
                    pluginTools: availablePluginTools.length > 0 ? {
                        allowedToolIds: availablePluginTools,
                        invoke: async (toolId, payload) => {
                            const dotIndex = toolId.indexOf('.');
                            if (dotIndex === -1) {
                                return {
                                    ok: false,
                                    denied: true,
                                    summary: `Invalid plugin tool id "${toolId}".`,
                                };
                            }

                            const pluginId = toolId.slice(0, dotIndex);
                            const pluginToolId = toolId.slice(dotIndex + 1);

                            const outcome = await pluginRuntime.invokePluginTool({
                                userId,
                                pluginId,
                                toolId: pluginToolId,
                                toolPayload: payload,
                            });

                            if (outcome.decision.decision !== 'allow') {
                                return {
                                    ok: false,
                                    denied: true,
                                    summary: `Policy ${outcome.decision.decision}: ${outcome.decision.reason}`,
                                };
                            }

                            return {
                                ok: outcome.result?.ok ?? false,
                                summary: outcome.result?.summary ?? 'Plugin tool executed with no summary.',
                                data: outcome.result?.data,
                            };
                        },
                    } : undefined,
                }, {
                    maxRetries: 1,
                    retryDelayMs: 150,
                });

                if (pipelineResult.llm.cancelled || pipelineResult.llm.timedOut || pipelineResult.llm.text.trim().length === 0) {
                    throw new Error('Pipeline produced no usable response payload.');
                }

                let chunkCount = 0;
                for (const chunk of pipelineResult.llm.chunks) {
                    if (!chunk.text) continue;
                    chunkCount += 1;
                    if (chunkCount % 10 === 0) {
                        trackTelemetryEvent('ai.response.chunk', {
                            session_id: sessionId,
                            chunk_count: chunkCount
                        }, traceId);
                    }
                    bgResponseManager.addChunk(sessionId, chunk.text);
                }

                const strategicDelayMs = pipelineResult.humanized.strategicNonResponse.shouldDelay
                    ? pipelineResult.humanized.strategicNonResponse.delayMs
                    : 0;
                if (strategicDelayMs > 0) {
                    await delay(strategicDelayMs);
                }

                if (isShadowModeEnabled()) {
                    recordShadowTrace({
                        traceId,
                        sessionId,
                        userMessageId: latestUserMessage.id,
                        assistantMessageIds: [],
                        createdAtIso: new Date().toISOString(),
                        model: pipelineResult.llm.model,
                        provider: pipelineResult.llm.providerId,
                        promptPreview: (pipelineResult.prompt.systemInstruction || '').slice(0, 480),
                        emotionalSummary: `${pipelineResult.emotional.surface.label} (${pipelineResult.emotional.surface.intensity.toFixed(2)})`,
                        memoryIds: pipelineResult.context.memories.map((memory) => memory.id),
                        stages: [
                            {
                                id: 'contextGatherer',
                                summary: `Retrieved ${pipelineResult.context.memories.length} memory hit(s).`,
                                detail: `Relationship stage: ${pipelineResult.context.relationship.stage}`,
                            },
                            {
                                id: 'identityResolver',
                                summary: `Identity variant ${pipelineResult.identity.variant} (${pipelineResult.identity.confidence.toFixed(2)}).`,
                            },
                            {
                                id: 'emotionalProcessor',
                                summary: `Surface emotion ${pipelineResult.emotional.surface.label}.`,
                                detail: pipelineResult.emotional.surface.rationale,
                            },
                            {
                                id: 'promptBuilder',
                                summary: `Prompt tiers estimated tokens: ${pipelineResult.prompt.tiers.estimatedTokens}.`,
                            },
                            {
                                id: 'llmCaller',
                                summary: `Provider ${pipelineResult.llm.providerId} model ${pipelineResult.llm.model}.`,
                            },
                            {
                                id: 'learner',
                                summary: `Extracted ${pipelineResult.learner.extractedMemories.length} memory update(s).`,
                            },
                        ],
                    });
                }

                playbackQueueRef.current = playbackQueueRef.current
                    .then(() => executePipelineMessages(
                        pipelineResult.humanized.messages,
                        sessionId,
                        contextData.lastUserMessageId,
                        signal,
                        traceId
                    ))
                    .catch((error) => console.error('Pipeline playback queue recovered from error:', error));

                await playbackQueueRef.current;
                if (signal.aborted) {
                    finalizeResponseState();
                    return;
                }

                bgResponseManager.completeResponse(sessionId);
                trackTelemetryEvent('ai.response.completed', {
                    session_id: sessionId,
                    output_chars: pipelineResult.llm.text.length,
                    chunk_count: Math.max(chunkCount, pipelineResult.humanized.messages.length),
                    pipeline: true
                }, traceId);
                finalizeResponseState();
                return;
        } catch (pipelineError) {
            const pipelineErrorMessage = 'I hit an internal pipeline error. Please retry your message.';
            console.error('[Pipeline] Response generation failed:', pipelineError);
            bgResponseManager.errorResponse(sessionId, pipelineErrorMessage);
            trackTelemetryEvent('ai.response.failed', {
                session_id: sessionId,
                message: pipelineError instanceof Error ? pipelineError.message : 'unknown',
                pipeline: true
            }, traceId);
            if (!signal.aborted) {
                addMessageToState(pipelineErrorMessage, undefined, sessionId, undefined);
            }
            finalizeResponseState();
            return;
        }

    };

    const flushQueuedMessagesForActiveSession = useCallback(async () => {
        if (typeof navigator === 'undefined' || !navigator.onLine) return;

        const activeSessionId = currentSessionIdRef.current;
        if (!activeSessionId) return;

        const queuedMessages = listQueuedMessages(activeSessionId);
        if (queuedMessages.length === 0) return;

        const services = await loadRuntimeServiceModules();

        for (const queued of queuedMessages) {
            const traceId = queued.traceId || createTraceId('msg');
            try {
                const normalizedAttachments = await Promise.all(
                    (queued.message.attachments || []).map(async (attachment) => {
                        if (isRemoteHttpUrl(attachment.url)) {
                            return attachment;
                        }

                        const recoveredFile = attachmentToFile(attachment);
                        if (!recoveredFile) {
                            if (attachment.url?.startsWith('data:')) {
                                return attachment;
                            }
                            throw new Error(`Attachment payload missing for ${attachment.metadata?.name || attachment.id}`);
                        }

                        const uploadedUrl = await services.geminiService.uploadFileToStorage(
                            recoveredFile,
                            'chat-assets',
                            undefined,
                            queued.userId
                        );
                        if (!uploadedUrl) {
                            throw new Error(`Attachment upload failed for ${attachment.metadata?.name || attachment.id}`);
                        }

                        return {
                            ...attachment,
                            url: uploadedUrl,
                        };
                    })
                );

                const queuedMessage: Message = {
                    ...queued.message,
                    attachments: normalizedAttachments,
                    status: 'sent'
                };

                await persistMessageToChat(queued.sessionId, queuedMessage);
                setMessages(prev => {
                    const exists = prev.some((message) => message.id === queuedMessage.id);
                    const nextState = !exists
                        ? [...prev, queuedMessage]
                        : prev.map((message) => (
                            message.id === queuedMessage.id
                                ? { ...message, ...queuedMessage, status: 'sent' }
                                : message
                        ));
                    messagesRef.current = nextState;
                    return nextState;
                });
                removeQueuedMessage(queued.queueId);

                trackTelemetryEvent('message.user.flushed_from_queue', {
                    session_id: queued.sessionId,
                    message_id: queuedMessage.id,
                    attachment_count: queuedMessage.attachments?.length || 0
                }, traceId);

                setTimeout(() => {
                    updateLocalMessageStatus(queuedMessage.id, 'delivered');
                }, 350);

                pendingProcessingTimeout.current = setTimeout(() => {
                    processAIResponse({
                        sessionId: queued.sessionId,
                        traceId
                    });
                }, 900);
            } catch (error) {
                updateQueuedMessage(queued.queueId, (existing) => ({
                    ...existing,
                    attempts: existing.attempts + 1,
                    lastError: error instanceof Error ? error.message : 'Unknown flush failure'
                }));

                trackTelemetryEvent('message.user.flush_failed', {
                    session_id: queued.sessionId,
                    queue_id: queued.queueId,
                    message: error instanceof Error ? error.message : 'unknown error'
                }, traceId);
            }
        }
    }, [persistMessageToChat, updateLocalMessageStatus]);

    useEffect(() => {
        const flush = () => {
            offlineFlushQueueRef.current = offlineFlushQueueRef.current
                .then(() => flushQueuedMessagesForActiveSession())
                .catch((error) => {
                    console.error('[OfflineQueue] Flush failed:', error);
                });
        };

        flush();
        window.addEventListener('online', flush);

        return () => {
            window.removeEventListener('online', flush);
        };
    }, [currentSessionId, flushQueuedMessagesForActiveSession]);

    const sendMessage = async (text: string, replyToId?: string) => {
        if ((!text.trim() && attachments.length === 0) || !currentSessionId || !session?.user?.id) return;
        const traceId = createTraceId('msg');
        const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;

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
            attachments,
            replyToId,
            status: isOnline ? 'sent' : 'queued'
        };

        localMessageIdsRef.current.add(userMessage.id);

        if (!isOnline) {
            setMessages(prev => {
                const nextState = [...prev, userMessage];
                messagesRef.current = nextState;
                return nextState;
            });
            enqueueMessage({
                queueId: userMessage.id,
                sessionId: currentSessionId,
                userId: session.user.id,
                message: userMessage,
                traceId,
                enqueuedAtIso: new Date().toISOString(),
                attempts: 0
            });
            setInputText('');
            setAttachments([]);

            trackTelemetryEvent('message.user.queued_offline', {
                session_id: currentSessionId,
                message_id: userMessage.id,
                attachment_count: userMessage.attachments?.length || 0
            }, traceId);
            return;
        }

        trackTelemetryEvent('message.user.sent', {
            session_id: currentSessionId,
            message_id: userMessage.id,
            attachment_count: userMessage.attachments?.length || 0
        }, traceId);

        let persistedState: Message[] = [];
        setMessages(prev => {
            const newState = [...prev, userMessage];
            messagesRef.current = newState;
            persistedState = newState;
            return newState;
        });
        if (persistedState.length > 0) {
            void messageRepository.upsertMessage(currentSessionId, userMessage).catch((error) => {
                console.error('[SendMessage] Failed to persist user message:', error);
            });
        }

        setInputText('');
        setAttachments([]);

        setTimeout(() => {
            let updatedSnapshot: Message[] = [];
            setMessages(prev => {
                const updated = prev.map(m => m.id === userMessage.id ? { ...m, status: 'delivered' as const } : m);
                updatedSnapshot = updated;
                return updated;
            });
            if (currentSessionIdRef.current && updatedSnapshot.length > 0) {
                const deliveredMessage = updatedSnapshot.find((message) => message.id === userMessage.id);
                if (!deliveredMessage) return;
                void messageRepository
                    .upsertMessage(currentSessionIdRef.current, deliveredMessage, { touchUpdatedAt: false })
                    .catch((error) => {
                        console.error('[SendMessage] Failed to persist delivered status:', error);
                    });
            }
        }, 600);

        // Debounce & Trigger AI Response with Context Capture (PROMPT F4)
        const contextSnapshot = {
            sessionId: currentSessionId,
            traceId
        };

        pendingProcessingTimeout.current = setTimeout(() => {
            processAIResponse(contextSnapshot);
        }, 1200);
    };

    const sendVoiceMessage = async (audioBlob: Blob, duration: number) => {
        if (!currentSessionId || !session?.user?.id) return;
        const traceId = createTraceId('msg');
        const geminiApiKey = await resolveGeminiApiKey();
        if (!geminiApiKey) {
            trackTelemetryEvent('message.voice.failed', {
                session_id: currentSessionId,
                reason: 'missing_byok_key'
            }, traceId);
            return;
        }
        const services = await loadRuntimeServiceModules();

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
        setMessages(prev => {
            const nextState = [...prev, optimisticMessage];
            messagesRef.current = nextState;
            return nextState;
        });

        try {
            // 2. Parallel Processing: Upload & Transcribe
            const file = new File([audioBlob], `voice_${Date.now()}.webm`, { type: audioBlob.type });

            const uploadPromise = services.geminiService.uploadFileToStorage(file, 'chat-assets', undefined, session.user.id);

            const transcriptPromise = new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = async () => {
                    const base64 = (reader.result as string).split(',')[1];
                    const text = await services.geminiService.transcribeAudio(base64, audioBlob.type);
                    resolve(text);
                };
            });

            const [storageUrl, transcript] = await Promise.all([uploadPromise, transcriptPromise]);

            if (!storageUrl) throw new Error("Voice message upload failed");

            // 3. Update Local State with Final Data
            setMessages(prev => {
                const nextState = prev.map(m => {
                    if (m.id === tempId) {
                        return {
                            ...m,
                            text: transcript || "", // Stored but hidden in UI
                            attachments: m.attachments?.map(a => ({ ...a, url: storageUrl })), // Switch to persistent URL
                            status: 'sent'
                        };
                    }
                    return m;
                });
                messagesRef.current = nextState;
                return nextState;
            });

            // 4. Persist to DB
            const finalMessage = {
                ...optimisticMessage,
                text: transcript || "",
                attachments: optimisticMessage.attachments?.map(a => ({ ...a, url: storageUrl })),
                status: 'sent'
            };

            await messageRepository.upsertMessage(currentSessionId, finalMessage as Message);

            // 5. Trigger AI Response
            const contextSnapshot = {
                sessionId: currentSessionId,
                traceId
            };
            trackTelemetryEvent('message.user.sent', {
                session_id: currentSessionId,
                message_id: tempId,
                voice: true
            }, traceId);
            pendingProcessingTimeout.current = setTimeout(() => {
                processAIResponse(contextSnapshot);
            }, 1000);

        } catch (e) {
            console.error("Failed to send voice message", e);
            setMessages(prev => {
                const nextState = prev.map(m => m.id === tempId ? { ...m, status: 'error' } : m);
                messagesRef.current = nextState;
                return nextState;
            });
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
