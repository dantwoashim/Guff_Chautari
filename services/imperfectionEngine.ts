
/**
 * @file services/imperfectionEngine.ts
 * @description Deliberate Imperfection Generator
 * 
 * Perfect spelling and grammar is a dead giveaway for AI.
 * Real people:
 * - Make typos
 * - Skip punctuation
 * - Use inconsistent capitalization
 * - Abbreviate randomly
 * - Trail off...
 * - Mix languages (Nepali/English for Nepali personas)
 */

import { injectNepaliWords, toCasualRomanized, LanguageMixConfig } from '../engines/voice/NepaliPatterns';

// =====================================================
// TYPES
// =====================================================

export interface ImperfectionConfig {
    typoRate: number;           // 0-1: Base typo probability
    punctuationSkipRate: number; // 0-1: Skip ending punctuation
    lowercaseRate: number;      // 0-1: Start with lowercase
    abbreviationRate: number;   // 0-1: Use abbreviations
    trailOffRate: number;       // 0-1: End with ...
    doubleMessageRate: number;  // 0-1: Split into two messages
    selfCorrectionRate: number; // 0-1: Add corrections like "*that"
}

export interface ImperfectionContext {
    userUsesAbbreviations?: boolean;
    isTechnical?: boolean;
    isEmotional?: boolean;
    isFirstMessage?: boolean;
    messageMood?: string;
    observedUserAbbreviations?: Set<string>; // Explicit set of abbreviations the user actually uses

    // Language mixing (for Nepali/multilingual personas)
    languageMix?: {
        enabled: boolean;
        language: 'nepali' | 'hindi' | 'tibetan';
        ratio: number;  // 0-1, e.g., 0.65 for 65% target language
    };
}

// =====================================================
// PRESETS
// =====================================================

export const IMPERFECTION_PRESETS: Record<string, ImperfectionConfig> = {
    minimal: {
        typoRate: 0.02,
        punctuationSkipRate: 0.1,
        lowercaseRate: 0.15,
        abbreviationRate: 0.02, // Reduced
        trailOffRate: 0.02,
        doubleMessageRate: 0.05,
        selfCorrectionRate: 0.02
    },

    casual: {
        typoRate: 0.05,
        punctuationSkipRate: 0.3,
        lowercaseRate: 0.4,
        abbreviationRate: 0.05, // Reduced from 0.25 (Prompt B4)
        trailOffRate: 0.08,
        doubleMessageRate: 0.15,
        selfCorrectionRate: 0.05
    },

    messy: {
        typoRate: 0.1,
        punctuationSkipRate: 0.5,
        lowercaseRate: 0.6,
        abbreviationRate: 0.15, // Reduced from 0.35 (Prompt B4)
        trailOffRate: 0.12,
        doubleMessageRate: 0.25,
        selfCorrectionRate: 0.08
    },

    tired: {
        typoRate: 0.15,
        punctuationSkipRate: 0.6,
        lowercaseRate: 0.7,
        abbreviationRate: 0.10, // Reduced from 0.3 (Prompt B4)
        trailOffRate: 0.2,
        doubleMessageRate: 0.1,
        selfCorrectionRate: 0.1
    }
};

// =====================================================
// TYPO GENERATORS
// =====================================================

const COMMON_TYPOS: Record<string, string[]> = {
    'the': ['teh', 'hte', 'th'],
    'and': ['adn', 'anf', 'nad'],
    'you': ['yuo', 'yoi', 'ypu'],
    'that': ['taht', 'thta', 'tht'],
    'have': ['ahve', 'hvae', 'hav'],
    'with': ['wiht', 'wtih', 'wth'],
    'this': ['tihs', 'htis', 'ths'],
    'what': ['waht', 'whta', 'wht'],
    'from': ['form', 'fron', 'frm'],
    'your': ['yuor', 'yoru', 'yr'],
    'about': ['abotu', 'abuot', 'abt'],
    'just': ['jsut', 'juts', 'jst'],
    'like': ['liek', 'likr', 'lik'],
    'know': ['knwo', 'konw', 'kno'],
    'think': ['thikn', 'thiink', 'thnk'],
    'because': ['becuase', 'becasue', 'bc'],
    'really': ['relly', 'realy', 'rlly'],
    'going': ['goign', 'giong', 'goin'],
    'doing': ['doinf', 'doign', 'doin'],
    'something': ['somethign', 'someting', 'smth']
};

