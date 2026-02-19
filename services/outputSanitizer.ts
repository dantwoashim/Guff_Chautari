/**
 * @file services/outputSanitizer.ts
 * @description Remove AI-like writing patterns from responses
 * 
 * Problem: AI outputs em dashes, asterisks, formal words
 * Solution: Post-processing filter to remove/replace forbidden patterns
 */

// ============================================
// FORBIDDEN PATTERNS
// ============================================

/**
 * Patterns that make AI responses feel "AI-like"
 */
const FORBIDDEN_PATTERNS: Record<string, RegExp> = {
    // Em dashes (all unicode variants) and double dashes
    emDash: /—|–|--/g,

    // Asterisk emphasis (*word* or **word**)
    asteriskEmphasis: /\*{1,2}([^*]+)\*{1,2}/g,

    // Formal AI words - these scream "I'm an AI"
    formalWordsStart: /^(Furthermore|Moreover|Indeed|Additionally|Consequently|Subsequently|Therefore|Hence|Thus|Notably)\s*,?\s*/gim,
    formalWordsInline: /\b(Furthermore|Moreover|Indeed|Additionally|Consequently|Subsequently|Therefore|Hence|Thus|Notably|Whilst|Henceforth|Notwithstanding|Whereupon|Heretofore)\b/gi,

    // Over-structured language
    structuredPhrases: /\b(Firstly|Secondly|Thirdly|In conclusion|To summarize|As mentioned|It's worth noting|It is important to note|I should mention|Let me explain)\b/gi,

    // Robotic hedging
    hedging: /\b(I would say that|I think that perhaps|It seems to me that|One might argue that|It could be said that)\b/gi,

    // Overly enthusiastic AI phrases
    enthusiasm: /\b(Absolutely!|Great question!|That's a great point!|I'd be happy to|I'm glad you asked|Wonderful!|Excellent question)\b/gi,

    // Unnecessary qualifiers
    qualifiers: /\b(Certainly|Definitely|Undoubtedly|Unquestionably|Without a doubt)\b,?\s*/gi,

    // Lists with "First, Second, Third"
    numberedLists: /^(First|Second|Third|Fourth|Fifth),\s*/gim,

    // Colon lists in casual text
    colonLists: /:\s*\n\s*[-•]\s*/g,

    // Markdown headers in conversation
    markdownHeaders: /^#{1,3}\s+/gm,

    // Bullet points in conversation
    bulletPoints: /^\s*[-•]\s+/gm
};

/**
 * Replacement strategies for patterns
 */
const REPLACEMENTS: Record<string, string | ((match: string, ...args: any[]) => string)> = {
    emDash: ', ',  // Replace em dash with comma
    asteriskEmphasis: (match, word) => word,  // Remove asterisks, keep word
    formalWordsStart: '',  // Remove formal words at sentence start
    formalWordsInline: '',  // Remove formal words inline
    structuredPhrases: '',  // Remove structured phrases
    hedging: '',  // Remove hedging
    enthusiasm: '',  // Remove overly enthusiastic phrases
    qualifiers: '',  // Remove unnecessary qualifiers
    numberedLists: '',  // Remove numbered list markers
    colonLists: ' ',  // Replace with space
    markdownHeaders: '',  // Remove headers
    bulletPoints: ''  // Remove bullet points
};

// ============================================
// SANITIZATION FUNCTIONS
// ============================================

/**
 * Main sanitization function
 * Removes AI-like patterns from text
 */
export function sanitizeResponse(text: string): string {
    if (!text || typeof text !== 'string') return text;

    let result = text;

    // Apply each pattern replacement
    for (const [key, pattern] of Object.entries(FORBIDDEN_PATTERNS)) {
        const replacement = REPLACEMENTS[key];
        if (typeof replacement === 'function') {
            result = result.replace(pattern, replacement);
        } else {
            result = result.replace(pattern, replacement);
        }
    }

    // Clean up artifacts from removals
    result = cleanupText(result);

    return result;
}

/**
 * Clean up text after pattern removal
 */
function cleanupText(text: string): string {
    return text
        // Multiple spaces → single space
        .replace(/\s{2,}/g, ' ')
        // Space before punctuation
        .replace(/\s+([,.:;!?])/g, '$1')
        // Multiple punctuation → single
        .replace(/([,.]){2,}/g, '$1')
        // Orphaned opening/closing quotes
        .replace(/"\s*"/g, '')
        // Fix double commas
        .replace(/,\s*,/g, ',')
        // Fix period-comma
        .replace(/\.\s*,/g, '.')
        // Multiple newlines → double
        .replace(/\n{3,}/g, '\n\n')
        // Sentences starting with lowercase (fix after removals)
        .replace(/\.\s+([a-z])/g, (match, letter) => `. ${letter.toUpperCase()}`)
        // Final trim
        .trim();
}

/**
 * Check if text contains forbidden patterns
 * Useful for logging/debugging
 */
export function detectForbiddenPatterns(text: string): {
    hasForbidden: boolean;
    detected: string[];
} {
    const detected: string[] = [];

    for (const [key, pattern] of Object.entries(FORBIDDEN_PATTERNS)) {
        // Reset regex lastIndex
        pattern.lastIndex = 0;
        if (pattern.test(text)) {
            detected.push(key);
        }
    }

    return {
        hasForbidden: detected.length > 0,
        detected
    };
}

/**
 * Get the blocklist prompt for system instruction
 * This prevents patterns at generation time
 */
export function getWritingBlocklistPrompt(): string {
    return `
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

Your writing must be CASUAL, NATURAL, and HUMAN.
Write like you're texting, not writing an essay.
Any use of forbidden patterns = character break = failure.
`;
}

/**
 * Create a lighter blocklist for inline reinforcement
 */
export function getInlineBlocklistReminder(): string {
    return `[STYLE: No em dashes (—), no *asterisks*, no formal words. Write casual.]`;
}

// ============================================
// LANGUAGE-SPECIFIC SANITIZATION
// ============================================

/**
 * Additional sanitization for Nepali/mixed language responses
 * Ensures language consistency in actions/thoughts
 */
export function sanitizeForLanguage(
    text: string,
    primaryLanguage: 'nepali' | 'hindi' | 'english'
): string {
    if (primaryLanguage === 'english') {
        return sanitizeResponse(text);
    }

    // For Nepali, also check for English-heavy action descriptions
    // and flag them (but don't auto-fix as that requires translation)

    let result = sanitizeResponse(text);

    // Common English action words that should be in target language
    const englishActionPatterns = [
        /\*walks\s/gi,
        /\*looks\s/gi,
        /\*sighs\*/gi,
        /\*smiles\*/gi,
        /\*thinks\*/gi,
        /\*laughs\*/gi,
        /\*pauses\*/gi
    ];

    // Log warning if detected (translation requires AI)
    for (const pattern of englishActionPatterns) {
        if (pattern.test(result)) {
            console.warn('[Language] English action detected in non-English persona');
            break;
        }
    }

    return result;
}

// ============================================
// EXPORT CONVENIENCE
// ============================================

export default {
    sanitizeResponse,
    detectForbiddenPatterns,
    getWritingBlocklistPrompt,
    getInlineBlocklistReminder,
    sanitizeForLanguage
};
