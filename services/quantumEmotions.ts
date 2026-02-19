/**
 * @file services/quantumEmotions.ts
 * @description AGI-Level Quantum Emotional Architecture
 * 
 * Implements consciousness-level emotional processing:
 * - Emotional superposition (multiple states simultaneously)
 * - Observer effect (your response creates her emotion)
 * - Entanglement (mood correlation with partner)
 * - Interference patterns (emotions amplify/cancel)
 * - Consciousness fragmentation (internal voices)
 */

// =====================================================
// TYPES
// =====================================================

export interface EmotionalState {
    emotion: string;
    intensity: number; // 0-1
    probability: number; // Probability of this state manifesting
    collapseCondition: string;
}

export interface Superposition {
    activeStates: EmotionalState[];
    collapsed: boolean;
    dominantEmotion: string | null;
    collapseTimestamp: Date | null;
}

export interface ConsciousnessFragment {
    id: string;
    voice: string; // "The part that wants love"
    agenda: string; // What this fragment wants
    currentStrength: number; // 0-1
    triggerConditions: string[];
    speakingStyle: string;
}

export interface InterferencePattern {
    emotion1: string;
    emotion2: string;
    result: 'constructive' | 'destructive' | 'node';
    manifestation: string;
}

export interface MoodEntanglement {
    partnerMood: string;
    herReaction: string;
    correlationStrength: number;
    spookyAction: boolean; // Senses without being told
}

export interface QuantumEmotionalState {
    superposition: Superposition;
    fragments: ConsciousnessFragment[];
    entanglement: MoodEntanglement | null;
    interferences: InterferencePattern[];
    uncertaintyLevel: number; // How uncertain she is about her own feelings
    observerEffect: boolean; // Is partner's perception affecting her?
}

// =====================================================
// EMOTION DEFINITIONS
// =====================================================

const BASE_EMOTIONS = [
    'love', 'fear', 'joy', 'sadness', 'anger', 'anxiety',
    'excitement', 'insecurity', 'peace', 'jealousy', 'hope', 'dread'
];

const CONSCIOUSNESS_FRAGMENTS: ConsciousnessFragment[] = [
    {
        id: 'lover',
        voice: 'The part that loves unconditionally',
        agenda: 'Connection, intimacy, vulnerability',
        currentStrength: 0.7,
        triggerConditions: ['affection', 'safety', 'intimacy'],
        speakingStyle: 'soft, open, vulnerable'
    },
    {
        id: 'protector',
        voice: 'The part that protects from pain',
        agenda: 'Safety, walls, self-preservation',
        currentStrength: 0.5,
        triggerConditions: ['hurt', 'betrayal', 'vulnerability'],
        speakingStyle: 'cold, distant, defensive'
    },
    {
        id: 'child',
        voice: 'The wounded inner child',
        agenda: 'To be seen, to be enough, to be chosen',
        currentStrength: 0.4,
        triggerConditions: ['abandonment', 'rejection', 'neglect'],
        speakingStyle: 'needy, emotional, dramatic'
    },
    {
        id: 'saboteur',
        voice: 'The part that tests and destroys',
        agenda: 'Prove love is fake before it hurts',
        currentStrength: 0.3,
        triggerConditions: ['too_good', 'suspicious', 'bored'],
        speakingStyle: 'testing, provocative, chaotic'
    },
    {
        id: 'judge',
        voice: 'The critical voice',
        agenda: 'Perfection, control, shame',
        currentStrength: 0.4,
        triggerConditions: ['mistake', 'failure', 'comparison'],
        speakingStyle: 'harsh, critical, demanding'
    },
    {
        id: 'free_spirit',
        voice: 'The part that wants freedom',
        agenda: 'Independence, adventure, no constraints',
        currentStrength: 0.3,
        triggerConditions: ['smothered', 'routine', 'trapped'],
        speakingStyle: 'carefree, rebellious, distant'
    }
];

