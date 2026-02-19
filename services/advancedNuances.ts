
/**
 * @file services/advancedNuances.ts
 * @description 15 Advanced Micro-Behavioral Nuances
 * 
 * Collection of subtle human behaviors that make AI feel real:
 * - Emoji context awareness
 * - Reply timing patterns
 * - Topic persistence
 * - Mood carryover
 * - Vocabulary Mirroring (New)
 * - Read Receipt Latency (New)
 * - Voice Note Pivot (New)
 * - Reply Targeting (New)
 * - Emoji Flooding (New)
 * - Keysmashing (New)
 * - Typing Erasure (New)
 */

// =====================================================
// TYPES
// =====================================================

export interface NuanceContext {
    messageCount: number;
    lastMessageTimestamp: number;
    conversationMood: 'positive' | 'neutral' | 'negative' | 'playful' | 'serious' | 'excited' | 'tired' | 'angry' | 'chaotic';
    currentTopic: string;
    previousTopics: string[];
    userNameMentioned: boolean;
    lastNameUsedAt: number;
    lastQuestionAt: number;
    mediaReceived: boolean;
    mediaType?: 'selfie' | 'meme' | 'screenshot' | 'photo';
    hourOfDay: number;
    relationshipFamiliarity: number; // 0-1
    // New fields for advanced nuances
    recentUserVocabulary?: string[];
    personaVocabulary?: string[]; // Added from PersonaBridge
    lastUserMessageLength?: number;
    isUrgent?: boolean;
}

export interface NuanceModifications {
    emojiStyle: { allowed: string[]; frequency: number };
    replyDelay: number;
    shouldAskFollowUp: boolean;
    shouldReferenceOldTopic: boolean;
    moodModifier: string;
    shouldUseName: boolean;
    isReactionOnly: boolean;
    shouldDoubleText: boolean;
    capsEmphasis: boolean;
    sleepyModifiers: boolean;
    // New modifications
    vocabularyInsertion: string[];
    readReceiptDelay: number;
    voiceNoteOverride: boolean;
    specificReplyTarget: string | null;
    emojiFlood: boolean;
    keySmash: boolean;
    typingErasure: boolean;
}

// =====================================================
// 1. EMOJI CONTEXT AWARENESS
// =====================================================

export function getEmojiContext(
    mood: string,
    familiarity: number
): { allowed: string[]; frequency: number } {
    const emojiSets: Record<string, { emojis: string[]; freq: number }> = {
        positive: { emojis: ['😊', '💕', '✨', '🥰', '😌'], freq: 0.4 },
        playful: { emojis: ['😂', '💀', '🤣', '😭', '🔥'], freq: 0.6 },
        flirty: { emojis: ['😏', '🙈', '💕', '😘', '🥺'], freq: 0.5 },
        sad: { emojis: ['🥺', '😔', '💔', '😢'], freq: 0.2 },
        excited: { emojis: ['🔥', '😭', '💀', '✨', '🎉'], freq: 0.7 },
        neutral: { emojis: ['😊', '👍', '😌'], freq: 0.3 },
        serious: { emojis: [], freq: 0.05 },
        tired: { emojis: ['😴', '🥱', '💤', '💀'], freq: 0.3 }
    };

    const set = emojiSets[mood] || emojiSets.neutral;
    const adjustedFreq = set.freq * (0.5 + familiarity * 0.5);

    return { allowed: set.emojis, frequency: adjustedFreq };
}

// =====================================================
// 2. REPLY TIMING PATTERNS
// =====================================================

export function calculateReplyDelay(context: NuanceContext): number {
    const { hourOfDay, messageCount, conversationMood } = context;
    let delay = 1500; // Base delay

    if (messageCount < 5) delay = 500 + Math.random() * 800;
    if (conversationMood === 'playful' || conversationMood === 'positive' || conversationMood === 'excited') delay *= 0.6; // Faster replies when happy
    if (conversationMood === 'serious') delay *= 1.4; // Thinking time

    // Work hours latency
    if (hourOfDay >= 9 && hourOfDay <= 17) delay += Math.random() * 5000;

    // Late night rapid fire or sleepy slow
    if (hourOfDay >= 0 && hourOfDay < 5) {
        delay = Math.random() > 0.7 ? delay * 2 : delay * 0.5;
    }

    delay += (Math.random() - 0.5) * delay * 0.2; // Jitter
    return Math.max(300, Math.round(delay));
}

