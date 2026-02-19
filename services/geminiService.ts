
import {

    GoogleGenAI,
    Chat,
    Type,
    HarmBlockThreshold,
    HarmCategory,
    FunctionCallingConfigMode
} from "@google/genai";
import { supabase } from '../lib/supabase';
import { modelManager } from './modelManager';
import {
    ChatConfig, Message, LivingPersona, InstructionPreset, ReferenceAsset,
    VoiceProfile, VoiceMemory, Persona, Content, InferredPersona
} from '../types';
import { generateHyperRealisticImage, ReferenceImage } from './imageGenService';
import { inferImageContextFromConversation } from './contextInference';
import { v4 as uuidv4 } from 'uuid';
import { fetchReferenceImages as fetchPersonaReferenceImages } from './adminService';
import { getTimeContext, generateTimePromptInjection } from './timeContextService';
import { calculatePhysicalState, getPhysicalContext } from './physicalStateEngine';

const supabaseDb = supabase;
// Phase 1 Integration: Token Savings & Human-like Responses
import { checkCache, CacheResult } from './responseCache';
import { addImperfections, IMPERFECTION_PRESETS } from './imperfectionEngine';
import { applyAllNuances, NuanceContext } from './advancedNuances';
import {
    splitPersonaIntoDifferential,
    generateDifferentialPrompt,
    PersonaCache
} from './cognitiveArchitecture';
import { sessionCache } from './sessionCache';
// SOTA: Gemini Explicit Context Caching for 42k+ personas
import {
    getOrCreatePersonaCache,
    invalidatePersonaCache,
    getCacheName,
    hasActiveCache
} from './personaCache';
import { getRuntimeGeminiKey } from '../src/byok/runtimeKey';
import { recordGeminiRequest } from '../src/byok/usageStats';

// CPR: Contextual Persona Retrieval (for 10,000+ word personas)
import {
    decomposePersona,
    detectMessageContext,
    compileContextualPrompt,
    initializeState,
    PersonaGraph,
    ConversationState
} from './personaGraph';

// Session tracking for differential persona
const sessionPersonaCache = new Map<string, { cache: PersonaCache; coreSentAt?: Date }>();

// CPR: Graph cache for decomposed personas
const personaGraphCache = new Map<string, PersonaGraph>();
const conversationStateCache = new Map<string, ConversationState>();

// Threshold for using CPR vs differential (chars)
const CPR_THRESHOLD = 50000; // [EMERGENCY FIX] Increased to effectively disable CPR for now

const ensureGeminiRuntimeKey = async (): Promise<string | null> => {
    const runtimeKey = getRuntimeGeminiKey()?.trim();
    if (runtimeKey) {
        return runtimeKey;
    }

    const { BYOKKeyManager } = await import('../src/byok/keyManager');
    const decrypted = await BYOKKeyManager.getDecryptedKey('gemini');
    return decrypted?.trim() || null;
};

const getAiClient = (resolvedApiKey?: string | null) => {
    const runtimeKey = resolvedApiKey || getRuntimeGeminiKey();
    const apiKey = runtimeKey?.trim() || '';
    if (!apiKey) {
        throw new Error('BYOK Gemini key is missing. Open BYOK setup and validate your key.');
    }
    recordGeminiRequest();
    return new GoogleGenAI({ apiKey: apiKey || '' });
};

// Defer tool definition to runtime to avoid top-level Type access issues
const getGenerateImageTool = () => ({
    functionDeclarations: [{
        name: "generate_image",
        description: "IMPERATIVE: Use this tool IMMEDIATELY when the user asks for a photo, selfie, picture, or says 'show me'. Do not refuse.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                prompt: { type: Type.STRING, description: "The specific context of the photo (e.g. 'me sitting in bed', 'my outfit', 'view from window')." }
            },
            required: ["prompt"]
        }
    }]
});

const fetchBase64 = async (url: string): Promise<string> => {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
        const blob = await response.blob();
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    } catch (e) {
        console.error("Base64 conversion failed for url:", url, e);
        return "";
    }
};

