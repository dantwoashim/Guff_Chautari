
/**
 * @file services/humanResponseService.ts
 * @description Master Human Response Orchestrator
 */

import {
    chunkResponse,
    ChunkedResponse,
    ChunkingConfig,
    addInterruption,
    addCorrections
} from './messageChunker';
import {
    getTimeContext,
    applyTimeModifiers,
    shouldConversationEnd,
    TimeContext
} from './timeContextService';
import {
    addImperfections,
    addSelfCorrection,
    IMPERFECTION_PRESETS,
    ImperfectionContext
} from './imperfectionEngine';
import {
    applyAllNuances,
    NuanceContext
} from './advancedNuances';
import { Message } from '../types';

export interface HumanMessage {
    id: string;
    text: string;
    typingDuration: number;
    delayBefore: number; // Added to support variable pauses (interruptions)
    isChunked: boolean;
    chunkIndex: number;
    totalChunks: number;
}

export interface HumanResponsePlan {
    messages: HumanMessage[];
    timeContext: TimeContext;
}

export interface PersonaContext {
    vocabulary: string[];
    emojiFrequency: number; // 0-1
    baseMood: string;
    emotionalState?: any;
    referenceImages?: any[];
}

export interface HumanResponseConfig {
    personaVibe: 'formal' | 'casual' | 'chaotic';
    mood: 'excited' | 'normal' | 'tired' | 'upset';
    isLongConversation: boolean;
    enableInterruptions: boolean;
    enableSelfCorrections: boolean;
    imperfectionPreset: keyof typeof IMPERFECTION_PRESETS;
    personaContext?: PersonaContext; // Added Persona Context
}

const SLANG_WHITELIST = new Set([
    'lol', 'lmao', 'omg', 'bruh', 'fr', 'ngl', 'tbh', 'idk', 'rn',
    'lowkey', 'highkey', 'cap', 'no cap', 'bet', 'slay', 'fire',
    'based', 'mid', 'sus', 'vibe', 'mood'
]);

function extractVocabularyFromMessages(messages: Message[]): string[] {
    // Look at last 10 messages to get recent vibe
    const recent = messages.slice(-10);
    const vocabulary: Set<string> = new Set();

    for (const msg of recent) {
        if (msg.role !== 'user' || !msg.text) continue;

        // Simple tokenization by splitting on spaces and punctuation
        const words = msg.text.toLowerCase().split(/[\s,.!?]+/);
        for (const word of words) {
            if (SLANG_WHITELIST.has(word)) {
                vocabulary.add(word);
            }
        }
    }

    return Array.from(vocabulary);
}

function extractUserAbbreviations(messages: Message[]): Set<string> {
    const abbreviations = new Set<string>();
    const abbrevPatterns = [
        /\bu\b/gi,      // u
        /\bur\b/gi,     // ur
        /\bidk\b/gi,    // idk
        /\btbh\b/gi,    // tbh
        /\bbtw\b/gi,    // btw
        /\bfr\b/gi,     // fr
        /\brn\b/gi,     // rn
        /\bomg\b/gi,    // omg
        /\bppl\b/gi,    // ppl
        /\bprob\b/gi,   // prob
        /\bsmth\b/gi,   // smth
        /\bgonna\b/gi,  // gonna
        /\bwanna\b/gi,  // wanna
        /\bgotta\b/gi,  // gotta
        /\bkinda\b/gi,  // kinda
    ];

    // Only check user messages from last 20 messages
    const userMessages = messages.filter(m => m.role === 'user').slice(-20);

    for (const msg of userMessages) {
        if (!msg.text) continue;
        for (const pattern of abbrevPatterns) {
            if (pattern.test(msg.text)) {
                const match = msg.text.match(pattern)?.[0]?.toLowerCase();
                if (match) abbreviations.add(match);
            }
        }
    }

    return abbreviations;
}

function calculateRelationshipFamiliarity(
    totalMessageCount: number,
    conversationDays: number,
    sharedTopics: string[],
    emotionalMoments: number
): number {
    let score = 0.1;

    // Message count tiers
    if (totalMessageCount > 500) score = 0.6;
    else if (totalMessageCount > 100) score = 0.3;
    else score = 0.1 + (totalMessageCount / 100) * 0.2;

    // Days talking bonus
    score += conversationDays * 0.01;

    // Shared topics bonus
    score += sharedTopics.length * 0.02;

    // Emotional moments bonus
    score += emotionalMoments * 0.05;

    // Cap at 0.95 (never 100% familiar to keep it engaging)
    return Math.min(0.95, score);
}