// =====================================================
// 3. VOCABULARY MIRRORING (SLANG ADOPTION)
// =====================================================

const SLANG_MAP: Record<string, string[]> = {
    'tea': ['spill', '☕', 'omg tell me'],
    'cap': ['no cap', 'fr', 'on god'],
    'bet': ['bet', 'say less'],
    'lit': ['lit', '🔥'],
    'slay': ['slay', 'ate that', 'purr'],
    'dead': ['💀', 'dead', 'im weak'],
    'sus': ['sus', '👀'],
    'cringe': ['yikes', '😬'],
    'lol': ['lol', 'lmao'],
    'bro': ['bro', 'dude']
};

/**
 * Tracks slang usage to prevent repetitive feedback loops.
 */
export class SlangTracker {
    private usedSlang: Map<string, { count: number; lastUsed: number; lastMessageIndex: number }> = new Map();
    private maxUsagePerPeriod: number = 2;
    private periodMs: number = 300000; // 5 mins

    /**
     * Check if a slang word can be used based on history constraints
     */
    public canUse(slang: string, currentMessageIndex: number): boolean {
        const usage = this.usedSlang.get(slang);

        if (!usage) return true;

        const timeDiff = Date.now() - usage.lastUsed;
        const msgDiff = currentMessageIndex - usage.lastMessageIndex;

        // Constraint 1: Cooldown - Same slang can only appear every 10+ messages
        if (msgDiff < 10) return false;

        // Constraint 2: Recent burst check (last 5 mins)
        if (timeDiff < this.periodMs && usage.count >= this.maxUsagePerPeriod) return false;

        return true;
    }

    /**
     * Record usage of a slang word
     */
    public recordUsage(slang: string, currentMessageIndex: number) {
        const current = this.usedSlang.get(slang) || { count: 0, lastUsed: 0, lastMessageIndex: 0 };
        const timeDiff = Date.now() - current.lastUsed;

        // Reset count if period passed
        const newCount = timeDiff > this.periodMs ? 1 : current.count + 1;

        this.usedSlang.set(slang, {
            count: newCount,
            lastUsed: Date.now(),
            lastMessageIndex: currentMessageIndex
        });
    }
}

// Global instance for the session (module level singleton)
export const globalSlangTracker = new SlangTracker();

export function getMirroredVocabulary(context: NuanceContext): string[] {
    const insertions: string[] = [];

    // 1. Mirror User Vocabulary
    if (context.recentUserVocabulary && context.relationshipFamiliarity > 0.3) {
        context.recentUserVocabulary.forEach(word => {
            const lower = word.toLowerCase();
            const mappings = SLANG_MAP[lower];

            if (mappings) {
                const candidate = mappings[Math.floor(Math.random() * mappings.length)];
                if (globalSlangTracker.canUse(candidate, context.messageCount)) {
                    if (Math.random() < 0.2) {
                        insertions.push(candidate);
                        globalSlangTracker.recordUsage(candidate, context.messageCount);
                    }
                }
            }
        });
    }

    // 2. Inject Persona Vocabulary (New)
    if (context.personaVocabulary && context.personaVocabulary.length > 0) {
        if (Math.random() < 0.15) { // 15% chance to use a signature phrase
            const phrase = context.personaVocabulary[Math.floor(Math.random() * context.personaVocabulary.length)];
            // Only add if not too long to avoid disrupting flow
            if (phrase.split(' ').length < 5) {
                insertions.push(phrase);
            }
        }
    }

    return insertions;
}

