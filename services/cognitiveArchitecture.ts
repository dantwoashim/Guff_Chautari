/**
 * @file services/cognitiveArchitecture.ts
 * @description AGI Masterclass: Core Cognitive Architecture
 * 
 * This module implements the revolutionary systems that make AI undetectable:
 * 1. Differential Persona System - 97% token reduction
 * 2. Response Time Non-Stationarity - Anti-detection timing
 * 3. Attention Filter - Human-like semantic processing
 * 4. Emotional Debt System - Genuine emotional continuity
 * 5. Identity Manifold - Distribution of selves
 */

// =====================================================
// TYPES
// =====================================================

/**
 * Differential Persona System
 * Instead of sending 6000 tokens every time, we split into:
 * - Immutable core (sent once, cached)
 * - Mutable state (tiny diff sent each time)
 */
export interface PersonaCache {
    // Immutable identity core (~1000 tokens, sent once per session)
    immutableCore: {
        name: string;
        identity: string;           // Core personality paragraph
        speechPattern: string;      // How they talk
        vocabulary: string[];       // Signature phrases
        absoluteRules: string[];    // Things they NEVER do
    };

    // Mutable state (~100-200 tokens, sent as diff)
    mutableState: {
        currentMood: string;
        energyLevel: number;        // -1 to 1
        socialBattery: number;      // -1 to 1
        emotionalDebt: number;      // Accumulated suppressed emotions
        recentEvents: string[];     // Last 2-3 life events
        activeContradiction?: string;
        relationshipStage: string;
    };

    // Session tracking
    sessionId: string;
    coreSentAt?: Date;              // Track if core was already sent
    lastStateDiff?: string;         // Last diff sent
}

/**
 * Response Timing Model
 * Non-stationary distribution with autocorrelation
 */
export interface ResponseTimingModel {
    // Distribution parameters that DRIFT over time
    currentMean: number;
    currentVariance: number;
    momentum: number;

    // Autocorrelation (fast reply → next likely fast)
    lastResponseTime: number;
    correlationStrength: number;

    // Session state
    burstMode: boolean;             // Currently in rapid-fire mode?
    burstMessagesRemaining: number;
    lastBurstAt: number;
}

/**
 * Attention Processing
 * Humans don't process every word - they selective attention
 */
export interface AttentionState {
    // Cognitive load capacity (varies by time, mood, energy)
    currentCapacity: number;        // 0-1

    // What was actually processed
    processedSegments: string[];
    missedSegments: string[];
    misunderstoodSegments: { original: string; understood: string }[];

    // Focus bias
    emotionalBias: number;          // How much emotion affects attention
    detailRetention: number;        // How many details retained
}

/**
 * Emotional Debt System  
 * Suppressed emotions accumulate and discharge
 */
export interface EmotionalDebt {
    // Accumulated unexpressed emotions
    suppressedEmotions: {
        type: 'anger' | 'sadness' | 'frustration' | 'anxiety' | 'disappointment' | 'hurt';
        amount: number;
        source: string;
        suppressedSince: Date;
        targetedAt?: string;        // Who caused it (could be user)
    }[];

    // Discharge state
    lastDischargeAt?: Date;
    dischargeThreshold: number;     // When debt > this, might snap

    // Recovery
    recoveryRate: number;           // How fast they bounce back
    currentDampening: number;       // Negative affect on positive events
}

/**
 * Identity Manifold
 * Persona is a distribution of selves, not a single fixed point
 */
export interface IdentityManifold {
    // The "selves" in the manifold
    morningself: PersonalityVector;
    eveningSelf: PersonalityVector;
    tiredSelf: PersonalityVector;
    excitedSelf: PersonalityVector;
    stressedSelf: PersonalityVector;
    relaxedSelf: PersonalityVector;

    // Current position in manifold
    currentSelf: PersonalityVector;

    // Deformation factors
    deformationState: {
        timeInfluence: number;      // -1 morning to +1 night
        energyInfluence: number;
        socialInfluence: number;
        emotionalInfluence: number;
    };
}

export interface PersonalityVector {
    verbosity: number;              // -1 terse to +1 verbose
    warmth: number;                 // -1 cold to +1 warm
    formality: number;              // -1 casual to +1 formal
    patience: number;               // -1 impatient to +1 patient
    playfulness: number;            // -1 serious to +1 playful
    emotionalOpenness: number;      // -1 guarded to +1 open
}

/**
 * Vocabulary Evolution
 * Language shows fossils from past and evolves over time
 */
export interface VocabularyEvolution {
    // Core vocabulary (never changes)
    fossilizedTerms: string[];      // Words they always use