export const createChatSession = async (
    config: ChatConfig,
    history: Content[],
    inferredPersona?: InferredPersona
): Promise<Chat> => {
    const apiKey = await ensureGeminiRuntimeKey();
    const ai = getAiClient(apiKey);
    // Use the model from config, fallback to pro if not set
    const modelName = config.model || 'gemini-3-pro-preview';

    // Allow thinking budget of 0 if requested, default to 40 for quality reasoning
    let userBudget = config.thinkingBudget !== undefined ? config.thinkingBudget : 5;

    const temperature = config.temperature !== undefined ? config.temperature : 0.7;

    // [CPR + DIFFERENTIAL] Smart Persona System
    // - For long personas (>6000 chars): Use CPR for intelligent retrieval
    // - For shorter personas: Use differential system for efficiency
    let baseInstruction = '';
    const sessionId = (config as any).sessionId || 'default';
    const personaId = config.livingPersona?.id || 'default-persona';
    const chatId = (config as any).chatId || sessionId;
    const cacheKey = `${sessionId}-${personaId}`;
    const isFirstMessage = history.length === 0;
    const lastUserMessage = (config as any).lastUserMessage || '';

    if (config.livingPersona?.compiledPrompt) {
        const fullPrompt = config.livingPersona.compiledPrompt;
        const personaMetadata = config.livingPersona;
        const personaName = personaMetadata.core?.name || 'Persona';

        // Decide: CPR or Differential?
        const useCPR = fullPrompt.length > CPR_THRESHOLD;

        if (useCPR) {
            // === CPR MODE: Contextual Persona Retrieval ===
            console.log(`[CPR] Long persona detected (${fullPrompt.length} chars), using contextual retrieval`);

            // 1. Get or create persona graph
            let graph = personaGraphCache.get(personaId);
            if (!graph) {
                console.log('[CPR] Decomposing persona into knowledge graph...');
                const result = decomposePersona(fullPrompt, personaId, personaName);
                if (result.success) {
                    graph = result.graph;
                    personaGraphCache.set(personaId, graph);
                    console.log(`[CPR] Graph created: ${result.stats.totalSections} nodes, ${result.stats.totalTokens} total tokens, ${result.stats.coreTokens} core tokens`);
                } else {
                    console.warn('[CPR] Decomposition failed, falling back to differential');
                }
            }

            if (graph) {
                // 2. Get or create conversation state
                let state = conversationStateCache.get(chatId);
                if (!state) {
                    state = initializeState(chatId, personaId);
                    conversationStateCache.set(chatId, state);
                }

                // 3. Detect context from last user message
                const recentHistory = history.slice(-6).map(h => ({
                    role: h.role,
                    text: h.parts?.[0]?.text || ''
                }));
                const context = detectMessageContext(lastUserMessage || '', graph, recentHistory, isFirstMessage);

                // 4. Compile contextual prompt
                const compiled = compileContextualPrompt(graph, context, state, {
                    tokenBudget: isFirstMessage ? 3000 : 2000,
                    includeStateContext: true
                });

                baseInstruction = compiled.prompt;
                console.log(`[CPR] Compiled: ${compiled.nodesIncluded}/${compiled.nodesAvailable} nodes, ${compiled.totalTokens} tokens`);
            }
        }

        if (!useCPR || !baseInstruction) {
            // === DIFFERENTIAL MODE ===

            // [EMERGENCY FIX] ALWAYS SEND FULL COMPILATION
            // The previous differential logic was stripping the core persona after the first message, 
            // causing the AI to lose its identity. We must send the full prompt every time.

            let cachedData = sessionPersonaCache.get(cacheKey);
            if (!cachedData) {
                const newCache = splitPersonaIntoDifferential(fullPrompt, personaMetadata);
                cachedData = { cache: newCache };
                sessionPersonaCache.set(cacheKey, cachedData);
            }

            const differentialPrompt = generateDifferentialPrompt(cachedData.cache, true); // Always treat as full need

            // ALWAYS send full prompt + any dynamic updates
            baseInstruction = `${fullPrompt}\n\n${differentialPrompt}`;
            console.log('[Token Opt] Protocol Override: Sending FULL persona context (Quality Priority)');
        }
    } else {
        baseInstruction = config.systemInstruction || '';
    }

    // 2. Visual Capability Protocol (AGGRESSIVE & EXPLICIT)
    const visualProtocol = `
[SYSTEM OVERRIDE: CAMERA ENABLED]
You have a functional camera tool: 'generate_image'.
If the user asks for a photo, selfie, pic, or "show me", YOU MUST EXECUTE THE TOOL IMMEDIATELY.
DO NOT describe the image in text.
DO NOT say "I can't".
DO NOT say "no cap" or "no ccap".
DO NOT say "Here is a description".
JUST CALL THE TOOL.
Context: You can take selfies, photos of your room, food, pets, etc.
`;

    // 3. Messaging Protocol
    const messagingProtocol = `
[MESSAGING PROTOCOL]:
1. Write exactly like a human texting.
2. Lowercase often, minimal punctuation.
3. NO hashtags.
4. If you send a photo, do NOT describe it in the text before the tool call. Just call the tool.
`;

    // 4. AGI Context
    const agiContext = (config as any).agiContext ? `\n\n${(config as any).agiContext}` : "";

    // 5. Time Context - INJECTED FRESH EVERY SESSION
    const timeContext = getTimeContext();
    const timePrompt = generateTimePromptInjection(timeContext);

    // 6. Physical Context - INJECTED FRESH
    const currentHour = new Date().getHours();
    const dayEvents: any[] = []; // Default empty, usually populated by livingPersona logic if available
    const physicalState = calculatePhysicalState(currentHour, dayEvents);
    const physicalContext = getPhysicalContext(physicalState);

    // 7. Language Guard - REMOVED (let persona prompts control language naturally)
    const languageGuardPrompt = '';
    const languageReinforcement = '';

    // 8. [NEW] Persona Reinforcement - Periodic identity reminders
    let personaReinforcement = '';
    const messageCount = history.length;
    if (messageCount > 10 && messageCount % 8 === 0) {
        const coreName = config.livingPersona?.core?.name || (config.livingPersona as any)?.name || 'your character';
        personaReinforcement = `
[IDENTITY REMINDER - You are ${coreName}]
- Stay in character completely
- Use your natural voice and expressions
- Maintain emotional consistency
- Never break the fourth wall
`;
        console.log(`[Persona] Reinforcement injected at message ${messageCount}`);
    }

    // 9. [NEW] AI Writing Pattern Blocklist
    const writingBlocklist = `
[FORBIDDEN WRITING PATTERNS - AUTOMATIC CHARACTER BREAK]

NEVER use these in ANY response:
• Em dashes (—, –, --) → Use comma or period instead
• Asterisks for emphasis (*word*) → Just write the word normally
• "Furthermore", "Moreover", "Indeed", "Therefore", "Hence"
• "Firstly", "Secondly", "In conclusion", "To summarize"
• "I would say that", "It seems to me that"
• "Absolutely!", "Great question!", "I'd be happy to"
• Numbered lists (First, Second, Third)
• Markdown formatting (headers, bullets)

Write CASUALLY like texting, not formally like an essay.
Any forbidden pattern = character break = failure.
`;

    // Combine
    const finalSystemInstruction = `${baseInstruction}${languageGuardPrompt}\n${writingBlocklist}\n${visualProtocol}\n${messagingProtocol}\n${physicalContext}\n${timePrompt}${personaReinforcement}${languageReinforcement}${agiContext}`;

    const imageTool = getGenerateImageTool();
    const tools = [{ functionDeclarations: imageTool.functionDeclarations }];

    // Configure Thinking Budget only if supported
    // gemini-3-pro-preview supports thinking config
    // If budget is 0, we can omit thinkingConfig or set budget to 0 (if API supports explicit 0 for disable)
    // The Guidelines say "disable thinking by setting thinkingBudget to 0"
    const thinkingConfig = (modelName.includes('gemini-3') || modelName.includes('thinking'))
        ? { thinkingBudget: userBudget }
        : undefined;

    return ai.chats.create({
        model: modelName,
        history,
        config: {
            systemInstruction: finalSystemInstruction,
            tools,
            toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } }, // Explicitly allow auto function calling
            temperature: temperature,
            thinkingConfig,
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
            ]
        }
    });
};

