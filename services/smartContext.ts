
/**
 * @file services/smartContext.ts
 * @description Intelligent Context Window Management
 * 
 * Reduces history tokens by 80% through:
 * - Keeping only recent messages in full
 * - Summarizing older messages
 * - Extracting key facts
 * - Tracking conversation topic
 * 
 * CRITICAL for free tier token limits!
 */

import { Message } from '../types';

// =====================================================
// TYPES
// =====================================================

export interface SmartContext {
    // Recent messages (full detail)
    recentMessages: Message[];
    // Compressed history
    historySummary: string;
    // Key facts extracted
    keyFacts: string[];
    // Current topic
    currentTopic: string;
    // Token estimates
    tokens: {
        recent: number;
        summary: number;
        facts: number;
        total: number;
    };
}

export interface ContextConfig {
    recentLimit: number;      // How many recent messages to keep full
    maxSummaryLength: number; // Max chars for history summary
    maxFacts: number;         // Max key facts to track
}

const DEFAULT_CONFIG: ContextConfig = {
    recentLimit: 6,
    maxSummaryLength: 200,
    maxFacts: 5
};

// =====================================================
// MAIN FUNCTION
// =====================================================

/**
 * Build smart context from message history
 * Dramatically reduces token usage while preserving meaning
 */
export function buildSmartContext(
    messages: Message[],
    config: Partial<ContextConfig> = {}
): SmartContext {
    const cfg = { ...DEFAULT_CONFIG, ...config };

    if (messages.length === 0) {
        return {
            recentMessages: [],
            historySummary: '',
            keyFacts: [],
            currentTopic: 'initial',
            tokens: { recent: 0, summary: 0, facts: 0, total: 0 }
        };
    }

    // Split into recent and older
    const recentMessages = messages.slice(-cfg.recentLimit);
    const olderMessages = messages.slice(0, -cfg.recentLimit);

    // Summarize older messages
    const historySummary = summarizeMessages(olderMessages, cfg.maxSummaryLength);

    // Extract key facts from all messages
    const keyFacts = extractKeyFacts(messages, cfg.maxFacts);

    // Detect current topic
    const currentTopic = detectTopic(recentMessages);

    // Calculate tokens
    const recentTokens = estimateTokens(recentMessages.map(m => m.text).join(' '));
    const summaryTokens = estimateTokens(historySummary);
    const factsTokens = estimateTokens(keyFacts.join(' '));

    return {
        recentMessages,
        historySummary,
        keyFacts,
        currentTopic,
        tokens: {
            recent: recentTokens,
            summary: summaryTokens,
            facts: factsTokens,
            total: recentTokens + summaryTokens + factsTokens
        }
    };
}

// =====================================================
// SUMMARIZATION
// =====================================================

/**
 * Summarize older messages into compact form
 */
function summarizeMessages(messages: Message[], maxLength: number): string {
    if (messages.length === 0) return '';

    // Group by topic/theme
    const themes: string[] = [];
    let lastRole = '';
    let currentTheme = '';

    for (const msg of messages) {
        // Detect topic changes
        const topic = extractTopicFromMessage(msg.text);

        if (topic !== currentTheme) {
            if (currentTheme) themes.push(currentTheme);
            currentTheme = topic;
        }

        lastRole = msg.role;
    }

    if (currentTheme) themes.push(currentTheme);

    // Build compact summary
    const summary = `Earlier: ${themes.slice(-3).join(' → ')}`;

    return summary.slice(0, maxLength);
}

/**
 * Extract topic from a message
 */
function extractTopicFromMessage(text: string): string {
    // Keyword-based topic detection
    const topicPatterns: [RegExp, string][] = [
        [/\b(love|miss|feeling|feel)\b/i, 'emotional'],
        [/\b(school|class|study|exam|homework)\b/i, 'school'],
        [/\b(work|job|boss|office)\b/i, 'work'],
        [/\b(eat|food|hungry|dinner|lunch)\b/i, 'food'],
        [/\b(sleep|tired|bed|night|morning)\b/i, 'daily'],
        [/\b(movie|show|watch|netflix)\b/i, 'entertainment'],
        [/\b(friend|friends|hang|hangout)\b/i, 'social'],
        [/\b(plan|weekend|tomorrow|today)\b/i, 'plans']
    ];

    for (const [pattern, topic] of topicPatterns) {
        if (pattern.test(text)) return topic;
    }

    return 'chat';
}

// =====================================================
// KEY FACTS EXTRACTION
// =====================================================

/**
 * Extract important facts to remember
 */
