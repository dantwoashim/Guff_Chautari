/**
 * @file services/responseCache.ts
 * @description Cached Response System
 * 
 * Skips API calls entirely for common patterns:
 * - Greetings (gm, gn, hey)
 * - Acknowledgments (k, ok, ya)
 * - Reactions (lol, haha)
 * 
 * CRITICAL for free tier - saves 100% tokens on cached responses!
 */

// =====================================================
// TYPES
// =====================================================

export interface CachedResponseConfig {
    personaVibe: 'formal' | 'casual' | 'chaotic';
    emojiLevel: 'none' | 'low' | 'medium' | 'high';
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
}

export interface CacheResult {
    matched: boolean;
    response?: string;
    pattern?: string;
    skipAPI: boolean;
}

// =====================================================
// RESPONSE TEMPLATES
// =====================================================

const CACHED_RESPONSES: Record<string, Record<string, string[]>> = {
    // Greetings
    greeting_morning: {
        formal: ["Good morning!", "Morning!"],
        casual: ["gm", "morning", "gm gm", "morningg"],
        chaotic: ["gmmmm", "mornin", "gm!! ☀️", "hiiii morning"]
    },

    greeting_night: {
        formal: ["Goodnight!", "Sleep well!"],
        casual: ["gn", "night", "goodnight", "sleep tight"],
        chaotic: ["gnnn", "nighty", "gn gn 🌙", "sleeppp well"]
    },

    greeting_general: {
        formal: ["Hello!", "Hi there!"],
        casual: ["heyy", "hi", "hiii", "hey hey"],
        chaotic: ["hiiii", "heyyy", "omg hiii", "hellooo"]
    },

    // Acknowledgments
    acknowledgment_positive: {
        formal: ["Alright", "Okay", "Understood"],
        casual: ["okay", "k", "ya", "alright", "okie"],
        chaotic: ["okieee", "yaa", "okok", "kk", "yasss"]
    },

    acknowledgment_neutral: {
        formal: ["I see", "Noted"],
        casual: ["hmm", "ah", "oh", "ahh okay"],
        chaotic: ["hmmm", "ohhh", "ahhh", "i see i see"]
    },

    // Reactions - Laughter
    reaction_laugh: {
        formal: ["Haha, that's funny"],
        casual: ["haha", "lol", "hehe", "😂"],
        chaotic: ["LMAOOO", "💀💀", "HAHAHA", "im dead", "STOPP"]
    },

    // Reactions - Positive
    reaction_positive: {
        formal: ["That's wonderful!", "Great!"],
        casual: ["nice", "aw", "that's cute", "love that"],
        chaotic: ["OMG", "YESSS", "I LOVE", "stoppp thats so cute"]
    },

    // Reactions - Agreement
    reaction_agree: {
        formal: ["I agree", "Indeed"],
        casual: ["fr", "real", "facts", "same", "literally"],
        chaotic: ["FR FR", "SO REAL", "THIS", "EXACTLY"]
    },

    // Simple questions answered simply
    simple_how_are_you: {
        formal: ["I'm doing well, thank you!", "Good, and you?"],
        casual: ["good hbu", "im good wbu", "doing okay hbu", "good u?"],
        chaotic: ["good hbuuu", "im okayyy hbu", "vibing hbu", "existing lol u?"]
    },

    // Media reactions - Selfie
    media_selfie: {
        formal: ["You look great!"],
        casual: ["cuteee", "pretty", "😍", "ok go off"],
        chaotic: ["CUTEEE", "omg 😍😍", "STOPP UR SO PRETTY", "slay"]
    },

    // Media reactions - Meme
    media_meme: {
        formal: ["That's amusing"],
        casual: ["lol", "haha true", "this is so us", "me"],
        chaotic: ["MEEE", "💀💀💀", "WHY IS THIS SO REAL", "STOPP"]
    },

    // Thinking/Processing
    thinking: {
        formal: ["Let me think about that"],
        casual: ["hmm", "lemme think", "idk", "not sure"],
        chaotic: ["hmmmmm", "uhhh", "wait lemme think", "idk tbh"]
    }
};

// =====================================================
// PATTERN MATCHING
// =====================================================