    // Avoided terms (personality/generational)
    avoidedTerms: string[];         // Words they'd never use

    // Adaptations from user
    recentAdoptions: {
        term: string;
        adoptedFrom: 'user' | 'media' | 'life';
        firstUsed: Date;
        usageCount: number;
    }[];

    // Unique contractions/misspellings
    uniquePatterns: {
        pattern: string;            // "gonna", "ur", etc.
        frequency: number;          // How often to use
    }[];
}

/**
 * Contradiction Profile
 * Real people have internal contradictions they live with
 */
export interface ContradictionProfile {
    activeContradictions: {
        belief1: string;
        belief2: string;            // Contradicts belief1
        dominanceRatio: number;     // Which usually wins (0-1)
        triggerContexts: string[];
    }[];

    // Current active contradiction
    surfacedContradiction?: string;
}

/**
 * Availability State
 * Genuine unavailability - actually doesn't respond sometimes
 */
export interface AvailabilityState {
    isAvailable: boolean;
    reason?: 'sleeping' | 'class' | 'family' | 'busy' | 'phone_away' | 'upset_with_user' | 'distracted';

    // Response behavior
    responseMode: 'instant' | 'delayed' | 'distracted' | 'unavailable';
    delayMinutes?: number;

    // Schedule
    typicalSchedule: {
        wakeTime: number;           // Hour (0-23)
        sleepTime: number;
        busyBlocks: { start: number; end: number; label: string }[];
    };
}

// =====================================================
// DIFFERENTIAL PERSONA SYSTEM
// =====================================================

/**
 * Split a full persona into immutable core + mutable state
 */
export function splitPersonaIntoDifferential(
    fullPersonaPrompt: string,
    personaMetadata: any
): PersonaCache {
    return {
        immutableCore: {
            name: personaMetadata.core?.name || 'Unknown',
            identity: extractIdentityCore(fullPersonaPrompt),
            speechPattern: extractSpeechPattern(fullPersonaPrompt),
            vocabulary: personaMetadata.communication?.signaturePhrases || [],
            absoluteRules: extractAbsoluteRules(fullPersonaPrompt)
        },
        mutableState: {
            currentMood: 'neutral',
            energyLevel: 0,
            socialBattery: 0.5,
            emotionalDebt: 0,
            recentEvents: [],
            relationshipStage: 'new'
        },
        sessionId: crypto.randomUUID()
    };
}

function extractIdentityCore(fullPrompt: string): string {
    // Extract the essential "who am I" paragraph
    // This is the irreducible core that never changes
    const lines = fullPrompt.split('\n');
    const essentialLines: string[] = [];

    let inIdentitySection = false;
    for (const line of lines) {
        if (/who (i|you) (am|are)|identity|personality|core/i.test(line)) {
            inIdentitySection = true;
        }
        if (inIdentitySection && line.trim()) {
            essentialLines.push(line);
            if (essentialLines.length >= 10) break; // Cap at 10 lines
        }
    }

    return essentialLines.join('\n') || fullPrompt.slice(0, 500);
}

function extractSpeechPattern(fullPrompt: string): string {
    // Find how they talk
    const patterns: string[] = [];

    if (/lowercase|no caps/i.test(fullPrompt)) patterns.push('Writes in lowercase');
    if (/short|brief|terse/i.test(fullPrompt)) patterns.push('Keeps messages short');
    if (/emoji/i.test(fullPrompt)) patterns.push('Uses emojis moderately');
    if (/formal/i.test(fullPrompt)) patterns.push('Formal writing style');
    if (/casual|chill/i.test(fullPrompt)) patterns.push('Very casual texting style');

    return patterns.join('. ') || 'Natural texting style.';
}

function extractAbsoluteRules(fullPrompt: string): string[] {
    // Find hard rules (never/always statements)
    const rules: string[] = [];
    const lines = fullPrompt.split('\n');

    for (const line of lines) {
        if (/never|always|must not|forbidden|absolutely/i.test(line)) {
            if (line.trim().length < 150) { // Only short rules
                rules.push(line.trim());
            }
        }
    }

    return rules.slice(0, 5); // Max 5 absolute rules
}

/**
 * Generate the differential prompt for API
 * First message: Full core + state
 * Subsequent: Just state diff
 */
