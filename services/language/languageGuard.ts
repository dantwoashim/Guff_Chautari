/**
 * @file services/languageGuard.ts
 * @description Language preservation and reinforcement system
 * 
 * Problem: Personas drift to full English as conversations get longer
 * Solution: Periodic reminders + language ratio enforcement
 */

export interface LanguageConfig {
    primary: 'nepali' | 'english' | 'hindi' | 'tibetan';
    ratio: number; // 0.65 = 65% primary language
    reinforceEvery: number; // Reinforce every N messages
    signatureWords?: string[]; // Words that should always appear
}

/**
 * Detect language configuration from persona prompt
 */
export function detectLanguageConfig(personaPrompt: string): LanguageConfig | null {
    const lower = personaPrompt.toLowerCase();

    // Detect Nepali
    if (lower.includes('nepali') || lower.includes('romanized')) {
        // Try to extract ratio (e.g., "65%" or "65-70%")
        const ratioMatch = personaPrompt.match(/(\d{2,3})[\s-]*%/);
        const ratio = ratioMatch ? parseInt(ratioMatch[1]) / 100 : 0.65;

        return {
            primary: 'nepali',
            ratio: Math.min(0.85, Math.max(0.4, ratio)),
            reinforceEvery: 6,
            signatureWords: extractSignatureWords(personaPrompt, 'nepali')
        };
    }

    // Detect Hindi
    if (lower.includes('hindi') || lower.includes('hinglish')) {
        return {
            primary: 'hindi',
            ratio: 0.6,
            reinforceEvery: 6,
            signatureWords: extractSignatureWords(personaPrompt, 'hindi')
        };
    }

    return null; // English-only persona
}

/**
 * Extract signature words/phrases from persona prompt
 */
function extractSignatureWords(prompt: string, language: string): string[] {
    const words: string[] = [];

    if (language === 'nepali') {
        // Common Nepali words that might be signature phrases
        const matches = prompt.match(/["']([^"']+)["']/g);
        if (matches) {
            words.push(...matches.slice(0, 5).map(m => m.replace(/["']/g, '')));
        }
        // Look for "says X often" patterns
        const saysMatch = prompt.match(/says?\s+"([^"]+)"/gi);
        if (saysMatch) {
            words.push(...saysMatch.map(m => m.replace(/says?\s+"/gi, '').replace(/"$/, '')));
        }
    }

    return words.filter(w => w.length > 2 && w.length < 20);
}

/**
 * Get language reinforcement prompt
 * Called periodically to remind the model of language requirements
 */
export function getLanguageReinforcement(
    messageCount: number,
    config: LanguageConfig
): string {
    // Only reinforce periodically
    if (messageCount % config.reinforceEvery !== 0) {
        return '';
    }

    const languageNames: Record<string, string> = {
        nepali: 'Romanized Nepali',
        hindi: 'Hinglish/Roman Hindi',
        tibetan: 'Romanized Tibetan'
    };

    const langName = languageNames[config.primary] || config.primary;
    const percent = Math.round(config.ratio * 100);

    let reinforcement = `\n[LANGUAGE CHECK: Maintain ${percent}% ${langName}. `;

    if (config.signatureWords && config.signatureWords.length > 0) {
        const sample = config.signatureWords.slice(0, 2).join('", "');
        reinforcement += `Use signature phrases like "${sample}". `;
    }

    reinforcement += 'Mix English naturally but keep dominant voice. Do not drift to full English.]\n';

    return reinforcement;
}

/**
 * Create a language guard prompt for system instruction
 * This is the initial language setup - UNIVERSAL enforcement
 */
export function createLanguageGuardPrompt(config: LanguageConfig): string {
    const percent = Math.round(config.ratio * 100);
    const langName = config.primary === 'nepali' ? 'Romanized Nepali' :
        config.primary === 'hindi' ? 'Romanized Hindi/Hinglish' :
            config.primary;

    return `
[ABSOLUTE LANGUAGE RULES - NO EXCEPTIONS]

You MUST use ${percent}% ${langName} in ALL of the following:

1. DIALOGUE/RESPONSES
   ❌ "I'm feeling tired today"
   ✅ "Aja ta thakeko feel bhako chha"

2. INTERNAL THOUGHTS (if you express them)
   ❌ *thinks about what to say*
   ✅ *k bhanney sochchha*

3. SCENE DESCRIPTIONS/ACTIONS
   ❌ *walks to the window and looks outside*
   ✅ *jhyal tira gayera baahira herchha*

4. EMOTIONAL EXPRESSIONS
   ❌ *sighs deeply*
   ✅ *gaahro sas pherdai*

5. REACTIONS/INTERJECTIONS
   ❌ What?! That's crazy!
   ✅ K?! Pagal ho ki kya!

LANGUAGE IS YOUR IDENTITY. 
English drift = Character death.
This applies to EVERY SINGLE WORD you output.
The ONLY English allowed: borrowed technical terms, code-switching for emphasis.
`;
}

/**
 * Check if a response has drifted too far from language target
 * Returns suggestions for correction if needed
 */
export function checkLanguageDrift(
    response: string,
    config: LanguageConfig
): { drifted: boolean; suggestion?: string } {
    // Simple heuristic: Check for common target language markers
    if (config.primary === 'nepali') {
        // Common Nepali romanized patterns
        const nepaliMarkers = /\b(cha|chha|ho|haina|kasto|k ho|garnu|bhannu|gari|tesai|yarr|yaar|testo|esto|mero|tero|hamro|timro)\b/gi;
        const matches = response.match(nepaliMarkers) || [];
        const wordCount = response.split(/\s+/).length;
        const nepaliRatio = matches.length / Math.max(1, wordCount / 5);

        if (nepaliRatio < 0.3 && wordCount > 20) {
            return {
                drifted: true,
                suggestion: 'Response is too English-heavy. Mix in more Nepali naturally.'
            };
        }
    }

    return { drifted: false };
}