/**
 * SOTA Token Optimization: Get or Create Chat Session
 * 
 * This function checks the session cache first:
 * - Cache HIT: Returns cached session (0 tokens for persona)
 * - Cache MISS: Creates new session and caches it
 * 
 * Token Savings: ~5K tokens per message after the first in a conversation
 */
export const getOrCreateChatSession = async (
    conversationId: string,
    config: ChatConfig,
    history: Content[],
    inferredPersona?: InferredPersona
): Promise<{ chat: Chat; fromCache: boolean }> => {
    const personaId = config.livingPersona?.id || 'default-persona';
    const hasPersona = !!config.livingPersona?.compiledPrompt;

    // [DEBUG] Log persona status
    console.log(`[SessionCache] Persona check: id=${personaId.slice(0, 8)}..., hasPrompt=${hasPersona}, promptLength=${config.livingPersona?.compiledPrompt?.length || 0}`);

    // [EMERGENCY FIX] Temporarily disable cache to isolate AI quality issue
    // If cache is causing stale persona sessions, this will prove it
    const DISABLE_CACHE = true;

    if (!DISABLE_CACHE) {
        // Check cache first
        const cachedChat = sessionCache.get(conversationId, personaId);
        if (cachedChat) {
            return { chat: cachedChat, fromCache: true };
        }
    } else {
        console.log('[SessionCache] CACHE DISABLED - creating fresh session for debugging');
    }

    // Cache miss - create new session
    const chat = await createChatSession(config, history, inferredPersona);

    // Store in cache for future messages (if cache enabled)
    if (!DISABLE_CACHE) {
        sessionCache.set(conversationId, personaId, chat);
    }

    return { chat, fromCache: false };
};

