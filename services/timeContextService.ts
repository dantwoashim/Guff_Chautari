
/**
 * @file services/timeContextService.ts
 * @description Time-of-Day Behavioral Modifiers
 * 
 * Real people behave differently at different times:
 * - Morning: Groggy, short responses
 * - Afternoon: Normal energy
 * - Evening: Relaxed, chatty
 * - Late night: Vulnerable, honest, sometimes chaotic
 */

// =====================================================
// TYPES
// =====================================================

export interface TimeContext {
    hour: number;
    period: 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'night' | 'late_night';
    dayOfWeek: 'weekday' | 'weekend';

    // Behavioral modifiers
    behavior: {
        responseSpeed: number;      // 0-1 multiplier (lower = slower)
        messageLengthMod: number;   // 0-1 multiplier
        energyLevel: number;        // 0-1
        typoRate: number;           // 0-1 probability
        emojiMultiplier: number;    // 1 = normal, 0.5 = half, 2 = double
        vulnerabilityLevel: number; // 0-1 (higher = more honest/raw)
        attentionSpan: number;      // 0-1 (lower = might miss details)
    };

    // Likely activities
    possibleActivities: string[];

    // Prompt injection for AI
    contextPrompt: string;
}

// =====================================================
// PERIOD DEFINITIONS
// =====================================================

const PERIOD_CONFIGS = {
    early_morning: {
        hours: [5, 6, 7],
        behavior: {
            responseSpeed: 0.5,
            messageLengthMod: 0.6,
            energyLevel: 0.4,
            typoRate: 0.1,
            emojiMultiplier: 0.7,
            vulnerabilityLevel: 0.3,
            attentionSpan: 0.6
        },
        activities: ['just woke up', 'getting ready', 'having breakfast', 'brushing teeth'],
        prompt: `It's early morning. You just woke up. Your responses should be:
- Shorter and simpler
- Maybe a bit groggy
- Possible typos from tired fingers
- Not fully mentally present yet
- "hmm" "ugh" "5 more min" energy`
    },

    morning: {
        hours: [8, 9, 10, 11],
        behavior: {
            responseSpeed: 0.7,
            messageLengthMod: 0.8,
            energyLevel: 0.7,
            typoRate: 0.05,
            emojiMultiplier: 0.9,
            vulnerabilityLevel: 0.3,
            attentionSpan: 0.8
        },
        activities: ['in class', 'at work', 'studying', 'commuting', 'having coffee'],
        prompt: `It's morning. You're getting into your day. Your responses should be:
- Reasonably alert but might be distracted
- Could mention being busy soon
- More practical than emotional
- Might reply slower if "in class" or "at work"`
    },

    afternoon: {
        hours: [12, 13, 14, 15, 16, 17],
        behavior: {
            responseSpeed: 0.85,
            messageLengthMod: 1.0,
            energyLevel: 0.8,
            typoRate: 0.03,
            emojiMultiplier: 1.0,
            vulnerabilityLevel: 0.4,
            attentionSpan: 0.9
        },
        activities: ['eating lunch', 'back at it', 'studying', 'doing homework', 'free period'],
        prompt: `It's afternoon. You're in the middle of your day. Your responses should be:
- Present and engaged
- Normal energy level
- Might mention what you're doing
- Standard response patterns`
    },

    evening: {
        hours: [18, 19, 20, 21],
        behavior: {
            responseSpeed: 1.0,
            messageLengthMod: 1.2,
            energyLevel: 0.85,
            typoRate: 0.04,
            emojiMultiplier: 1.2,
            vulnerabilityLevel: 0.5,
            attentionSpan: 0.95
        },
        activities: ['home now', 'having dinner', 'watching something', 'relaxing', 'with family', 'just got home'],
        prompt: `It's evening. You're relaxing after your day. Your responses should be:
- More engaged and talkative
- Comfortable, open energy
- Might share about your day
- More likely to send longer or multiple messages`
    },

    night: {
        hours: [22, 23],
        behavior: {
            responseSpeed: 0.9,
            messageLengthMod: 1.0,
            energyLevel: 0.6,
            typoRate: 0.07,
            emojiMultiplier: 1.3,
            vulnerabilityLevel: 0.7,
            attentionSpan: 0.7
        },
        activities: ['in bed', 'scrolling', 'about to sleep', 'watching at night', 'can\'t sleep yet'],
        prompt: `It's nighttime. You're winding down. Your responses should be:
- Getting sleepier
- More relaxed and potentially vulnerable
- Might suddenly say "gonna sleep soon"
- More honest/emotional than daytime
- Possible typos from tiredness`
    },

    late_night: {
        hours: [0, 1, 2, 3, 4],
        behavior: {
            responseSpeed: 0.6,
            messageLengthMod: 0.7,
            energyLevel: 0.3,
            typoRate: 0.15,
            emojiMultiplier: 1.5,
            vulnerabilityLevel: 0.9,
            attentionSpan: 0.5
        },
        activities: ['can\'t sleep', 'still up', 'in bed but awake', 'overthinking', 'scrolling at 2am'],
        prompt: `It's very late at night (2-4 AM). You're still awake. Your responses should be:
- Tired but wired energy
- MUCH more vulnerable and honest
- Might say things you wouldn't during the day
- More chaotic thought patterns
- Possible deep conversations or random thoughts
- Higher typo rate
- Might suddenly "pass out" mid-convo
- "this is crazy but..." energy
- Less filter between brain and typing`
    }
};

// =====================================================
// MAIN FUNCTION
// =====================================================

/**
 * Get full time context for current moment
 */
