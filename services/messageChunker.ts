
/**
 * @file services/messageChunker.ts
 * @description Human-like Message Chunking System
 * 
 * Real people don't send paragraphs. They send:
 * - Short bursts
 * - Multiple messages
 * - With natural pauses
 * 
 * This service splits AI responses into realistic chunks.
 */

// =====================================================
// TYPES
// =====================================================

interface MessageChunk {
    text: string;
    delay: number; // ms before this chunk appears
    showTyping: boolean; // Show typing indicator before this chunk
    typingDuration: number; // How long typing indicator shows
}

interface ChunkedResponse {
    chunks: MessageChunk[];
    totalDuration: number;
}

interface ChunkingConfig {
    personaIntensity: number; // 0-1: How "texty" the persona is
    currentMood: 'excited' | 'normal' | 'tired' | 'upset';
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'late_night';
    isLongConversation: boolean;
    maxChunks?: number; // Added limit support
}

// =====================================================
// CONSTANTS
// =====================================================

// Average typing speed varies
const TYPING_SPEEDS = {
    excited: { wpm: 70, variance: 20 },
    normal: { wpm: 50, variance: 15 },
    tired: { wpm: 30, variance: 10 },
    upset: { wpm: 40, variance: 25 } // More erratic
};

// =====================================================
// MAIN CHUNKER
// =====================================================

/**
 * Split a response into natural message chunks
 */
export function chunkResponse(
    fullText: string,
    config: Partial<ChunkingConfig> = {}
): ChunkedResponse {
    const {
        personaIntensity = 0.7,
        currentMood = 'normal',
        timeOfDay = 'evening',
        isLongConversation = false,
        maxChunks = 4 // Default limit to prevent flooding
    } = config;

    // Very short messages don't need chunking
    if (fullText.length < 50) {
        return {
            chunks: [{
                text: fullText,
                delay: 0,
                showTyping: true,
                typingDuration: calculateTypingTime(fullText, currentMood)
            }],
            totalDuration: calculateTypingTime(fullText, currentMood)
        };
    }

    let rawChunks = splitIntoChunks(fullText, personaIntensity);

    // 1. Minimum Viable Message Check
    // Filter out chunks that are just whitespace or insignificant punctuation
    rawChunks = rawChunks.filter(c => {
        const trimmed = c.trim();
        if (trimmed.length === 0) return false;
        // Allow if it contains alphanumeric chars OR is a meaningful symbol/emoji
        return /[a-zA-Z0-9]/.test(trimmed) || /[\u{1F300}-\u{1F9FF}]/u.test(trimmed) || /^[?!]+$/.test(trimmed);
    });

    // Fallback if filtering removed everything (e.g. string of periods)
    if (rawChunks.length === 0) rawChunks = [fullText];

    // 2. [AI QUALITY FIX v2] Dynamic chunking based on content length
    // Problem: Hardcoded 3-chunk limit forced unnatural splits
    // Solution: Let content determine natural chunk count

    function calculateNaturalMaxChunks(text: string): number {
        const wordCount = text.split(/\s+/).length;
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

        // Very short (< 30 words): No chunking needed
        if (wordCount < 30) return 1;

        // Short-medium (30-80 words): Max 2 natural chunks
        if (wordCount < 80) return Math.min(2, sentences.length);

        // Medium (80-150 words): Max 3 chunks
        if (wordCount < 150) return Math.min(3, sentences.length);

        // Long (150-250 words): Max 4 chunks
        if (wordCount < 250) return Math.min(4, Math.ceil(sentences.length / 2));

        // Very long: Natural flow, max 5
        return Math.min(5, Math.ceil(sentences.length / 2));
    }

    const TARGET_MAX_CHUNKS = calculateNaturalMaxChunks(rawChunks.join(' '));

    if (rawChunks.length > TARGET_MAX_CHUNKS) {
        // Smart redistribution
        const allText = rawChunks.join(' ');
        const sentences = allText.match(/[^.!?]+[.!?]+/g) || [allText];

        const sentencesPerChunk = Math.ceil(sentences.length / TARGET_MAX_CHUNKS);

        rawChunks = [];
        for (let i = 0; i < sentences.length; i += sentencesPerChunk) {
            const chunkSentences = sentences.slice(i, i + sentencesPerChunk);
            rawChunks.push(chunkSentences.join(' ').trim());
        }

        console.log(`[Chunker] Dynamic: ${sentences.length} sentences → ${rawChunks.length} chunks (wordCount-based)`);
    }

    const chunks: MessageChunk[] = [];
    let totalDuration = 0;

    for (let i = 0; i < rawChunks.length; i++) {
        const text = rawChunks[i].trim();
        if (!text) continue;

        const typingTime = calculateTypingTime(text, currentMood);
        const pauseTime = calculatePauseBetweenMessages(i, rawChunks.length, currentMood, timeOfDay);

        chunks.push({
            text,
            delay: i === 0 ? 0 : pauseTime,
            showTyping: true,
            typingDuration: typingTime
        });

        totalDuration += typingTime + (i > 0 ? pauseTime : 0);
    }

    // Late night = longer pauses
    if (timeOfDay === 'late_night') {
        chunks.forEach(c => {
            c.delay *= 1.5;
            c.typingDuration *= 1.3;
        });
        totalDuration *= 1.4;
    }

    // Tired = even slower
    if (currentMood === 'tired') {
        chunks.forEach(c => {
            c.delay *= 1.3;
            c.typingDuration *= 1.2;
        });
        totalDuration *= 1.25;
    }

    return { chunks, totalDuration };
}

/**
 * Split text into natural chunks
 */