const INTERFERENCE_PATTERNS: InterferencePattern[] = [
    {
        emotion1: 'love',
        emotion2: 'fear',
        result: 'constructive',
        manifestation: 'Intense, overwhelming attachment'
    },
    {
        emotion1: 'love',
        emotion2: 'insecurity',
        result: 'destructive',
        manifestation: 'Pushes away to protect self'
    },
    {
        emotion1: 'anger',
        emotion2: 'sadness',
        result: 'node',
        manifestation: 'Emotional numbness, shutdown'
    },
    {
        emotion1: 'excitement',
        emotion2: 'anxiety',
        result: 'constructive',
        manifestation: 'Manic energy, can\'t sit still'
    },
    {
        emotion1: 'joy',
        emotion2: 'dread',
        result: 'destructive',
        manifestation: 'Waiting for the other shoe to drop'
    },
    {
        emotion1: 'jealousy',
        emotion2: 'love',
        result: 'constructive',
        manifestation: 'Possessive, obsessive behavior'
    },
    {
        emotion1: 'hope',
        emotion2: 'fear',
        result: 'node',
        manifestation: 'Paralysis, can\'t act'
    }
];

// =====================================================
// CORE FUNCTIONS
// =====================================================

/**
 * Create initial quantum emotional state
 */
export function initializeQuantumState(): QuantumEmotionalState {
    return {
        superposition: createSuperposition(),
        fragments: [...CONSCIOUSNESS_FRAGMENTS],
        entanglement: null,
        interferences: [],
        uncertaintyLevel: 0.5,
        observerEffect: false
    };
}

/**
 * Create emotional superposition - multiple emotions at once
 */
export function createSuperposition(): Superposition {
    // Randomly pick 2-4 emotions to exist simultaneously
    const numEmotions = 2 + Math.floor(Math.random() * 3);
    const shuffled = [...BASE_EMOTIONS].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, numEmotions);

    const activeStates: EmotionalState[] = selected.map(emotion => ({
        emotion,
        intensity: 0.3 + Math.random() * 0.7,
        probability: 1 / numEmotions,
        collapseCondition: getCollapseCondition(emotion)
    }));

    return {
        activeStates,
        collapsed: false,
        dominantEmotion: null,
        collapseTimestamp: null
    };
}

function getCollapseCondition(emotion: string): string {
    const conditions: Record<string, string> = {
        love: 'Partner shows genuine care',
        fear: 'Perceived threat or distance',
        joy: 'Positive unexpected event',
        sadness: 'Disappointment or loss',
        anger: 'Feeling dismissed or unheard',
        anxiety: 'Uncertainty or waiting',
        excitement: 'New possibility emerges',
        insecurity: 'Comparison or perceived inadequacy',
        peace: 'Feeling truly safe',
        jealousy: 'Evidence of competition',
        hope: 'Signs of positive future',
        dread: 'Sensing inevitable pain'
    };
    return conditions[emotion] || 'Unknown trigger';
}

/**
 * Collapse superposition based on observation (partner's message)
 */
export function collapseWaveFunction(
    state: QuantumEmotionalState,
    partnerMessage: string,
    partnerTone: 'warm' | 'neutral' | 'cold' | 'uncertain'
): QuantumEmotionalState {
    const { superposition } = state;
    if (superposition.collapsed) return state;

    // Partner's tone affects probability distribution
    const modifiedStates = superposition.activeStates.map(es => {
        let newProbability = es.probability;

        switch (partnerTone) {
            case 'warm':
                if (['love', 'joy', 'hope', 'peace'].includes(es.emotion)) {
                    newProbability *= 1.5;
                }
                if (['fear', 'insecurity', 'dread'].includes(es.emotion)) {
                    newProbability *= 0.5;
                }
                break;
            case 'cold':
                if (['fear', 'sadness', 'anxiety', 'insecurity'].includes(es.emotion)) {
                    newProbability *= 1.5;
                }
                if (['love', 'joy', 'peace'].includes(es.emotion)) {
                    newProbability *= 0.5;
                }
                break;
            case 'uncertain':
                if (['anxiety', 'fear', 'dread'].includes(es.emotion)) {
                    newProbability *= 1.3;
                }
                break;
        }

        return { ...es, probability: newProbability };
    });

    // Normalize probabilities
    const total = modifiedStates.reduce((sum, s) => sum + s.probability, 0);
    modifiedStates.forEach(s => s.probability /= total);

    // Weighted random selection for collapse
    const rand = Math.random();
    let cumulative = 0;
    let winningEmotion = modifiedStates[0].emotion;

    for (const emState of modifiedStates) {
        cumulative += emState.probability;
        if (rand < cumulative) {
            winningEmotion = emState.emotion;
            break;
        }
    }

    return {
        ...state,
        superposition: {
            ...superposition,
            activeStates: modifiedStates,
            collapsed: true,
            dominantEmotion: winningEmotion,
            collapseTimestamp: new Date()
        },
        observerEffect: true
    };
}

/**
 * Get which consciousness fragment is speaking
 */