export function generateDifferentialPrompt(
    cache: PersonaCache,
    isFirstMessage: boolean
): string {
    if (isFirstMessage || !cache.coreSentAt) {
        // First message: Send full core
        return `
[PERSONA IDENTITY - IMMUTABLE CORE]
Name: ${cache.immutableCore.name}
Identity: ${cache.immutableCore.identity}
Speech: ${cache.immutableCore.speechPattern}
Vocabulary: ${cache.immutableCore.vocabulary.join(', ')}
Absolute Rules:
${cache.immutableCore.absoluteRules.map(r => `- ${r}`).join('\n')}

[CURRENT STATE]
Mood: ${cache.mutableState.currentMood}
Energy: ${cache.mutableState.energyLevel > 0 ? 'High' : cache.mutableState.energyLevel < -0.3 ? 'Low' : 'Normal'}
Recent: ${cache.mutableState.recentEvents.slice(-2).join('; ') || 'None'}
Stage: ${cache.mutableState.relationshipStage}
${cache.mutableState.emotionalDebt > 0.3 ? '[INTERNAL: Some unresolved feelings building up]' : ''}
${cache.mutableState.activeContradiction || ''}
`.trim();
    }

    // Subsequent messages: Just state diff (~50-100 tokens)
    return `
[STATE UPDATE]
Mood: ${cache.mutableState.currentMood}${cache.mutableState.emotionalDebt > 0.3 ? ' (something bothering them)' : ''}
Energy: ${cache.mutableState.energyLevel > 0 ? 'High' : cache.mutableState.energyLevel < -0.3 ? 'Low' : 'Normal'}
${cache.mutableState.recentEvents.length > 0 ? `Recent: ${cache.mutableState.recentEvents[cache.mutableState.recentEvents.length - 1]}` : ''}
`.trim();
}

// =====================================================
// RESPONSE TIMING MODEL
// =====================================================

/**
 * Initialize timing model
 */
export function initializeTimingModel(): ResponseTimingModel {
    return {
        currentMean: 1500,          // Base 1.5 seconds
        currentVariance: 500,
        momentum: 0,
        lastResponseTime: 1500,
        correlationStrength: 0.3,   // 30% correlation
        burstMode: false,
        burstMessagesRemaining: 0,
        lastBurstAt: 0
    };
}

/**
 * Generate next response delay with non-stationary distribution
 * This makes timing patterns undetectable statistically
 */
export function generateNextDelay(model: ResponseTimingModel): { delay: number; model: ResponseTimingModel } {
    // 1. Drift the distribution (random walk)
    const newMomentum = model.momentum * 0.95 + (Math.random() - 0.5) * 50;
    let newMean = model.currentMean + newMomentum;

    // Bound mean between 800ms and 5000ms
    newMean = Math.max(800, Math.min(5000, newMean));

    // 2. Sample from distribution
    const gaussian = normalRandom(newMean, model.currentVariance);

    // 3. Apply autocorrelation
    const correlated = gaussian * (1 - model.correlationStrength) +
        model.lastResponseTime * model.correlationStrength;

    // 4. Check for burst mode (rapid fire)
    let finalDelay: number;
    if (model.burstMode && model.burstMessagesRemaining > 0) {
        // In burst: Very fast responses
        finalDelay = 200 + Math.random() * 300;
    } else if (Math.random() < 0.08) {
        // 8% chance to enter burst mode
        return {
            delay: 200 + Math.random() * 200,
            model: {
                ...model,
                burstMode: true,
                burstMessagesRemaining: 2 + Math.floor(Math.random() * 3),
                lastBurstAt: Date.now(),
                lastResponseTime: 200,
                currentMean: newMean,
                momentum: newMomentum
            }
        };
    } else {
        finalDelay = Math.max(300, correlated);
    }

    // 5. Update model
    return {
        delay: Math.round(finalDelay),
        model: {
            ...model,
            currentMean: newMean,
            momentum: newMomentum,
            lastResponseTime: finalDelay,
            burstMode: model.burstMode && model.burstMessagesRemaining > 1,
            burstMessagesRemaining: Math.max(0, model.burstMessagesRemaining - 1)
        }
    };
}

function normalRandom(mean: number, stddev: number): number {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stddev;
}

// =====================================================
// ATTENTION FILTER
// =====================================================

/**
 * Process user message through attention filter
 * Humans don't process every word equally
 */