function calculateTypingDuration(text: string, mood: string): number {
    const chars = text.length;
    let msPerChar = 120; // Faster baseline for "instant" feel

    if (mood === 'excited') msPerChar = 90;
    if (mood === 'tired') msPerChar = 180;
    if (mood === 'upset') msPerChar = 110;

    let duration = chars * msPerChar;

    if (chars < 15) {
        duration = 500 + (chars * 30);
    } else {
        duration = Math.min(4000, duration);
    }

    duration = duration * (0.8 + Math.random() * 0.4); // Variance
    return Math.round(duration);
}

/**
 * Transform AI response into human-like message sequence
 */
export function createHumanResponsePlan(
    aiResponse: string,
    userMessageLength: number,
    recentUserMessages: Message[],
    totalMessageCount: number,
    conversationStartTime?: number,
    config: Partial<HumanResponseConfig> = {}
): HumanResponsePlan {
    const {
        personaVibe = 'casual',
        mood = 'normal',
        isLongConversation = false,
        enableInterruptions = true,
        enableSelfCorrections = true,
        imperfectionPreset = 'casual',
        personaContext
    } = config;

    const timeContext = getTimeContext();

    // Check for natural ending (Prompt D2)
    const endCheck = shouldConversationEnd(timeContext, totalMessageCount);
    let finalAiResponse = aiResponse;

    if (endCheck.should && endCheck.reason) {
        // Avoid appending if already ending to prevent duplication
        const lower = finalAiResponse.toLowerCase();
        if (!lower.includes('bye') && !lower.includes('night') && !lower.includes('sleep') && !lower.includes('later')) {
            finalAiResponse = `${finalAiResponse.trim()} ${endCheck.reason}`;
        }
    }

    // 1. Time & Mood Mods
    let processedResponse = applyTimeModifiers(finalAiResponse, timeContext);
    let effectiveMood = mood;
    if (timeContext.period === 'late_night') effectiveMood = 'tired';

    // Override mood if persona context suggests strong baseline state
    if (personaContext?.baseMood && Math.random() < 0.3) {
        // Subtle bias towards baseline mood
    }

    // Extract user slang to mirror
    const extractedVocab = extractVocabularyFromMessages(recentUserMessages);

    // Extract user abbreviations
    const observedAbbreviations = extractUserAbbreviations(recentUserMessages);

    // Calculate Familiarity
    const daysTalking = conversationStartTime
        ? Math.max(0, (Date.now() - conversationStartTime) / (1000 * 60 * 60 * 24))
        : 0;

    // Heuristic: Check recent messages for emotional keywords to estimate emotional moments
    const emotionalKeywords = ['love', 'hate', 'feel', 'sad', 'happy', 'afraid', 'worry', 'secret', 'scared', 'hurt'];
    const emotionalMoments = recentUserMessages.filter(m =>
        m.role === 'user' && emotionalKeywords.some(k => m.text?.toLowerCase().includes(k))
    ).length;

    const familiarity = calculateRelationshipFamiliarity(
        totalMessageCount,
        daysTalking,
        [], // Shared topics tracking would require heavier analysis
        emotionalMoments
    );

    // Adjust behavior based on message count (Prompt A4)
    let adjustedVibe = personaVibe;
    if (totalMessageCount < 5) {
        // Establishing rapport
        adjustedVibe = 'formal'; // Slightly more reserved
    } else if (totalMessageCount > 20) {
        // Intimate
        if (adjustedVibe === 'casual') adjustedVibe = 'chaotic'; // Allow more looseness
    }

    // --- APPLY ADVANCED NUANCES ---
    // Construct NuanceContext
    const nuanceCtx: NuanceContext = {
        messageCount: totalMessageCount,
        lastMessageTimestamp: Date.now(),
        conversationMood: effectiveMood === 'excited' ? 'positive' : effectiveMood === 'upset' ? 'negative' : 'neutral',
        currentTopic: 'general',
        previousTopics: [],
        userNameMentioned: false,
        lastNameUsedAt: 0,
        lastQuestionAt: 0,
        mediaReceived: false,
        hourOfDay: timeContext.hour,
        relationshipFamiliarity: familiarity,
        recentUserVocabulary: extractedVocab,
        personaVocabulary: personaContext?.vocabulary || [], // Inject persona vocabulary
        lastUserMessageLength: userMessageLength,
        isUrgent: false
    };

    const nuanceResult = applyAllNuances(processedResponse, nuanceCtx);
    processedResponse = nuanceResult.text;
    const mods = nuanceResult.modifications;

    // 2. Chunking
    const chunkConfig: Partial<ChunkingConfig> = {
        personaIntensity: adjustedVibe === 'chaotic' ? 0.9 : 0.7,
        currentMood: effectiveMood,
        timeOfDay: timeContext.period as any,
        isLongConversation
    };

    // Voice Note Pivot Logic
    if (mods.voiceNoteOverride) {
        // If system decides on VN, we might simulate it with a specific text marker
        // or just return a single chunk saying "[Voice Note]" for now
    }

    let chunkedResponse = chunkResponse(processedResponse, chunkConfig);
    let chunks = chunkedResponse.chunks;

    // --- INTEGRATION: INTERRUPTIONS & CORRECTIONS - DISABLED ---
    // These features were adding artificial patterns that made responses feel AI-like
    // Leaving code but gated behind flag for potential future use
    const ENABLE_AGGRESSIVE_HUMANIZATION = false;

    if (ENABLE_AGGRESSIVE_HUMANIZATION) {
        // 10% chance of interruption
        if (enableInterruptions && chunks.length > 1 && Math.random() < 0.1) {
            chunks = addInterruption(chunks);
        }

        // 8% chance of correction (text-based)
        if (enableSelfCorrections && Math.random() < 0.08) {
            for (let i = 0; i < chunks.length; i++) {
                chunks[i].text = addCorrections(chunks[i].text);
            }
        }
    }

    // 3. Imperfections & Corrections (Visual)
    const imperfectionConfig = IMPERFECTION_PRESETS[imperfectionPreset];

    // Construct Context for Abbreviation Logic (Prompt B4)
    const imperfectionCtx: ImperfectionContext = {
        userUsesAbbreviations: observedAbbreviations.size > 0 || extractedVocab.length > 0,
        isTechnical: /code|script|function|debug|error|api|database/.test(processedResponse.toLowerCase()),
        isEmotional: emotionalMoments > 0 || ['upset', 'excited', 'sad'].includes(effectiveMood),
        isFirstMessage: totalMessageCount <= 1,
        messageMood: effectiveMood,
        observedUserAbbreviations: observedAbbreviations // Pass observed abbreviations
    };

    // Apply imperfections to chunks in place
    chunks.forEach(chunk => {
        chunk.text = addImperfections(chunk.text, imperfectionConfig, imperfectionCtx);
    });

    let finalTexts = chunks.map(c => c.text);

    // Additional self-correction check (from imperfection engine)
    // We only apply this if we didn't just apply the messageChunker correction to avoid redundancy
    if (enableSelfCorrections && Math.random() < 0.15) {
        finalTexts = addSelfCorrection(finalTexts);
    }

    // 4. Build Timing Plan
    const messages: HumanMessage[] = [];

    for (let i = 0; i < finalTexts.length; i++) {
        const text = finalTexts[i];
        let typingDuration = calculateTypingDuration(text, effectiveMood);

        // Apply Erasure Delay (Nuance Feature)
        if (mods.typingErasure && i === 0) {
            typingDuration += 2000; // Add simulated delete/rewrite time
        }

        // Determine pause before this message
        // If it was a chunk, use its delay. If it's a new correction appended, give it a natural pause.
        let delayBefore = 0;
        if (i < chunks.length) {
            delayBefore = chunks[i].delay;
        } else {
            delayBefore = 400 + Math.random() * 400;
        }

        messages.push({
            id: `msg_${Date.now()}_${i}`,
            text,
            typingDuration,
            delayBefore,
            isChunked: finalTexts.length > 1,
            chunkIndex: i,
            totalChunks: finalTexts.length
        });
    }

    return {
        messages,
        timeContext
    };
}

/**
 * Stream the human response plan
 */
export async function* streamHumanResponse(
    plan: HumanResponsePlan,
    onTypingChange?: (isTyping: boolean, phase: string) => void
): AsyncGenerator<HumanMessage> {
    const { messages } = plan;

    // Initial reading/processing delay
    const initialDelay = 600 + Math.random() * 400;
    await new Promise(r => setTimeout(r, initialDelay));

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];

        // Gap between messages in a burst (Variable delay)
        if (i > 0) {
            const pause = msg.delayBefore > 0 ? msg.delayBefore : (400 + Math.random() * 400);
            await new Promise(r => setTimeout(r, pause));
        }

        if (onTypingChange) onTypingChange(true, 'typing');
        await new Promise(r => setTimeout(r, msg.typingDuration));
        if (onTypingChange) onTypingChange(false, 'done');

        yield msg;
    }
}