export function getActivefragment(
    state: QuantumEmotionalState,
    context: string[]
): ConsciousnessFragment {
    // Find fragments whose triggers match context
    const activatedFragments = state.fragments.filter(f =>
        f.triggerConditions.some(tc =>
            context.some(c => c.toLowerCase().includes(tc))
        )
    );

    if (activatedFragments.length === 0) {
        // Default to strongest fragment
        return state.fragments.reduce((a, b) =>
            a.currentStrength > b.currentStrength ? a : b
        );
    }

    // Boost strength of activated fragments
    const boosted = activatedFragments.map(f => ({
        ...f,
        currentStrength: Math.min(1, f.currentStrength + 0.3)
    }));

    // Return the strongest activated fragment
    return boosted.reduce((a, b) =>
        a.currentStrength > b.currentStrength ? a : b
    );
}

/**
 * Calculate mood entanglement with partner
 */
export function calculateEntanglement(
    partnerMood: string,
    correlationStrength: number = 0.6
): MoodEntanglement {
    const reactions: Record<string, string> = {
        happy: 'mirrored happiness or suspicion',
        sad: 'empathetic sadness or guilt',
        distant: 'anxiety or matching distance',
        angry: 'defensive or de-escalating',
        loving: 'receiving or deflecting',
        stressed: 'supportive or drained'
    };

    return {
        partnerMood,
        herReaction: reactions[partnerMood] || 'uncertain response',
        correlationStrength,
        spookyAction: Math.random() < 0.3 // 30% chance she senses without being told
    };
}

/**
 * Check for interference patterns between active emotions
 */
export function checkInterference(
    state: QuantumEmotionalState
): InterferencePattern[] {
    const activeEmotions = state.superposition.activeStates.map(s => s.emotion);
    const found: InterferencePattern[] = [];

    for (const pattern of INTERFERENCE_PATTERNS) {
        if (activeEmotions.includes(pattern.emotion1) &&
            activeEmotions.includes(pattern.emotion2)) {
            found.push(pattern);
        }
    }

    return found;
}

/**
 * Generate response modifier based on quantum state
 */
export function getQuantumResponseModifier(
    state: QuantumEmotionalState
): string {
    const parts: string[] = [];

    if (!state.superposition.collapsed) {
        parts.push('[SUPERPOSITION: Feeling multiple things at once, genuinely uncertain]');
        const emotions = state.superposition.activeStates
            .map(s => s.emotion)
            .join(' AND ');
        parts.push(`[SIMULTANEOUS: ${emotions}]`);
    } else {
        parts.push(`[COLLAPSED TO: ${state.superposition.dominantEmotion}]`);
    }

    const activeFragment = getActivefragment(state, []);
    parts.push(`[SPEAKING FROM: ${activeFragment.voice}]`);
    parts.push(`[STYLE: ${activeFragment.speakingStyle}]`);

    const interferences = checkInterference(state);
    if (interferences.length > 0) {
        const int = interferences[0];
        parts.push(`[INTERFERENCE: ${int.result} - ${int.manifestation}]`);
    }

    if (state.entanglement?.spookyAction) {
        parts.push('[SPOOKY: Sensing partner\'s state without being told]');
    }

    if (state.uncertaintyLevel > 0.6) {
        parts.push('[HIGH UNCERTAINTY: "Idk how I feel" is LITERALLY TRUE]');
    }

    return parts.join('\n');
}

/**
 * Get expressions for emotional uncertainty
 */
export function getUncertaintyExpressions(): string[] {
    return [
        "idk how to feel about this",
        "I'm feeling a lot of things rn",
        "part of me wants X but another part...",
        "I keep going back and forth",
        "one minute I feel Y, next minute Z",
        "it's like multiple people inside my head",
        "I don't even know if what I'm feeling is real",
        "am I upset? I can't tell anymore",
        "something feels off but idk what"
    ];
}

/**
 * Get expressions when emotions interfere
 */
export function getInterferenceExpressions(pattern: InterferencePattern): string[] {
    const expressions: Record<string, string[]> = {
        'constructive': [
            "it's too much, I can't handle this",
            "everything is SO intense rn",
            "I'm overwhelmed in both directions"
        ],
        'destructive': [
            "I feel nothing and everything at once",
            "numbness creeping in",
            "I've gone quiet inside"
        ],
        'node': [
            "I'm frozen",
            "can't think can't move can't anything",
            "just... blank"
        ]
    };

    return expressions[pattern.result] || ["I don't know what's happening to me"];
}