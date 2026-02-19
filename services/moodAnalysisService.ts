
/**
 * @file services/moodAnalysisService.ts
 * @description Analyzes conversation history to determine current mood and vibe
 */

import { Message } from '../types';

export interface MoodAnalysis {
    mood: 'excited' | 'normal' | 'tired' | 'sad' | 'angry' | 'playful' | 'serious';
    personaVibe: 'casual' | 'formal' | 'intimate' | 'professional' | 'chaotic';
    intensity: number;  // 0-1
    confidence: number; // 0-1
}

const KEYWORD_PATTERNS = {
    excited: /(\b(omg|wow|awesome|love|great|yay|excited|amazing|cant wait|best)\b|!!!)/i,
    sad: /(\b(sad|sorry|hurt|miss|bad|depressed|cry|tears|unhappy|pain|grief)\b|:\()/i,
    angry: /\b(hate|stupid|idiot|fuck|shit|damn|angry|mad|stop|annoying|shut up)\b/i,
    tired: /\b(sleep|tired|bed|exhausted|yawn|boring|nap|gn|night)\b/i,
    playful: /(\b(haha|lol|lmao|joke|fun|kidding|jk|rofl|hehe)\b|😜|😂)/i,
    serious: /\b(discuss|matter|important|question|understand|perspective|opinion)\b/i,
    intimate: /\b(love you|babe|darling|heart|cuddle|kiss|miss you|us|together)\b/i,
    formal: /\b(sir|madam|please|thank you|regards|sincerely|appreciate|assistance)\b/i,
    chaotic: /\b(sksksk|asdf|keymash|screaming|dead|lmfao)\b/i
};

export function analyzeMoodFromConversation(messages: Message[]): MoodAnalysis {
    if (!messages || messages.length === 0) {
        return {
            mood: 'normal',
            personaVibe: 'casual',
            intensity: 0.5,
            confidence: 0
        };
    }

    // 1. Prepare Data
    const recentMessages = messages.slice(-5);
    const lastUserMsg = [...recentMessages].reverse().find(m => m.role === 'user');
    const combinedText = recentMessages.map(m => m.text).join(' ');

    // Default Scores
    const scores = {
        excited: 0,
        normal: 1, // Baseline
        tired: 0,
        sad: 0,
        angry: 0,
        playful: 0,
        serious: 0
    };

    // 2. Keyword Analysis
    for (const [key, pattern] of Object.entries(KEYWORD_PATTERNS)) {
        const matches = (combinedText.match(pattern) || []).length;
        if (key in scores) {
            // @ts-ignore
            scores[key] += matches * 1.5;
        }
    }

    // 3. Structural Analysis (Punctuation & Caps)
    const exclamationCount = (combinedText.match(/!/g) || []).length;
    const questionCount = (combinedText.match(/\?/g) || []).length;
    const capsRatio = combinedText.replace(/[^A-Z]/g, "").length / (combinedText.length || 1);

    if (exclamationCount > 2) scores.excited += 2;
    if (capsRatio > 0.4 && combinedText.length > 20) {
        // High caps usually means excited or angry
        if (scores.angry > scores.excited) scores.angry += 3;
        else scores.excited += 2;
    }
    if (questionCount > 2) scores.serious += 1;

    // 4. Time of Day Context - WEIGHTED by content confidence
    // If conversation has clear emotional signals, time matters less
    const hour = new Date().getHours();
    const isLateNight = hour < 5 || hour > 23;
    const isEarlyMorning = hour >= 5 && hour < 8;

    // Calculate content confidence: how much emotional signal exists in text?
    const totalContentSignal = Object.values(scores).reduce((a, b) => a + b, 0) - 1; // subtract baseline
    const contentConfidence = Math.min(1, totalContentSignal / 5); // 0-1 scale

    // Time influence is INVERSELY proportional to content confidence
    // Strong conversation signals = time matters less
    const timeWeight = Math.max(0.1, 1 - contentConfidence * 0.8);

    if (isLateNight) {
        scores.tired += 1.5 * timeWeight;
        scores.serious += 0.5 * timeWeight;
    } else if (isEarlyMorning) {
        scores.tired += 1.0 * timeWeight;
    }

    // 5. Message Length Patterns
    if (lastUserMsg) {
        if (lastUserMsg.text.length < 5) {
            // Very short replies might indicate tiredness or disinterest (normal)
            scores.tired += 0.5;
            scores.normal += 0.5;
        } else if (lastUserMsg.text.length > 100) {
            // Long messages indicate engagement
            scores.serious += 1;
            scores.excited += 0.5;
        }
    }

    // 6. Determine Dominant Mood
    let bestMood: keyof typeof scores = 'normal';
    let maxScore = -1;

    for (const [mood, score] of Object.entries(scores)) {
        if (score > maxScore) {
            maxScore = score;
            // @ts-ignore
            bestMood = mood;
        }
    }

    // 7. Determine Vibe
    let vibe: MoodAnalysis['personaVibe'] = 'casual';
    const formalMatches = (combinedText.match(KEYWORD_PATTERNS.formal) || []).length;
    const intimateMatches = (combinedText.match(KEYWORD_PATTERNS.intimate) || []).length;
    const chaoticMatches = (combinedText.match(KEYWORD_PATTERNS.chaotic) || []).length;

    if (formalMatches > 1) vibe = 'formal';
    else if (intimateMatches > 0) vibe = 'intimate';
    else if (chaoticMatches > 0 || (scores.playful > 3 && capsRatio > 0.2)) vibe = 'chaotic';
    else if (lastUserMsg && lastUserMsg.text.length > 200) vibe = 'professional'; // Long text assumed professional/serious default

    // Normalize intensity (simple clamp based on score)
    const intensity = Math.min(1, maxScore / 5);

    return {
        mood: bestMood,
        personaVibe: vibe,
        intensity,
        confidence: Math.min(1, maxScore / (Object.values(scores).reduce((a, b) => a + b, 0) || 1))
    };
}