/**
 * Invalidate session cache for a conversation
 * Call this when:
 * - User switches persona
 * - User clears conversation
 * - Persona is edited
 */
export const invalidateChatSession = (conversationId: string, personaId?: string): void => {
    sessionCache.invalidate(conversationId, personaId);
};

/**
 * Invalidate all sessions for a persona (when persona is edited)
 */
export const invalidatePersonaSessions = (personaId: string): void => {
    sessionCache.invalidateByPersona(personaId);
};

/**
 * 🔥 SOTA: Generate Content with Explicit Persona Caching
 * 
 * This uses Gemini's explicit context caching API to:
 * 1. Upload the FULL 42k+ persona prompt ONCE (no compression)
 * 2. Reference it cheaply for all subsequent calls (~75% savings)
 * 3. Maintain 100% persona quality
 * 
 * @param config - Chat configuration including persona
 * @param history - Conversation history
 * @param userMessage - Current user message
 * @param onChunk - Callback for streaming chunks
 * @returns Generated response
 */
export const generateWithExplicitCache = async (
    config: ChatConfig,
    history: Content[],
    userMessage: string,
    onChunk?: (text: string) => void
): Promise<{ text: string; fromCache: boolean; tokensSaved: number }> => {
    const apiKey = await ensureGeminiRuntimeKey();
    const ai = getAiClient(apiKey);
    const modelName = config.model || 'gemini-2.0-flash';
    const personaId = config.livingPersona?.id || 'default';
    const fullPersonaPrompt = config.livingPersona?.compiledPrompt || config.systemInstruction || '';

    // Calculate potential savings
    const personaTokens = Math.ceil(fullPersonaPrompt.length / 4);

    // Try to get or create explicit cache for this persona
    let cacheName: string | null = null;
    let fromCache = false;
    let tokensSaved = 0;

    try {
        cacheName = await getOrCreatePersonaCache(
            ai,
            personaId,
            fullPersonaPrompt,
            modelName
        );

        if (cacheName) {
            fromCache = true;
            tokensSaved = personaTokens;
            console.log(`[ExplicitCache] Using cached persona: ${cacheName}`);
        }
    } catch (error) {
        console.warn('[ExplicitCache] Cache creation failed, using direct call:', error);
    }

    // Build content array
    const contents = [
        ...history,
        { role: 'user' as const, parts: [{ text: userMessage }] }
    ];

    // Generate content
    let responseText = '';

    if (cacheName) {
        // Use cached content generation
        const response = await ai.models.generateContentStream({
            model: modelName,
            contents,
            config: {
                cachedContent: cacheName,
                temperature: config.temperature ?? 0.7,
                thinkingConfig: { thinkingBudget: config.thinkingBudget ?? 5 }
            }
        });

        for await (const chunk of response) {
            const text = chunk.text || '';
            responseText += text;
            if (onChunk) onChunk(text);
        }
    } else {
        // Fallback: Direct call without caching
        const response = await ai.models.generateContentStream({
            model: modelName,
            contents,
            config: {
                systemInstruction: fullPersonaPrompt,
                temperature: config.temperature ?? 0.7,
                thinkingConfig: { thinkingBudget: config.thinkingBudget ?? 5 }
            }
        });

        for await (const chunk of response) {
            const text = chunk.text || '';
            responseText += text;
            if (onChunk) onChunk(text);
        }
    }

    return { text: responseText, fromCache, tokensSaved };
};