export function shouldAppendSlang(
    text: string,
    mirroredWord: string,
    context: NuanceContext
): boolean {
    const lowerText = text.toLowerCase();
    const trimmedText = text.trim();

    // 1. Check Mood: No slang in serious, sad, or negative contexts
    if (context.conversationMood === 'serious' ||
        context.conversationMood === 'negative' ||
        context.conversationMood === 'tired') {
        return false;
    }

    // 2. Check Sentence Endings: Don't append if it ends formally or with certain punctuation
    // Avoid appending after ?, !, or ... 
    if (/[.!?…:]$/.test(trimmedText)) {
        return false;
    }

    // 3. Check for Question: If the AI is asking a question, don't append random slang at the end usually
    if (trimmedText.endsWith('?')) {
        return false;
    }

    // 4. Check for Technical Context: Heuristic based on content
    // If mentioning code, errors, or technical terms, skip slang
    if (/error|code|function|bug|issue|app|server|database/i.test(lowerText)) {
        return false;
    }

    // 5. Redundancy Check: Don't use if the word is already in the text
    if (lowerText.includes(mirroredWord.toLowerCase())) {
        return false;
    }

    return true;
}

// =====================================================
// 4. VARIABLE READ RECEIPT LATENCY (GHOSTING)
// =====================================================

export function calculateReadReceiptDelay(context: NuanceContext): number {
    // Base "seen" delay - how long before double blue ticks appear
    let delay = 500;

    // If urgent, read instantly
    if (context.isUrgent) return 100;

    // If upset, leave on delivered longer
    if (context.conversationMood === 'negative') {
        return 5000 + Math.random() * 20000; // 5s - 25s delay
    }

    // Random "busy" moments
    if (Math.random() < 0.1) {
        return 10000 + Math.random() * 30000;
    }

    return delay;
}

// =====================================================
// 5. VOICE NOTE PIVOT
// =====================================================

export function checkVoiceNoteSuitability(context: NuanceContext, currentTextLength: number): boolean {
    // If text is huge and mood is lazy/excited/venting -> Voice Note preference
    if (currentTextLength > 150) {
        const triggers = ['tired', 'excited', 'negative', 'playful'];
        if (triggers.includes(context.conversationMood)) {
            return Math.random() < 0.45; // 45% chance to prefer VN
        }
    }
    return false;
}

// =====================================================
// 6. SPECIFIC REPLY TARGETING
// =====================================================

export function determineReplyContext(userMessageLength: number): string | null {
    // If user sent a paragraph, simulate quoting a specific part (visual indicator only for now)
    if (userMessageLength > 120 && Math.random() < 0.4) {
        return "quote_reply";
    }
    return null;
}

// =====================================================
// 7. EMOJI FLOODING
// =====================================================

export function generateEmojiFlood(mood: string, text: string): boolean {
    // Only flood if very short text (reactions) or high intensity
    if (text.length > 40) return false;

    const intensityTriggers = ['playful', 'excited', 'positive', 'flirty'];
    if (intensityTriggers.includes(mood) && Math.random() < 0.3) {
        return true;
    }
    return false;
}

export function applyEmojiFlood(emoji: string): string {
    const count = 3 + Math.floor(Math.random() * 4); // 3-6 emojis
    return Array(count).fill(emoji).join('');
}

// =====================================================
// 8. AUTHENTIC KEYSMASH
// =====================================================

export function generateKeysmash(): string {
    const bases = ['asdf', 'sksksk', 'hahsjdh', 'plsss', 'omggg'];
    const base = bases[Math.floor(Math.random() * bases.length)];
    const extra = Math.random().toString(36).substring(7).replace(/[0-9]/g, '');
    return base + extra;
}

export function checkKeysmashTrigger(mood: string): boolean {
    return (mood === 'playful' || mood === 'excited') && Math.random() < 0.12;
}

// =====================================================
// 9. TYPING ERASURE (HESITATION)
// =====================================================

export function checkTypingErasure(context: NuanceContext): boolean {
    // If romantic/serious/negative -> hesitation is likely
    // Simulates: Typing... Stopped... Typing...
    const hesitationMoods = ['romantic', 'serious', 'negative'];
    if (hesitationMoods.includes(context.conversationMood)) {
        return Math.random() < 0.4;
    }
    return false;
}

// =====================================================
// 10. CONTEXTUAL CAPS EMPHASIS
// =====================================================