const INTENT_PATTERNS: [RegExp, string][] = [
    // Greetings
    [/^(gm|good\s*morning)$/i, 'greeting_morning'],
    [/^(gn|good\s*night|nighty?|sleep\s*well)$/i, 'greeting_night'],
    [/^(hi+|hey+|hello+|yo+|sup)$/i, 'greeting_general'],

    // Acknowledgments
    [/^(ok+|okay+|k+|ya+|yes+|yep+|sure+|alright)$/i, 'acknowledgment_positive'],
    [/^(hmm+|ah+|oh+|i see)$/i, 'acknowledgment_neutral'],

    // Laughter
    [/^(lol+|lmao+|haha+|hehe+|😂+|💀+|rofl)$/i, 'reaction_laugh'],

    // Agreement
    [/^(fr|real|facts|same|literally|true|ikr)$/i, 'reaction_agree'],

    // Positive reactions
    [/^(nice+|yay+|aw+|cute+|love\s*(it|that))$/i, 'reaction_positive'],

    // How are you (simple)
    [/^(how\s*are\s*you|how\s*r\s*u|hbu|wbu|hows\s*it\s*going|sup|wassup)[\?!]*$/i, 'simple_how_are_you'],

    // Thinking
    [/^(idk+|not\s*sure|hmm+|thinking)$/i, 'thinking']
];

// Media detection
const MEDIA_PATTERNS: [RegExp, string][] = [
    [/selfie|mirror|me|my\s*face/i, 'media_selfie'],
    [/meme|funny|joke/i, 'media_meme']
];

// =====================================================
// MAIN FUNCTIONS
// =====================================================

/**
 * Check if message can be answered from cache
 */
export function checkCache(
    userMessage: string,
    hasMedia: boolean = false,
    config: Partial<CachedResponseConfig> = {}
): CacheResult {
    const { personaVibe = 'casual' } = config;
    const trimmed = userMessage.trim().toLowerCase();

    // [FIX] When user sends media (images/videos), we MUST send to AI for analysis
    // Never cache media responses - the AI needs to actually SEE the image content
    if (hasMedia) {
        console.log('[Cache] Media detected - bypassing cache, AI must analyze image');
        return { matched: false, skipAPI: false };
    }

    // Check text patterns
    for (const [pattern, intent] of INTENT_PATTERNS) {
        if (pattern.test(trimmed)) {
            const responses = CACHED_RESPONSES[intent]?.[personaVibe];
            if (responses) {
                return {
                    matched: true,
                    response: pickRandom(responses),
                    pattern: intent,
                    skipAPI: true
                };
            }
        }
    }

    return { matched: false, skipAPI: false };
}

/**
 * Check if API call is needed
 */
export function needsAPICall(userMessage: string, hasMedia: boolean = false): boolean {
    const result = checkCache(userMessage, hasMedia);
    return !result.skipAPI;
}

/**
 * Get cached response with variations
 */
export function getCachedResponse(
    intent: string,
    personaVibe: 'formal' | 'casual' | 'chaotic' = 'casual'
): string | null {
    const responses = CACHED_RESPONSES[intent]?.[personaVibe];
    if (responses) {
        return pickRandom(responses);
    }
    return null;
}

// =====================================================
// VARIATIONS & PERSONALIZATION
// =====================================================

/**
 * Add emoji based on context
 */
function addEmoji(text: string, level: string): string {
    if (level === 'none') return text;

    const emojis = ['😊', '💕', '✨', '🥰', '😌'];

    if (level === 'high' && Math.random() < 0.5) {
        return text + ' ' + pickRandom(emojis);
    }

    if (level === 'medium' && Math.random() < 0.3) {
        return text + ' ' + pickRandom(emojis);
    }

    return text;
}

/**
 * Add time-based variations
 */
export function getTimeAwareResponse(
    intent: string,
    hour: number,
    personaVibe: 'formal' | 'casual' | 'chaotic' = 'casual'
): string | null {
    // Morning greetings
    if (hour >= 5 && hour < 12 && intent === 'greeting_general') {
        return getCachedResponse('greeting_morning', personaVibe);
    }

    // Night greetings
    if ((hour >= 22 || hour < 4) && intent === 'greeting_general') {
        const response = getCachedResponse(intent, personaVibe);
        // Add sleepy modifier sometimes
        if (response && Math.random() < 0.3) {
            return response + (personaVibe === 'chaotic' ? ' (sleepy)' : '');
        }
        return response;
    }

    return getCachedResponse(intent, personaVibe);
}

// =====================================================
// HELPERS
// =====================================================

function pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

// =====================================================
// STATISTICS
// =====================================================

/**
 * Estimate tokens saved by caching
 */
export function estimateSavings(cachedCount: number, avgAPITokens: number = 500): number {
    return cachedCount * avgAPITokens;
}