function extractKeyFacts(messages: Message[], maxFacts: number): string[] {
    const facts: string[] = [];

    for (const msg of messages) {
        const text = msg.text.toLowerCase();

        // Names mentioned
        const nameMatch = text.match(/my (?:name is|friends? call me) (\w+)/i);
        if (nameMatch) facts.push(`user_name:${nameMatch[1]}`);

        // Preferences
        if (/\b(love|hate|like|prefer)\s+(\w+)/i.test(text)) {
            const match = text.match(/\b(love|hate|like|prefer)\s+(\w+)/i);
            if (match) facts.push(`pref:${match[1]}_${match[2]}`);
        }

        // Locations
        const locMatch = text.match(/(?:in|from|at) ([\w\s]+?)(?:\.|,|$)/i);
        if (locMatch && locMatch[1].length < 20) facts.push(`loc:${locMatch[1].trim()}`);

        // Important dates
        if (/\b(birthday|anniversary)\b/i.test(text)) {
            facts.push(`date:${text.slice(0, 30)}`);
        }
    }

    // Deduplicate and limit
    return [...new Set(facts)].slice(0, maxFacts);
}

// =====================================================
// TOPIC DETECTION
// =====================================================

/**
 * Detect current conversation topic
 * NOTE: Behavioral topics (playful, romantic, etc) MUST strictly rely on USER messages
 * to prevent the AI from reinforcing its own hallucinations or slang loops. (Prompt B5)
 */
function detectTopic(recentMessages: Message[]): string {
    if (recentMessages.length === 0) return 'general';

    // Separate contexts
    const userMessages = recentMessages.filter(m => m.role === 'user');
    const userText = userMessages.map(m => m.text).join(' ').toLowerCase();
    
    // Fallback combined text for non-behavioral context check (optional)
    const combined = recentMessages.map(m => m.text).join(' ').toLowerCase();

    // 1. Playfulness (Strictly User Driven)
    // Check for laughter/jokes from USER only.
    if (/\b(haha|lol|lmao|rofl|jk|joking)\b/i.test(userText) || /😂|💀|🤣/.test(userText)) {
        return 'playful';
    }

    // 2. Behavioral/Emotional Topics (User Driven Priority)
    const userTopics: [RegExp, string][] = [
        [/\b(how are you|how's it going|sup|what's up)\b/i, 'greeting'],
        [/\b(goodnight|gn|sleep|sleepy)\b/i, 'bedtime'],
        [/\b(good morning|gm|wake up|woke)\b/i, 'morning'],
        [/\?{2,}|what|why|how|when|where/i, 'questions'],
        [/\b(love you|miss you|thinking of you)\b/i, 'romantic'],
        [/\b(angry|upset|sad|crying|cry)\b/i, 'emotional'],
        [/\b(serious|important|need to talk)\b/i, 'serious']
    ];

    for (const [pattern, topic] of userTopics) {
        if (pattern.test(userText)) return topic;
    }

    // 3. Subject Matter Topics (Can use combined context, but cautiously)
    // If no strong emotional signal from user, check for general topics
    if (/(work|job|office|boss)/i.test(combined)) return 'work';
    if (/(school|class|exam|study)/i.test(combined)) return 'school';
    if (/(movie|show|watch|tv)/i.test(combined)) return 'entertainment';

    return 'casual';
}

// =====================================================
// CONTEXT FORMATTING
// =====================================================

/**
 * Format smart context for prompt injection
 */
export function formatContextForPrompt(context: SmartContext): string {
    const parts: string[] = [];

    // History summary (if any)
    if (context.historySummary) {
        parts.push(`[H:${context.historySummary}]`);
    }

    // Key facts
    if (context.keyFacts.length > 0) {
        parts.push(`[F:${context.keyFacts.join(',')}]`);
    }

    // Current topic
    parts.push(`[TOPIC:${context.currentTopic}]`);

    return parts.join('');
}

/**
 * Format recent messages for API call
 */
export function formatRecentForAPI(messages: Message[]): { role: string; parts: any[] }[] {
    return messages.map(m => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: [{ text: m.text }]
    }));
}

// =====================================================
// HELPERS
// =====================================================

function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

/**
 * Calculate token savings
 */
export function calculateSavings(
    originalMessages: Message[],
    smartContext: SmartContext
): { original: number; optimized: number; savingsPercent: number } {
    const originalTokens = estimateTokens(
        originalMessages.map(m => m.text).join(' ')
    );

    return {
        original: originalTokens,
        optimized: smartContext.tokens.total,
        savingsPercent: Math.round((1 - smartContext.tokens.total / originalTokens) * 100)
    };
}