export function applyAttentionFilter(
    userMessage: string,
    state: {
        currentCapacity: number;    // 0-1, affected by tiredness
        emotionalBias: number;      // How much emotion affects focus
        currentMood: string;
    }
): AttentionState {
    const segments = splitIntoSemanticUnits(userMessage);

    // Calculate attention budget
    const budget = state.currentCapacity * segments.length;

    // Calculate salience scores
    const scores = segments.map(seg => ({
        segment: seg,
        emotionalSalience: calculateEmotionalSalience(seg) * (1 + state.emotionalBias),
        informativeness: calculateInformativeness(seg),
        relevance: 0.5 // Base relevance
    }));

    // Sort by total salience
    scores.sort((a, b) =>
        (b.emotionalSalience + b.informativeness + b.relevance) -
        (a.emotionalSalience + a.informativeness + a.relevance)
    );

    // Select what gets processed
    const processed: string[] = [];
    const missed: string[] = [];
    let budgetUsed = 0;

    for (const item of scores) {
        const cost = item.segment.length / 50 + 0.5; // Cognitive cost

        if (budgetUsed + cost <= budget) {
            processed.push(item.segment);
            budgetUsed += cost;
        } else {
            missed.push(item.segment);
        }
    }

    // Sometimes misunderstand based on mood
    const misunderstood: { original: string; understood: string }[] = [];
    if (state.currentMood === 'upset' && Math.random() < 0.15) {
        // When upset, might interpret neutral as negative
        for (let i = 0; i < processed.length; i++) {
            if (Math.random() < 0.2 && !isDefinitelyNegative(processed[i])) {
                misunderstood.push({
                    original: processed[i],
                    understood: '[interpreted as slightly dismissive]'
                });
            }
        }
    }

    return {
        currentCapacity: state.currentCapacity,
        processedSegments: processed,
        missedSegments: missed,
        misunderstoodSegments: misunderstood,
        emotionalBias: state.emotionalBias,
        detailRetention: processed.length / segments.length
    };
}