const ADJACENT_KEYS: Record<string, string[]> = {
    'a': ['s', 'q', 'z'],
    'b': ['v', 'n', 'g'],
    'c': ['x', 'v', 'd'],
    'd': ['s', 'f', 'e'],
    'e': ['w', 'r', 'd'],
    'f': ['d', 'g', 'r'],
    'g': ['f', 'h', 't'],
    'h': ['g', 'j', 'y'],
    'i': ['u', 'o', 'k'],
    'j': ['h', 'k', 'u'],
    'k': ['j', 'l', 'i'],
    'l': ['k', 'o', 'p'],
    'm': ['n', 'k'],
    'n': ['b', 'm', 'h'],
    'o': ['i', 'p', 'l'],
    'p': ['o', 'l'],
    'q': ['w', 'a'],
    'r': ['e', 't', 'f'],
    's': ['a', 'd', 'w'],
    't': ['r', 'y', 'g'],
    'u': ['y', 'i', 'j'],
    'v': ['c', 'b', 'f'],
    'w': ['q', 'e', 's'],
    'x': ['z', 'c', 's'],
    'y': ['t', 'u', 'h'],
    'z': ['a', 'x']
};

// =====================================================
// MAIN FUNCTIONS
// =====================================================

/**
 * Apply imperfections to text
 */
export function addImperfections(
    text: string,
    config: Partial<ImperfectionConfig> = {},
    context: ImperfectionContext = {}
): string {
    // [EMERGENCY FIX] Disable all imperfections - AI responses were becoming too processed
    // The "humanization" was making the AI feel dumb and unnatural
    console.log('[ImperfectionEngine] DISABLED - returning original text');
    return text;
}

/**
 * Add a single typo
 */
function addTypo(text: string): string {
    const words = text.split(' ');

    // Try common word typos first
    for (let i = 0; i < words.length; i++) {
        const word = words[i].toLowerCase();
        if (COMMON_TYPOS[word]) {
            const typos = COMMON_TYPOS[word];
            words[i] = typos[Math.floor(Math.random() * typos.length)];
            return words.join(' ');
        }
    }

    // Otherwise, random typo
    const typoType = Math.floor(Math.random() * 4);
    const wordIndex = Math.floor(Math.random() * words.length);
    const word = words[wordIndex];

    if (word.length < 3) return text;

    switch (typoType) {
        case 0: // Double letter
            const pos1 = Math.floor(Math.random() * word.length);
            words[wordIndex] = word.slice(0, pos1) + word.charAt(pos1) + word.slice(pos1);
            break;

        case 1: // Adjacent key
            const pos2 = Math.floor(Math.random() * word.length);
            const char = word.charAt(pos2).toLowerCase();
            const adjacent = ADJACENT_KEYS[char];
            if (adjacent) {
                const newChar = adjacent[Math.floor(Math.random() * adjacent.length)];
                words[wordIndex] = word.slice(0, pos2) + newChar + word.slice(pos2 + 1);
            }
            break;

        case 2: // Missing letter
            const pos3 = Math.floor(Math.random() * word.length);
            words[wordIndex] = word.slice(0, pos3) + word.slice(pos3 + 1);
            break;

        case 3: // Swapped letters
            const pos4 = Math.floor(Math.random() * (word.length - 1));
            words[wordIndex] = word.slice(0, pos4) + word.charAt(pos4 + 1) + word.charAt(pos4) + word.slice(pos4 + 2);
            break;
    }

    return words.join(' ');
}

/**
 * Validates if abbreviation is appropriate for the current context (Prompt B4/F1)
 */
function shouldAbbreviate(
    targetAbbr: string,
    context: ImperfectionContext
): boolean {
    // 1. Technical Context Check
    if (context.isTechnical) return false;

    // 2. Emotional Context Check (Never abbreviate in serious emotional moments)
    if (context.isEmotional) return false;

    // 3. First Message Check
    if (context.isFirstMessage) return false;

    // 4. Serious Mood Check
    if (context.messageMood === 'serious' || context.messageMood === 'angry') return false;

    // 5. User Vocabulary Check (Strict)
    if (context.observedUserAbbreviations) {
        // Universally accepted "soft" abbreviations that almost everyone accepts even if not explicitly used
        const universals = ['gonna', 'wanna', 'kinda', 'omg'];

        if (universals.includes(targetAbbr.toLowerCase())) return true;

        // Otherwise, must have been seen in user messages
        if (!context.observedUserAbbreviations.has(targetAbbr.toLowerCase())) {
            return false;
        }
    } else if (context.userUsesAbbreviations === false) {
        // Fallback for legacy support if set not provided
        if (!['u', 'ur', 'gonna', 'wanna'].includes(targetAbbr.toLowerCase())) return false;
    }

    return true;
}