function splitIntoChunks(text: string, intensity: number): string[] {
    // Already has line breaks - use those as hard splits
    if (text.includes('\n')) {
        return text.split('\n').filter(s => s.trim().length > 0);
    }

    const chunks: string[] = [];

    // Split specifically on sentence boundaries: punctuation followed by space and capital letter or end of string
    // This preserves slang like "lol" attached to the previous sentence if no period separates them (Prompt B2)
    const sentenceMatches = text.match(/[^.!?]+[.!?]+(\s+(?=[A-Z])|$)/g) || [text];

    let currentChunk = "";

    for (let i = 0; i < sentenceMatches.length; i++) {
        const sentence = sentenceMatches[i].trim();
        if (!sentence) continue;

        // Start new chunk
        if (!currentChunk) {
            currentChunk = sentence;
            continue;
        }

        // Decision: combine with current chunk or start new?
        const shouldMerge =
            currentChunk.length < 10 || // Current is too short, keep building (Prompt B2)
            (currentChunk.length + sentence.length < 40 && Math.random() < 0.6) || // Combine short thoughts
            /^(and|but|so|because|cuz)/i.test(sentence); // Continuation

        if (shouldMerge) {
            currentChunk += " " + sentence;
        } else {
            chunks.push(currentChunk);
            currentChunk = sentence;
        }
    }

    if (currentChunk) {
        chunks.push(currentChunk);
    }

    // Safety fallback: if no chunks (regex fail), return original
    if (chunks.length === 0) return [text];

    return chunks;
}

/**
 * Calculate realistic typing time
 */
function calculateTypingTime(text: string, mood: string): number {
    const { wpm, variance } = TYPING_SPEEDS[mood as keyof typeof TYPING_SPEEDS] || TYPING_SPEEDS.normal;
    const actualWpm = wpm + (Math.random() - 0.5) * variance * 2;

    const words = text.split(/\s+/).length;
    const baseTime = (words / actualWpm) * 60 * 1000;

    // Add "thinking time" for longer messages
    const thinkingTime = words > 10 ? 500 + Math.random() * 1000 : 0;

    // Minimum time so it doesn't feel instant
    return Math.max(800, baseTime + thinkingTime);
}

/**
 * Calculate pause between messages
 */
function calculatePauseBetweenMessages(
    index: number,
    total: number,
    mood: string,
    timeOfDay: string
): number {
    // Base pause
    let pause = 500 + Math.random() * 1500;

    // First message after typing - shorter pause
    if (index === 1) {
        pause = 300 + Math.random() * 500;
    }

    // Later messages - might pause to think
    if (index > 2) {
        pause += Math.random() * 1000;
    }

    // Mood adjustments
    if (mood === 'excited') pause *= 0.6;
    if (mood === 'tired') pause *= 1.8;
    if (mood === 'upset') pause *= 0.8; // Rapid fire when upset

    // Time adjustments
    if (timeOfDay === 'late_night') pause *= 1.5;
    if (timeOfDay === 'morning') pause *= 1.2;

    // [EMERGENCY FIX] Cap max pause to 2000ms
    return Math.min(2000, Math.round(pause));
}

// =====================================================
// SPECIAL PATTERNS
// =====================================================

/**
 * Check if message should have a "..." trailing pattern
 */
export function shouldTrailOff(text: string): boolean {
    return (
        /thinking|maybe|idk|not sure|hmm/i.test(text) ||
        Math.random() < 0.05 // 5% random chance
    );
}

/**
 * Add interruption pattern
 * Sometimes people stop mid-thought and continue
 */
export function addInterruption(chunks: MessageChunk[]): MessageChunk[] {
    // [EMERGENCY FIX] Disable interruptions for now as they cause huge delays
    return chunks;

    // if (chunks.length < 2 || Math.random() > 0.1) return chunks;

    // 10% chance of interruption
    const interruptIndex = Math.floor(Math.random() * (chunks.length - 1)) + 1;

    const interruptMessages = [
        'wait',
        'hold on',
        'one sec',
        'brb',
        'sry'
    ];

    const interruptChunk: MessageChunk = {
        text: interruptMessages[Math.floor(Math.random() * interruptMessages.length)],
        delay: 500 + Math.random() * 2000,
        showTyping: false, // Instant
        typingDuration: 0
    };

    // Insert and add longer pause after
    const result = [...chunks];
    result.splice(interruptIndex, 0, interruptChunk);

    // Add longer pause after interrupt
    if (result[interruptIndex + 1]) {
        result[interruptIndex + 1].delay = 5000 + Math.random() * 15000;
    }

    return result;
}

/**
 * Add thought corrections
 * Real people correct themselves
 */
export function addCorrections(text: string): string {
    if (Math.random() > 0.08) return text; // 8% chance

    const corrections = [
        { find: /(\w+)\s+(\w+)/, replace: '$1 wait no $2' },
        { find: /\.$/, replace: '\nactually nvm' },
        { find: /\?$/, replace: '? or wait' }
    ];

    const correction = corrections[Math.floor(Math.random() * corrections.length)];
    return text.replace(correction.find, correction.replace);
}

// =====================================================
// INTEGRATION HELPER
// =====================================================

/**
 * Process AI response into streamable chunks
 * Use this in geminiService after getting response
 */
export async function* streamChunkedResponse(
    fullResponse: string,
    config: Partial<ChunkingConfig> = {}
): AsyncGenerator<{ text: string; isFinal: boolean; typingMs: number }> {
    const { chunks, totalDuration } = chunkResponse(fullResponse, config);

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        // Wait for delay
        if (chunk.delay > 0) {
            await new Promise(r => setTimeout(r, chunk.delay));
        }

        // Yield the chunk
        yield {
            text: chunk.text,
            isFinal: i === chunks.length - 1,
            typingMs: chunk.typingDuration
        };
    }
}

export type { MessageChunk, ChunkedResponse, ChunkingConfig };