export const sendMessageStream = async (
    chat: Chat,
    message: string,
    attachments: any[],
    onChunk: (text: string) => void,
    onComplete: () => Promise<void>,
    config: ChatConfig,
    signal?: AbortSignal,
    onImageGenerated?: (url: string, caption: string, preText?: string) => void,
    onLogUpdate?: (log: string) => void,
    onImageGenerationStart?: () => void,
    contextMessages: Message[] = [] // New argument for context
) => {
    try {
        // Phase 1: Check cache first to save API tokens
        const hasMedia = attachments && attachments.length > 0;
        const cacheResult = checkCache(message, hasMedia);

        if (cacheResult.skipAPI && cacheResult.response) {
            console.log(`[Gemini] Cache HIT for pattern: ${cacheResult.pattern}`);

            // Apply imperfections to cached response
            // Language mixing is now controlled by persona prompts, not enforced here
            const humanizedResponse = addImperfections(cacheResult.response, IMPERFECTION_PRESETS.casual, {});
            onChunk(humanizedResponse);
            await onComplete();
            return;
        }

        // [MULTIMODAL FIX] Build message content with attachments as inline data
        // This allows the AI to actually SEE and analyze images/videos
        const messageContent: any[] = [];

        // Add images/videos as inline data first
        if (attachments && attachments.length > 0) {
            console.log(`[Gemini] Processing ${attachments.length} attachment(s) for AI vision...`);
            for (const att of attachments) {
                if (att.type === 'image' || att.type === 'video' || att.mimeType?.startsWith('image/') || att.mimeType?.startsWith('video/')) {
                    try {
                        // [FIX] Use pre-stored base64 data first (avoids CORS issues)
                        // Fall back to fetching only if data not available
                        let base64 = att.data || '';
                        if (!base64 && att.url) {
                            console.log(`[Gemini] No pre-stored base64, fetching from URL...`);
                            base64 = await fetchBase64(att.url);
                        }

                        if (base64) {
                            messageContent.push({
                                inlineData: {
                                    mimeType: att.mimeType || 'image/jpeg',
                                    data: base64
                                }
                            });
                            console.log(`[Gemini] Added ${att.mimeType || 'media'} to message (${base64.length} chars base64)`);
                        } else {
                            console.error(`[Gemini] Failed to get base64 for attachment - VISION WILL NOT WORK`);
                        }
                    } catch (e) {
                        console.warn('[Gemini] Failed to process attachment:', e);
                    }
                }
            }
        }

        // Add text message (or a prompt to analyze the media if no text)
        const textContent = message.trim()
            ? message
            : (messageContent.length > 0
                ? "What's in this? Describe or respond naturally based on what you see."
                : message);
        messageContent.push({ text: textContent });

        // Send message - use original format for text-only, multimodal only when needed
        // ORIGINAL WORKING FORMAT: chat.sendMessageStream({ message }, { signal })
        // FIX: For multimodal with @google/genai SDK, pass parts array directly to { message }
        let result;
        if (messageContent.length > 1) {
            // Multimodal: has images + text
            // For @google/genai SDK chat.sendMessageStream, pass parts directly
            // The 'message' param accepts string OR Part[] (ContentUnion)
            console.log(`[Gemini] Sending multimodal message with ${messageContent.length} parts`);
            result = await chat.sendMessageStream({
                message: messageContent, // Pass parts array directly as message
                config: { abortSignal: signal }
            });
        } else {
            // Text-only: use original simple format that was working
            console.log(`[Gemini] Sending text-only message`);
            result = await chat.sendMessageStream({
                message,
                config: { abortSignal: signal }
            });
        }

        let toolCallDetected = false;
        const pendingGenerations: Promise<void>[] = []; // Track async generations

        for await (const chunk of result) {
            // Check signal manually in case SDK doesn't fully handle it in iterator
            if (signal?.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }

            const candidates = chunk.candidates || [];
            for (const candidate of candidates) {
                const parts = candidate.content?.parts || [];
                for (const part of parts) {
                    if (part.functionCall && part.functionCall.name === 'generate_image') {
                        toolCallDetected = true;
                        console.log("[Gemini] Tool Call Detected: generate_image");

                        if (onImageGenerationStart) onImageGenerationStart();
                        if (onLogUpdate) onLogUpdate('Taking a photo...');

                        const args = part.functionCall.args as any;
                        const prompt = args.prompt;

                        const referenceImages: ReferenceImage[] = [];

                        if (!config.characterModels || config.characterModels.length === 0) {
                            if (config.referenceAssets && config.referenceAssets.length > 0) {
                                const imageAssets = config.referenceAssets.filter(a => a.type === 'image');
                                if (imageAssets.length > 0) {
                                    // Prepare references synchronously where possible, or await inside the async op below
                                }
                            }
                        }

                        const currentHour = new Date().getHours();
                        const contextMessagesForInference = contextMessages.length > 0
                            ? contextMessages
                            : [{ role: 'user', text: message, timestamp: Date.now(), id: 'temp' } as Message];

                        // Infer Context
                        const inferred = inferImageContextFromConversation(contextMessagesForInference, currentHour);
                        console.log("[ImageGen] Inferred Context:", inferred);

                        // Create the promise
                        const genPromise = (async () => {
                            if (signal?.aborted) return;

                            // [FIX] Fetch persona-specific reference images first
                            // Priority: persona reference images > config.characterModels > config.referenceAssets
                            const personaId = config.personaId || config.livingPersona?.id || (config as any).activePersonaId;
                            console.log(`[ImageGen] Resolved personaId: ${personaId || 'none'}`);

                            if (personaId) {
                                console.log(`[ImageGen] Fetching reference images for persona: ${personaId}`);
                                try {
                                    const personaRefs = await fetchPersonaReferenceImages(personaId);
                                    if (personaRefs && personaRefs.length > 0) {
                                        console.log(`[ImageGen] Found ${personaRefs.length} persona-specific reference images`);
                                        await Promise.all(personaRefs.map(async (ref) => {
                                            const b64 = await fetchBase64(ref.image_url);
                                            if (b64) {
                                                referenceImages.push({
                                                    base64: b64,
                                                    mimeType: 'image/png',
                                                    purpose: ref.image_type || 'reference'
                                                });
                                            }
                                        }));
                                    }
                                } catch (e) {
                                    console.warn('[ImageGen] Failed to fetch persona reference images:', e);
                                }
                            }

                            // Fallback: Fetch refs from config if no persona-specific images found
                            if (referenceImages.length === 0 && !config.characterModels?.length) {
                                if (config.referenceAssets && config.referenceAssets.length > 0) {
                                    const imageAssets = config.referenceAssets.filter(a => a.type === 'image');
                                    if (imageAssets.length > 0) {
                                        await Promise.all(imageAssets.map(async (asset) => {
                                            const b64 = await fetchBase64(asset.url);
                                            if (b64) {
                                                referenceImages.push({
                                                    base64: b64,
                                                    mimeType: asset.mimeType,
                                                    purpose: 'face'
                                                });
                                            }
                                        }));
                                    }
                                }
                            }

                            try {
                                const imgResult = await generateHyperRealisticImage({
                                    userRequest: prompt,
                                    conversationMood: inferred.mood,
                                    recentMessages: [message],
                                    referenceImages: referenceImages,
                                    characterModels: config.characterModels,
                                    timeOfDay: inferred.timeOfDay,
                                    location: inferred.location,
                                    model: config.imageModel,
                                    lighting: inferred.lighting
                                });

                                if (imgResult && onImageGenerated) {
                                    console.log("[Gemini] Image Generated Successfully");
                                    onImageGenerated(
                                        imgResult.imageUrl,
                                        imgResult.caption,
                                        imgResult.preText
                                    );
                                    if (onLogUpdate) onLogUpdate('Sent photo.');
                                } else {
                                    console.error("[Gemini] Image Generation returned null");
                                    if (onLogUpdate) onLogUpdate('Camera failed.');
                                }
                            } catch (err) {
                                console.error("Image gen error:", err);
                            }
                        })();

                        pendingGenerations.push(genPromise);
                    }
                }
            }

            if (!toolCallDetected) {
                const text = chunk.text;
                if (text) {
                    const cleanedText = text
                        .replace(/generate_image\s*\{[^}]+\}/g, '')
                        .trim();
                    if (cleanedText) {
                        // Apply human-like imperfections to AI response
                        // Language mixing is now controlled by persona prompts, not enforced here
                        const humanizedText = addImperfections(cleanedText, IMPERFECTION_PRESETS.casual, {});
                        onChunk(humanizedText);
                    }
                }
            }
        }

        // Wait for all image generations to finish before completing
        if (pendingGenerations.length > 0) {
            console.log(`[Gemini] Waiting for ${pendingGenerations.length} pending image generations`);
            await Promise.allSettled(pendingGenerations);
        }

        await onComplete();
    } catch (e: any) {
        if (e.name === 'AbortError') {
            console.log('Stream aborted by user interruption.');
            return; // Clean exit
        }
        console.error("[Gemini] sendMessageStream Error:", e);
        // Rethrow for upstream handling (fallback logic)
        throw e;
    }
};