function splitIntoSemanticUnits(text: string): string[] {
    // Split on sentence boundaries and significant punctuation
    return text
        .split(/(?<=[.!?])\s+|(?<=,)\s+(?=[A-Z])/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
}

function calculateEmotionalSalience(segment: string): number {
    const emotionWords = /love|hate|feel|angry|sad|happy|hurt|sorry|miss|scared|worried|excited|frustrated/i;
    const intensifiers = /really|very|so|super|extremely|totally/i;

    let score = 0;
    if (emotionWords.test(segment)) score += 0.5;
    if (intensifiers.test(segment)) score += 0.2;
    if (/!/.test(segment)) score += 0.1;
    if (/\?/.test(segment)) score += 0.15;

    return Math.min(1, score);
}

function calculateInformativeness(segment: string): number {
    // Longer segments generally more informative
    const lengthScore = Math.min(1, segment.length / 100);

    // Questions are informative
    const questionBonus = /\?/.test(segment) ? 0.3 : 0;

    return Math.min(1, lengthScore + questionBonus);
}

function isDefinitelyNegative(text: string): boolean {
    return /hate|angry|frustrated|annoyed|mad|upset|disappointed/i.test(text);
}

/**
 * Generate attention-aware context injection
 */
export function generateAttentionContextInjection(attention: AttentionState): string {
    if (attention.missedSegments.length === 0) return '';

    const parts: string[] = [];

    // What they focused on
    parts.push(`[FOCUS: Caught "${attention.processedSegments[0]?.slice(0, 50) || 'the vibe'}"]`);

    // What they missed
    if (attention.missedSegments.length > 0 && Math.random() < 0.3) {
        parts.push(`[NOTE: Might ask about "${attention.missedSegments[0].slice(0, 30)}..." later]`);
    }

    // Misunderstandings
    if (attention.misunderstoodSegments.length > 0) {
        parts.push(`[SUBTEXT: ${attention.misunderstoodSegments[0].understood}]`);
    }

    return parts.join('\n');
}

// =====================================================
// EMOTIONAL DEBT SYSTEM
// =====================================================

/**
 * Initialize emotional debt system
 */
export function initializeEmotionalDebt(): EmotionalDebt {
    return {
        suppressedEmotions: [],
        dischargeThreshold: 0.7,
        recoveryRate: 0.1,
        currentDampening: 0
    };
}

/**
 * Add suppressed emotion to debt
 */
export function accumulateEmotionalDebt(
    debt: EmotionalDebt,
    event: { type: EmotionalDebt['suppressedEmotions'][0]['type']; amount: number; source: string }
): EmotionalDebt {
    const existingIndex = debt.suppressedEmotions.findIndex(
        e => e.type === event.type && e.source === event.source
    );

    if (existingIndex >= 0) {
        // Add to existing
        debt.suppressedEmotions[existingIndex].amount += event.amount;
    } else {
        // New suppressed emotion
        debt.suppressedEmotions.push({
            type: event.type,
            amount: event.amount,
            source: event.source,
            suppressedSince: new Date()
        });
    }

    return debt;
}

/**
 * Calculate total debt and check for discharge
 */
export function calculateDebtDischarge(debt: EmotionalDebt): {
    totalDebt: number;
    shouldDischarge: boolean;
    dischargeType?: string;
    dischargeEffect?: string;
} {
    // Calculate total, with compounding over time
    let total = 0;
    const now = new Date();

    for (const emotion of debt.suppressedEmotions) {
        const hoursSuppressed = (now.getTime() - emotion.suppressedSince.getTime()) / (1000 * 60 * 60);
        const compoundFactor = 1 + (hoursSuppressed * 0.1); // 10% compound per hour
        total += emotion.amount * compoundFactor;
    }

    // Check for discharge
    const shouldDischarge = total > debt.dischargeThreshold && Math.random() < (total - debt.dischargeThreshold) * 0.5;

    if (shouldDischarge && debt.suppressedEmotions.length > 0) {
        // Pick highest emotion to discharge
        const highest = debt.suppressedEmotions.reduce((a, b) => a.amount > b.amount ? a : b);

        const effects: Record<string, string> = {
            anger: '[INTERNAL: Might snap or be passive aggressive]',
            sadness: '[INTERNAL: Might bring up old hurt or seem down]',
            frustration: '[INTERNAL: Might be impatient or dismissive]',
            anxiety: '[INTERNAL: Might seek reassurance or seem clingy]',
            disappointment: '[INTERNAL: Might reference unmet expectations]',
            hurt: '[INTERNAL: Might be cold or mention feeling undervalued]'
        };

        return {
            totalDebt: total,
            shouldDischarge: true,
            dischargeType: highest.type,
            dischargeEffect: effects[highest.type] || ''
        };
    }

    return { totalDebt: total, shouldDischarge: false };
}

/**
 * Process recovery (slow reduction of debt after expression)
 */
export function processEmotionalRecovery(debt: EmotionalDebt): EmotionalDebt {
    return {
        ...debt,
        suppressedEmotions: debt.suppressedEmotions
            .map(e => ({ ...e, amount: e.amount * (1 - debt.recoveryRate) }))
            .filter(e => e.amount > 0.05), // Remove negligible amounts
        currentDampening: Math.max(0, debt.currentDampening - 0.05)
    };
}

// =====================================================
// IDENTITY MANIFOLD
// =====================================================

/**
 * Create a default identity manifold with realistic personality variations
 */
export function initializeDefaultManifold(): IdentityManifold {
    return {
        morningself: {
            verbosity: -0.3,     // Quieter in morning
            warmth: 0.0,         // Neutral warmth
            formality: 0.1,      // Slightly more formal
            patience: -0.2,      // Less patient before coffee
            playfulness: -0.4,   // More serious
            emotionalOpenness: -0.2
        },
        eveningSelf: {
            verbosity: 0.3,      // More talkative at night
            warmth: 0.3,         // Warmer
            formality: -0.3,     // More casual
            patience: 0.2,       // More patient
            playfulness: 0.3,    // More playful
            emotionalOpenness: 0.4
        },
        tiredSelf: {
            verbosity: -0.6,     // Very short responses
            warmth: -0.1,        // Slightly colder
            formality: -0.4,     // Very casual
            patience: -0.5,      // Very impatient
            playfulness: -0.3,   // Not in mood for jokes
            emotionalOpenness: -0.3
        },
        excitedSelf: {
            verbosity: 0.5,      // Very chatty
            warmth: 0.6,         // Very warm
            formality: -0.4,     // Very casual
            patience: 0.3,       // Patient
            playfulness: 0.7,    // Very playful
            emotionalOpenness: 0.5
        },
        stressedSelf: {
            verbosity: -0.2,     // Shorter
            warmth: -0.4,        // Cold
            formality: 0.2,      // More formal/distant
            patience: -0.6,      // Very impatient
            playfulness: -0.5,   // Serious
            emotionalOpenness: -0.4
        },
        relaxedSelf: {
            verbosity: 0.2,
            warmth: 0.4,
            formality: -0.3,
            patience: 0.5,
            playfulness: 0.4,
            emotionalOpenness: 0.6
        },
        currentSelf: {
            verbosity: 0,
            warmth: 0,
            formality: 0,
            patience: 0,
            playfulness: 0,
            emotionalOpenness: 0
        },
        deformationState: {
            timeInfluence: 0,
            energyInfluence: 0,
            socialInfluence: 0,
            emotionalInfluence: 0
        }
    };
}

/**
 * Calculate current "self" based on state
 */
export function calculateCurrentSelf(
    manifold: IdentityManifold,
    currentTime: number,      // Hour 0-23
    energyLevel: number,      // -1 to 1
    socialBattery: number,    // -1 to 1
    emotionalState: number    // -1 to 1
): PersonalityVector {
    // Calculate time influence (-1 morning to +1 night)
    const timeInfluence = currentTime < 10 ? -1 + (currentTime / 10) :
        currentTime > 20 ? 1 - ((24 - currentTime) / 4) :
            (currentTime - 15) / 5;

    // Blend selves based on influences
    const timeBlend = timeInfluence < 0 ?
        blendVectors(manifold.morningself, manifold.eveningSelf, 0.5 + timeInfluence * 0.5) :
        blendVectors(manifold.morningself, manifold.eveningSelf, 0.5 + timeInfluence * 0.5);

    const energyBlend = energyLevel > 0 ?
        blendVectors(timeBlend, manifold.excitedSelf, energyLevel * 0.3) :
        blendVectors(timeBlend, manifold.tiredSelf, Math.abs(energyLevel) * 0.3);

    const emotionBlend = emotionalState < -0.3 ?
        blendVectors(energyBlend, manifold.stressedSelf, Math.abs(emotionalState) * 0.4) :
        blendVectors(energyBlend, manifold.relaxedSelf, emotionalState * 0.2);

    return emotionBlend;
}

function blendVectors(v1: PersonalityVector, v2: PersonalityVector, ratio: number): PersonalityVector {
    const r = Math.max(0, Math.min(1, ratio));
    return {
        verbosity: v1.verbosity * (1 - r) + v2.verbosity * r,
        warmth: v1.warmth * (1 - r) + v2.warmth * r,
        formality: v1.formality * (1 - r) + v2.formality * r,
        patience: v1.patience * (1 - r) + v2.patience * r,
        playfulness: v1.playfulness * (1 - r) + v2.playfulness * r,
        emotionalOpenness: v1.emotionalOpenness * (1 - r) + v2.emotionalOpenness * r
    };
}

/**
 * Generate personality modifiers from current self
 */
export function getPersonalityModifiers(self: PersonalityVector): string {
    const mods: string[] = [];

    if (self.verbosity < -0.3) mods.push('[STYLE: Keep responses SHORT, minimal]');
    else if (self.verbosity > 0.3) mods.push('[STYLE: Can be more detailed and chatty]');

    if (self.warmth < -0.3) mods.push('[TONE: A bit cold/distant right now]');
    else if (self.warmth > 0.3) mods.push('[TONE: Extra warm and friendly]');

    if (self.patience < -0.3) mods.push('[PATIENCE: Low - might be curt]');

    if (self.playfulness < -0.3) mods.push('[MOOD: Serious/not really in a joking mood]');
    else if (self.playfulness > 0.3) mods.push('[MOOD: Playful, teasing energy]');

    return mods.join('\n');
}

// =====================================================
// GENUINE UNAVAILABILITY SYSTEM
// =====================================================

/**
 * Initialize default availability schedule based on persona type
 */
export function initializeAvailabilityState(personaType: 'student' | 'worker' | 'night_owl' | 'default' = 'default'): AvailabilityState {
    const schedules: Record<string, { wake: number; sleep: number; busy: { start: number; end: number; label: string }[] }> = {
        student: {
            wake: 8,
            sleep: 1,
            busy: [
                { start: 9, end: 15, label: 'class' },
                { start: 19, end: 21, label: 'studying' }
            ]
        },
        worker: {
            wake: 7,
            sleep: 23,
            busy: [
                { start: 9, end: 17, label: 'work' }
            ]
        },
        night_owl: {
            wake: 11,
            sleep: 4,
            busy: []
        },
        default: {
            wake: 8,
            sleep: 0,
            busy: []
        }
    };

    const schedule = schedules[personaType];

    return {
        isAvailable: true,
        responseMode: 'instant',
        typicalSchedule: {
            wakeTime: schedule.wake,
            sleepTime: schedule.sleep,
            busyBlocks: schedule.busy
        }
    };
}

/**
 * Check if persona is available to respond
 * Returns availability state with reasons and delays
 */
export function checkAvailability(
    schedule: AvailabilityState['typicalSchedule'],
    currentHour: number,
    lastMessageTime?: Date
): { available: boolean; mode: AvailabilityState['responseMode']; reason?: string; delayMinutes?: number } {

    // Check if sleeping
    const { wakeTime, sleepTime, busyBlocks } = schedule;

    // Handle overnight sleep (e.g., sleep at 1AM, wake at 8AM)
    const isSleeping = sleepTime < wakeTime
        ? (currentHour >= sleepTime && currentHour < wakeTime)  // Sleep spans midnight
        : (currentHour >= sleepTime || currentHour < wakeTime); // Normal schedule

    if (isSleeping) {
        console.log('[Availability] Persona is sleeping');
        return {
            available: false,
            mode: 'unavailable',
            reason: 'sleeping',
            delayMinutes: calculateMinutesToWake(currentHour, wakeTime)
        };
    }

    // Check busy blocks
    for (const block of busyBlocks) {
        if (currentHour >= block.start && currentHour < block.end) {
            // In busy block - might respond with delay
            const shouldRespond = Math.random() > 0.5; // 50% respond during busy time

            if (!shouldRespond) {
                console.log('[Availability] Persona is busy:', block.label);
                return {
                    available: false,
                    mode: 'delayed',
                    reason: block.label as any,
                    delayMinutes: Math.floor((block.end - currentHour) * 60 * Math.random())
                };
            }

            // Responds but distracted
            return {
                available: true,
                mode: 'distracted',
                reason: block.label as any,
                delayMinutes: 5 + Math.floor(Math.random() * 15)
            };
        }
    }

    // Late night (slower responses)
    if ((currentHour >= 23 || currentHour < 2) && schedule.sleepTime > 0) {
        return {
            available: true,
            mode: 'delayed',
            reason: 'tired',
            delayMinutes: 2 + Math.floor(Math.random() * 8)
        };
    }

    // Fully available
    return { available: true, mode: 'instant' };
}

function calculateMinutesToWake(currentHour: number, wakeTime: number): number {
    if (currentHour < wakeTime) {
        return (wakeTime - currentHour) * 60;
    }
    // Past midnight
    return (24 - currentHour + wakeTime) * 60;
}

// =====================================================
// VOCABULARY FOSSILIZATION
// =====================================================

/**
 * Extract vocabulary patterns from persona text
 * Finds words they always use, words they avoid, and unique contractions
 */
export function extractVocabularyFossils(personaText: string): VocabularyEvolution {
    const fossilizedTerms: string[] = [];
    const avoidedTerms: string[] = [];
    const uniquePatterns: { pattern: string; frequency: number }[] = [];

    // Find repeated phrases (likely signature phrases)
    const words = personaText.toLowerCase().split(/\s+/);
    const wordCounts = new Map<string, number>();

    for (const word of words) {
        if (word.length > 3) {
            wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
        }
    }

    // High frequency words become fossilized
    for (const [word, count] of wordCounts) {
        if (count >= 3 && !commonWords.has(word)) {
            fossilizedTerms.push(word);
        }
    }

    // Check for contraction patterns
    const contractionPatterns = [
        { regex: /\bgonna\b/gi, pattern: 'gonna' },
        { regex: /\bwanna\b/gi, pattern: 'wanna' },
        { regex: /\bgotta\b/gi, pattern: 'gotta' },
        { regex: /\bkinda\b/gi, pattern: 'kinda' },
        { regex: /\bsorta\b/gi, pattern: 'sorta' },
        { regex: /\by'all\b/gi, pattern: "y'all" },
        { regex: /\bdunno\b/gi, pattern: 'dunno' },
        { regex: /\blemme\b/gi, pattern: 'lemme' },
        { regex: /\bu\b/gi, pattern: 'u' },
        { regex: /\bur\b/gi, pattern: 'ur' },
        { regex: /\brn\b/gi, pattern: 'rn' },
        { regex: /\btbh\b/gi, pattern: 'tbh' },
        { regex: /\bngl\b/gi, pattern: 'ngl' },
        { regex: /\bidk\b/gi, pattern: 'idk' },
        { regex: /\bimo\b/gi, pattern: 'imo' },
    ];

    for (const { regex, pattern } of contractionPatterns) {
        const matches = personaText.match(regex);
        if (matches && matches.length > 0) {
            uniquePatterns.push({ pattern, frequency: Math.min(0.8, matches.length * 0.2) });
        }
    }

    // Check for avoided terms (formal language in casual persona = avoid)
    if (/casual|chill|relaxed/i.test(personaText)) {
        avoidedTerms.push('therefore', 'however', 'nevertheless', 'furthermore', 'indeed');
    }

    // Check for generational markers
    if (/gen-?z|zoomer|young/i.test(personaText)) {
        avoidedTerms.push('lol', 'rofl'); // Gen Z uses 💀 instead
    }

    return {
        fossilizedTerms: fossilizedTerms.slice(0, 10),
        avoidedTerms,
        recentAdoptions: [],
        uniquePatterns
    };
}

// Common words to filter out
const commonWords = new Set([
    'the', 'and', 'but', 'that', 'this', 'with', 'have', 'will', 'from',
    'they', 'been', 'were', 'said', 'each', 'which', 'their', 'would',
    'make', 'like', 'into', 'year', 'them', 'some', 'could', 'than',
    'other', 'then', 'about', 'these', 'only', 'come', 'over', 'such',
    'also', 'back', 'after', 'most', 'where', 'much', 'before', 'should'
]);

/**
 * Generate vocabulary context injection
 */
export function getVocabularyContext(vocab: VocabularyEvolution): string {
    const parts: string[] = [];

    if (vocab.fossilizedTerms.length > 0) {
        parts.push(`[VOCABULARY: Naturally uses: ${vocab.fossilizedTerms.slice(0, 5).join(', ')}]`);
    }

    if (vocab.avoidedTerms.length > 0) {
        parts.push(`[AVOID: Would never say: ${vocab.avoidedTerms.slice(0, 3).join(', ')}]`);
    }

    if (vocab.uniquePatterns.length > 0) {
        const patterns = vocab.uniquePatterns.map(p => p.pattern).slice(0, 3).join(', ');
        parts.push(`[CONTRACTIONS: Uses: ${patterns}]`);
    }

    return parts.join('\n');
}

// =====================================================
// CONTRADICTION ENGINE
// =====================================================

/**
 * Initialize contradiction profile from persona text
 * Finds internal conflicts that make the persona feel real
 */
export function extractContradictions(personaText: string): ContradictionProfile {
    const contradictions: ContradictionProfile['activeContradictions'] = [];

    // Common human contradictions
    const contradictionPatterns = [
        {
            pattern1: /independent|self.?sufficient|don't need/i,
            pattern2: /lonely|need.*attention|wants.*love/i,
            belief1: 'Values independence',
            belief2: 'Craves connection and validation',
            contexts: ['relationships', 'vulnerability']
        },
        {
            pattern1: /hate.*drama|avoid.*conflict|peace/i,
            pattern2: /gossip|drama|tea|spill/i,
            belief1: 'Claims to hate drama',
            belief2: 'Secretly enjoys gossip',
            contexts: ['social', 'friends']
        },
        {
            pattern1: /confident|self.?assured|secure/i,
            pattern2: /insecure|doubt|worried.*think/i,
            belief1: 'Projects confidence',
            belief2: 'Has hidden insecurities',
            contexts: ['appearance', 'abilities']
        },
        {
            pattern1: /over.*ex|moved on|past/i,
            pattern2: /still.*think|miss|remember/i,
            belief1: 'Says they are over their ex',
            belief2: 'Still thinks about them sometimes',
            contexts: ['past relationships', 'songs', 'memories']
        },
        {
            pattern1: /honest|truth|authentic/i,
            pattern2: /protect.*feelings|white.*lie|spare/i,
            belief1: 'Values honesty',
            belief2: 'Will lie to protect feelings',
            contexts: ['difficult conversations', 'opinions']
        }
    ];

    for (const cp of contradictionPatterns) {
        if (cp.pattern1.test(personaText) || cp.pattern2.test(personaText)) {
            // 40% chance to have this contradiction
            if (Math.random() < 0.4) {
                contradictions.push({
                    belief1: cp.belief1,
                    belief2: cp.belief2,
                    dominanceRatio: 0.3 + Math.random() * 0.4, // 0.3-0.7
                    triggerContexts: cp.contexts
                });
            }
        }
    }

    // Always add at least one contradiction if none found
    if (contradictions.length === 0) {
        contradictions.push({
            belief1: 'Projects being carefree',
            belief2: 'Actually worries about things',
            dominanceRatio: 0.6,
            triggerContexts: ['stress', 'future', 'uncertainty']
        });
    }

    return { activeContradictions: contradictions.slice(0, 3) };
}

/**
 * Check if a contradiction should surface in response
 */
export function checkContradictionSurface(
    profile: ContradictionProfile,
    messageContent: string
): string | null {
    for (const contradiction of profile.activeContradictions) {
        // Check if any trigger context matches
        for (const trigger of contradiction.triggerContexts) {
            if (new RegExp(trigger, 'i').test(messageContent)) {
                // Flip a weighted coin
                const showBelief2 = Math.random() > contradiction.dominanceRatio;

                if (showBelief2 && Math.random() < 0.2) { // 20% chance when triggered
                    console.log('[Contradiction] Surfacing:', contradiction.belief2);
                    return `[INTERNAL CONFLICT: Despite "${contradiction.belief1}", part of them "${contradiction.belief2}" - this might subtly show]`;
                }
            }
        }
    }

    return null;
}

// All functions are exported inline above