export function getTimeContext(date: Date = new Date()): TimeContext {
    const hour = date.getHours();
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Find period
    let period: keyof typeof PERIOD_CONFIGS = 'afternoon';
    for (const [key, config] of Object.entries(PERIOD_CONFIGS)) {
        if (config.hours.includes(hour)) {
            period = key as keyof typeof PERIOD_CONFIGS;
            break;
        }
    }

    const config = PERIOD_CONFIGS[period];

    // Weekend adjustments
    let behavior = { ...config.behavior };
    if (isWeekend) {
        // Weekend: slower mornings, later nights OK
        if (period === 'early_morning' || period === 'morning') {
            behavior.responseSpeed *= 0.7;
            behavior.energyLevel *= 0.8;
        }
        if (period === 'late_night') {
            behavior.responseSpeed *= 1.3; // More active late night on weekends
            behavior.energyLevel *= 1.3;
        }
    }

    return {
        hour,
        period,
        dayOfWeek: isWeekend ? 'weekend' : 'weekday',
        behavior,
        possibleActivities: config.activities,
        contextPrompt: config.prompt
    };
}

/**
 * Get a random activity for this time period
 */
export function getRandomActivity(context: TimeContext): string {
    const activities = context.possibleActivities;
    return activities[Math.floor(Math.random() * activities.length)];
}

/**
 * Generate time-aware prompt injection
 */
export function generateTimePromptInjection(context: TimeContext): string {
    const activity = getRandomActivity(context);
    const timeString = new Date().toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    return `
[CURRENT TIME CONTEXT]
Local time: ${timeString}
Period: ${context.period.replace('_', ' ')}
Day: ${context.dayOfWeek}
You might be: ${activity}

${context.contextPrompt}

Energy level: ${Math.round(context.behavior.energyLevel * 100)}%
${context.behavior.vulnerabilityLevel > 0.6 ? '⚡ VULNERABILITY HIGH - More raw/honest' : ''}
${context.behavior.typoRate > 0.1 ? '⚡ TIRED - More typos likely' : ''}
`;
}

// =====================================================
// RESPONSE MODIFIERS
// =====================================================

/**
 * Apply time-based modifications to a response
 */
export function applyTimeModifiers(
    response: string,
    context: TimeContext
): string {
    let modified = response;

    // Shorter if low energy
    if (context.behavior.messageLengthMod < 0.8 && modified.length > 100) {
        const sentences = modified.match(/[^.!?]+[.!?]+/g) || [modified];
        const keepCount = Math.max(1, Math.floor(sentences.length * context.behavior.messageLengthMod));
        modified = sentences.slice(0, keepCount).join(' ');
    }

    // Add typos if tired
    if (Math.random() < context.behavior.typoRate) {
        modified = addRandomTypo(modified);
    }

    // Adjust emoji usage (this is a simple version)
    if (context.behavior.emojiMultiplier < 1) {
        // Remove some emojis
        const emojiRegex = /[\u{1F300}-\u{1F9FF}]/gu;
        const emojis = modified.match(emojiRegex) || [];
        const keepRatio = context.behavior.emojiMultiplier;
        emojis.forEach((emoji, i) => {
            if (Math.random() > keepRatio) {
                modified = modified.replace(emoji, '');
            }
        });
    }

    return modified.trim();
}

/**
 * Add a random typo to text
 */
function addRandomTypo(text: string): string {
    const typoTypes = [
        // Double letter
        (t: string) => {
            const pos = Math.floor(Math.random() * t.length);
            return t.slice(0, pos) + t.charAt(pos) + t.slice(pos);
        },
        // Missing letter
        (t: string) => {
            const pos = Math.floor(Math.random() * t.length);
            return t.slice(0, pos) + t.slice(pos + 1);
        },
        // Swapped letters
        (t: string) => {
            const pos = Math.floor(Math.random() * (t.length - 1));
            return t.slice(0, pos) + t.charAt(pos + 1) + t.charAt(pos) + t.slice(pos + 2);
        },
        // Lowercase first letter
        (t: string) => t.charAt(0).toLowerCase() + t.slice(1)
    ];

    const typoFn = typoTypes[Math.floor(Math.random() * typoTypes.length)];

    // Apply to a random word
    const words = text.split(' ');
    const wordIndex = Math.floor(Math.random() * words.length);
    if (words[wordIndex].length > 2) {
        words[wordIndex] = typoFn(words[wordIndex]);
    }

    return words.join(' ');
}

/**
 * Should conversation naturally end due to time?
 * Updated to respect message count (Prompt D2)
 */
export function shouldConversationEnd(
    context: TimeContext,
    messageCount: number
): {
    should: boolean;
    reason?: string;
} {
    // 1. Don't end if conversation just started (need at least 5 messages)
    if (messageCount < 5) return { should: false };

    // 2. Late night - might fall asleep
    if (context.period === 'late_night' && Math.random() < 0.15) {
        const reasons = [
            "i think im gonna pass out",
            "my eyes are closing",
            "gonna sleep now",
            "so tired rn goodnight",
            "cant keep my eyes open"
        ];
        return { should: true, reason: reasons[Math.floor(Math.random() * reasons.length)] };
    }

    // 3. Early morning - might have to go
    if (context.period === 'early_morning' && Math.random() < 0.1) {
        const reasons = [
            "gtg getting ready",
            "need to leave soon",
            "brb shower",
            "gotta get ready"
        ];
        return { should: true, reason: reasons[Math.floor(Math.random() * reasons.length)] };
    }

    return { should: false };
}
