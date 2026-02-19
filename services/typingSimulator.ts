/**
 * @file services/typingSimulator.ts
 * @description Realistic Typing Indicator Simulation
 * 
 * Real typing indicators:
 * - Start/stop as person types
 * - Pause when thinking
 * - Show variable intensity
 */

// =====================================================
// TYPES
// =====================================================

export interface TypingState {
    isTyping: boolean;
    intensity: 'light' | 'normal' | 'heavy';
    phase: 'reading' | 'thinking' | 'typing' | 'paused' | 'done';
    startedAt: number;
    estimatedEnd: number;
}

export interface TypingSequence {
    states: TypingState[];
    totalDuration: number;
}

// =====================================================
// SIMULATOR
// =====================================================

/**
 * Generate realistic typing sequence for a response
 */
export function generateTypingSequence(
    responseLength: number,
    userMessageLength: number,
    mood: 'excited' | 'normal' | 'tired' | 'upset' = 'normal'
): TypingSequence {
    const states: TypingState[] = [];
    let currentTime = 0;

    // 1. READING PHASE - Person reads the message first
    const readingTime = calculateReadingTime(userMessageLength, mood);
    states.push({
        isTyping: false,
        intensity: 'light',
        phase: 'reading',
        startedAt: currentTime,
        estimatedEnd: currentTime + readingTime
    });
    currentTime += readingTime;

    // 2. THINKING PHASE - Short pause before typing (60% chance)
    if (Math.random() < 0.6) {
        const thinkingTime = 500 + Math.random() * 2000;
        states.push({
            isTyping: false,
            intensity: 'light',
            phase: 'thinking',
            startedAt: currentTime,
            estimatedEnd: currentTime + thinkingTime
        });
        currentTime += thinkingTime;
    }

    // 3. TYPING PHASE
    const baseTypingTime = calculateTypingDuration(responseLength, mood);
    const intensity = responseLength > 150 ? 'heavy' : responseLength > 50 ? 'normal' : 'light';

    // Should we have mid-typing pauses?
    const shouldPause = responseLength > 80 && Math.random() < 0.3;

    if (shouldPause) {
        // Type first half
        const firstHalf = baseTypingTime * 0.4;
        states.push({
            isTyping: true,
            intensity,
            phase: 'typing',
            startedAt: currentTime,
            estimatedEnd: currentTime + firstHalf
        });
        currentTime += firstHalf;

        // Pause (thinking/deleting)
        const pauseTime = 1000 + Math.random() * 2000;
        states.push({
            isTyping: false,
            intensity: 'light',
            phase: 'paused',
            startedAt: currentTime,
            estimatedEnd: currentTime + pauseTime
        });
        currentTime += pauseTime;

        // Resume typing
        const secondHalf = baseTypingTime * 0.6;
        states.push({
            isTyping: true,
            intensity,
            phase: 'typing',
            startedAt: currentTime,
            estimatedEnd: currentTime + secondHalf
        });
        currentTime += secondHalf;
    } else {
        // Continuous typing
        states.push({
            isTyping: true,
            intensity,
            phase: 'typing',
            startedAt: currentTime,
            estimatedEnd: currentTime + baseTypingTime
        });
        currentTime += baseTypingTime;
    }

    // 4. DONE
    states.push({
        isTyping: false,
        intensity: 'light',
        phase: 'done',
        startedAt: currentTime,
        estimatedEnd: currentTime
    });

    return { states, totalDuration: currentTime };
}

/**
 * Calculate reading time based on message length
 */
function calculateReadingTime(charCount: number, mood: string): number {
    // Average reading speed: 200-300 wpm
    // Average word length: 5 chars
    const words = charCount / 5;
    const baseWpm = mood === 'excited' ? 350 : mood === 'tired' ? 180 : 250;
    const readingTime = (words / baseWpm) * 60 * 1000;

    // Minimum 300ms, maximum 3s
    return Math.max(300, Math.min(3000, readingTime));
}

/**
 * Calculate typing duration based on response length
 */
function calculateTypingDuration(charCount: number, mood: string): number {
    // Typing speeds vary
    const typingSpeeds = {
        excited: 6,   // chars per second
        normal: 4.5,
        tired: 3,
        upset: 5      // Rage typing lol
    };

    const cps = typingSpeeds[mood as keyof typeof typingSpeeds] || 4.5;
    const variance = cps * 0.2 * (Math.random() - 0.5);
    const actualCps = cps + variance;

    const baseTime = (charCount / actualCps) * 1000;

    // Add "thinking while typing" time for longer messages
    const thinkingBonus = charCount > 100 ? charCount * 5 : 0;

    return Math.max(800, baseTime + thinkingBonus);
}

// =====================================================
// PLAYBACK CONTROLLER
// =====================================================

/**
 * Create a typing indicator controller for UI
 */
export function createTypingController(
    sequence: TypingSequence,
    onStateChange: (state: TypingState) => void
): { start: () => void; cancel: () => void } {
    let timeouts: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;

    return {
        start: () => {
            cancelled = false;

            for (const state of sequence.states) {
                const timeout = setTimeout(() => {
                    if (!cancelled) {
                        onStateChange(state);
                    }
                }, state.startedAt);

                timeouts.push(timeout);
            }
        },
        cancel: () => {
            cancelled = true;
            timeouts.forEach(clearTimeout);
            timeouts = [];
        }
    };
}

// =====================================================
// REACT HOOK HELPER
// =====================================================

/**
 * Get current typing state at a given time
 */
export function getStateAtTime(sequence: TypingSequence, time: number): TypingState | null {
    for (let i = sequence.states.length - 1; i >= 0; i--) {
        if (sequence.states[i].startedAt <= time) {
            return sequence.states[i];
        }
    }
    return null;
}