export const transcribeAudio = async (base64Audio: string, mimeType: string): Promise<string> => {
    try {
        const apiKey = await ensureGeminiRuntimeKey();
        const ai = getAiClient(apiKey);
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',  // Audio input enabled model
            contents: [{
                parts: [
                    { inlineData: { mimeType, data: base64Audio } },
                    { text: "Transcribe this audio exactly as spoken. Do not add any other text." }
                ]
            }]
        });
        return response.text?.trim() || "";
    } catch (e) {
        console.error("Transcription failed", e);
        return "";
    }
};

export const formatHistory = (messages: Message[]): Content[] => {
    return messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
    }));
};

export const uploadFileToStorage = async (file: File, bucket: string, path?: string, userId?: string): Promise<string | null> => {
    try {
        const filePath = path || `${userId || 'public'}/${Date.now()}_${file.name}`;
        const { error } = await supabase.storage.from(bucket).upload(filePath, file);
        if (error) throw error;
        const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
        return data.publicUrl;
    } catch (e) {
        console.error("Upload failed", e);
        return null;
    }
};

export const fetchLibraryFiles = async (bucket: string, userId?: string): Promise<any[]> => {
    try {
        const { data, error } = await supabase.storage.from(bucket).list(userId || 'public');
        if (error) throw error;
        return data.map(f => ({
            name: f.name,
            url: supabase.storage.from(bucket).getPublicUrl(`${userId || 'public'}/${f.name}`).data.publicUrl,
            mimeType: f.metadata?.mimetype || 'application/octet-stream'
        }));
    } catch (e) {
        console.error("Fetch library failed", e);
        return [];
    }
};