/**
 * Add common abbreviations with strict context checking
 */
function addAbbreviations(text: string, context: ImperfectionContext): string {
    const abbreviations: [RegExp, string, string][] = [
        [/\byou\b/gi, 'u', 'you'],
        [/\byour\b/gi, 'ur', 'your'],
        [/\byou're\b/gi, 'ur', 'you\'re'],
        [/\bare\b/gi, 'r', 'are'],
        [/\bpeople\b/gi, 'ppl', 'people'],
        [/\bprobably\b/gi, 'prob', 'probably'],
        [/\bsomething\b/gi, 'smth', 'something'],
        [/\bsomeone\b/gi, 'sm1', 'someone'],
        [/\bgoing to\b/gi, 'gonna', 'going to'],
        [/\bwant to\b/gi, 'wanna', 'want to'],
        [/\bgot to\b/gi, 'gotta', 'got to'],
        [/\bkind of\b/gi, 'kinda', 'kind of'],
        [/\bI don't know\b/gi, 'idk', 'I don\'t know'],
        [/\bto be honest\b/gi, 'tbh', 'to be honest'],
        [/\bby the way\b/gi, 'btw', 'by the way'],
        [/\bfor real\b/gi, 'fr', 'for real'],
        [/\bright now\b/gi, 'rn', 'right now'],
        [/\boh my god\b/gi, 'omg', 'oh my god'],
        [/\blove you\b/gi, 'ly', 'love you']
    ];

    // Apply 1-2 random abbreviations
    const count = 1 + Math.floor(Math.random() * 2);
    let result = text;

    for (let i = 0; i < count; i++) {
        const index = Math.floor(Math.random() * abbreviations.length);
        const [pattern, replacement, original] = abbreviations[index];

        if (pattern.test(result) && shouldAbbreviate(replacement, context)) {
            result = result.replace(pattern, replacement);
        }
    }

    return result;
}

/**
 * Add self-corrections
 * Real people correct their typos with *correction
 */
export function addSelfCorrection(messages: string[]): string[] {
    if (messages.length === 0) return messages;

    // 8% chance of a correction
    if (Math.random() > 0.08) return messages;

    const lastMsg = messages[messages.length - 1];
    const words = lastMsg.split(' ');

    if (words.length < 2) return messages;

    // Pick a random word to "correct"
    const wordIndex = Math.floor(Math.random() * words.length);
    const word = words[wordIndex];

    if (word.length < 3) return messages;

    // Create a "typo" version
    const typo = addTypo(word);
    words[wordIndex] = typo;

    // Replace last message with typo version
    messages[messages.length - 1] = words.join(' ');

    // Add correction
    messages.push(`*${word}`);

    return messages;
}

/**
 * Add "thought continuation" messages
 * Real people add to their thoughts in subsequent messages
 */
export function addThoughtContinuation(text: string): string[] {
    if (text.length < 50 || Math.random() > 0.15) return [text];

    const continuations = [
        ['idk tho', 'but like', 'wait actually', 'nvm', 'like'],
        ['if that makes sense', 'ya know', 'or whatever', 'but yea']
    ];

    const parts = splitAtNaturalPoint(text);
    if (parts.length === 1) return parts;

    // Maybe add a continuation phrase
    if (Math.random() < 0.3 && parts.length > 1) {
        const cont = continuations[0][Math.floor(Math.random() * continuations[0].length)];
        parts[parts.length - 1] = cont + ' ' + parts[parts.length - 1];
    }

    return parts;
}

/**
 * Split text at natural thought breaks
 */
function splitAtNaturalPoint(text: string): string[] {
    // Split on conjunctions
    const parts = text.split(/(?:,\s*(?:but|and|so|like)\s+)|(?:\.\s+)/gi);

    if (parts.length > 3) {
        // Merge some back together
        const merged: string[] = [];
        for (let i = 0; i < parts.length; i += 2) {
            merged.push((parts[i] + (parts[i + 1] ? '. ' + parts[i + 1] : '')).trim());
        }
        return merged.filter(p => p.length > 0);
    }

    return parts.filter(p => p.trim().length > 0);
}

// =====================================================
// EXPORTS
// =====================================================

export {
    addTypo,
    addAbbreviations,
    splitAtNaturalPoint
};