function applyContextualCaps(text: string): string {
    const words = text.split(' ');
    // Need at least 3 words to avoid "shouting" starts/ends
    if (words.length < 3) return text;

    const KEY_WORDS = new Set([
        'so', 'very', 'really', 'literally', 'totally', 'absolutely', 'huge',
        'never', 'always', 'love', 'hate', 'best', 'worst', 'obsessed',
        'dead', 'dying', 'crying', 'shaking', 'screaming', 'please', 'pls',
        'omg', 'wtf', 'stop', 'no', 'yes', 'finally', 'actually', 'seriously',
        'just', 'cannot', 'cant', 'dont', 'wont'
    ]);

    let hasChanged = false;
    const newWords = [...words];

    // Process words excluding first and last
    for (let i = 1; i < newWords.length - 1; i++) {
        const rawWord = newWords[i].replace(/[^a-zA-Z]/g, '').toLowerCase();

        // Strategy: 
        // 1. If it's a key intensity word -> CAPS
        // 2. Random chance (15%) for other significant words (len > 3) to capture nouns/verbs
        if (KEY_WORDS.has(rawWord) || (rawWord.length > 3 && Math.random() < 0.15)) {
            newWords[i] = newWords[i].toUpperCase();
            hasChanged = true;
        }
    }

    // Fallback: If nothing changed but we really want emphasis (and length permits), 
    // force one word in the middle-ish to be caps if it's long enough
    if (!hasChanged) {
        const middleIdx = Math.floor(newWords.length / 2);
        if (newWords[middleIdx].length > 2) {
            newWords[middleIdx] = newWords[middleIdx].toUpperCase();
        }
    }

    return newWords.join(' ');
}

// =====================================================
// MASTER NUANCE APPLICATOR
// =====================================================

export function applyAllNuances(
    text: string,
    context: NuanceContext
): { text: string; modifications: Partial<NuanceModifications> } {
    let modifiedText = text;
    const mods: Partial<NuanceModifications> = {};

    // 1. Emoji context
    mods.emojiStyle = getEmojiContext(context.conversationMood, context.relationshipFamiliarity);

    // 2. Reply delay
    mods.replyDelay = calculateReplyDelay(context);

    // 3. Read receipt delay
    mods.readReceiptDelay = calculateReadReceiptDelay(context);

    // 4. Voice Note Check
    mods.voiceNoteOverride = checkVoiceNoteSuitability(context, text.length);

    // 5. Vocabulary Mirroring (User + Persona)
    const mirroredWords = getMirroredVocabulary(context);
    // DISABLED: Slang injection was making responses feel artificial
    // if (mirroredWords.length > 0) {
    //     const word = mirroredWords[0];
    //     if (Math.random() < 0.08 && shouldAppendSlang(modifiedText, word, context)) {
    //         modifiedText += ` ${word}`;
    //     }
    // }

    // 6. Keysmash - DISABLED: Makes responses feel spammy and unnatural
    // if (checkKeysmashTrigger(context.conversationMood)) {
    //     modifiedText = `${generateKeysmash()} ${modifiedText}`;
    //     mods.keySmash = true;
    // }
    mods.keySmash = false;

    // 7. Emoji Flood
    if (generateEmojiFlood(context.conversationMood, modifiedText)) {
        // Extract existing emoji or use default
        const emojiMatch = modifiedText.match(/[\u{1F300}-\u{1F9FF}]/u);
        const emoji = emojiMatch ? emojiMatch[0] : (mods.emojiStyle.allowed[0] || '😂');
        // Replace single emoji with flood or append
        if (emojiMatch) {
            modifiedText = modifiedText.replace(emoji, applyEmojiFlood(emoji));
        } else {
            modifiedText += ` ${applyEmojiFlood(emoji)}`;
        }
        mods.emojiFlood = true;
    }

    // 8. Typing Erasure
    mods.typingErasure = checkTypingErasure(context);

    // 9. Contextual CAPS Emphasis - DISABLED: Random CAPS feels very AI
    // Trust the model's natural emphasis instead
    mods.capsEmphasis = false;

    // Default existing nuances
    mods.shouldAskFollowUp = Math.random() < 0.4;
    mods.shouldUseName = false;

    return { text: modifiedText, modifications: mods };
}