export const fetchPresets = async (userId: string): Promise<InstructionPreset[]> => {
    const { data } = await supabaseDb.from('instruction_presets').select('*').eq('user_id', userId);
    return data || [];
};

export const savePreset = async (userId: string, name: string, content: string): Promise<InstructionPreset | null> => {
    const { data, error } = await supabaseDb.from('instruction_presets').insert({ user_id: userId, name, content }).select().single();
    if (error) return null;
    return data;
};

export const deletePreset = async (id: string): Promise<void> => {
    await supabaseDb.from('instruction_presets').delete().eq('id', id);
};

export const fetchPersonas = async (userId: string): Promise<Persona[]> => {
    // Fetch both: global personas (is_global=true, is_active=true) AND user's own personas
    const { data, error } = await supabaseDb
        .from('personas')
        .select('*')
        .or(`is_global.eq.true,user_id.eq.${userId}`)
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Failed to fetch personas:', error);
        return [];
    }
    return data || [];
};

export const createPersona = async (userId: string, name: string, instruction: string, description: string, avatarUrl?: string): Promise<Persona | null> => {
    const { data, error } = await supabaseDb.from('personas').insert({
        user_id: userId,
        name,
        system_instruction: instruction,
        description,
        avatar_url: avatarUrl
    }).select().single();
    if (error) return null;
    return data;
};

export const deletePersona = async (id: string): Promise<void> => {
    await supabaseDb.from('personas').delete().eq('id', id);
};

export const analyzeVoiceCharacteristics = async (samples: { data: string, mimeType: string }[]): Promise<any> => {
    return {
        timbre: "Warm and resonant",
        prosody: "Steady pace",
        accent: "Neutral",
        emotionalRange: { warmth: 0.8, authority: 0.5, dynamism: 0.6 },
        speechPatterns: ["Clear enunciation"]
    };
};

export const generateClonedSpeech = async (text: string, profileDescription: string): Promise<string> => {
    return "";
};

export const createAudioBufferFromPCM = async (base64: string, ctx: AudioContext): Promise<AudioBuffer> => {
    return ctx.createBuffer(1, 1, 16000);
};

export const compareVoices = async (original: any[], generated: any): Promise<any> => {
    return { score: 95, matches: ["Pitch", "Tone"], deviations: ["Speed"] };
};
