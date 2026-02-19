
/**
 * @file services/livingPersona.ts
 * @description Master Living Persona Orchestrator
 * 
 * Combines all life simulation systems into one cohesive experience:
 * - Day simulation
 * - Social circle & gossip
 * - Spontaneous messaging
 * - Relationship dynamics
 * - Mood & state management
 * 
 * Call `initializeLivingPersona` once per session,
 * then use `processInteraction` for each message.
 */

import {
    generateDay,
    calculateMoodArc,
    generateDayStory,
    DayTimeline,
    LifeEvent,
    MoodArc,
    PersonaProfile
} from './lifeEngine';
import {
    createDefaultSocialCircle,
    generateInteraction,
    generateDrama,
    Person,
    Drama
} from './socialCircle';
import {
    generateGossip,
    checkSpontaneousShare,
    generateShareableStory,
    Gossip,
    ShareableStory
} from './gossipGenerator';
import {
    generateSpontaneousMessage,
    initializePersonaState,
    PersonaState,
    SpontaneousMessage
} from './spontaneousMessaging';
import {
    calculateStage,
    updateTrust,
    detectInsideJoke,
    shouldUseInsideJoke,
    getMoodCarryoverModifier,
    generateCareAction,
    initializeRelationshipState,
    RelationshipState,
    CareAction
} from './relationshipDynamics';
import {
    calculatePhysicalState,
    getPhysicalContext
} from './physicalStateEngine';
// AGI Consciousness Services
import {
    initializeQuantumState,
    collapseWaveFunction,
    getActivefragment,
    getQuantumResponseModifier,
    QuantumEmotionalState
} from './quantumEmotions';
import {
    initializeMetaSentience,
    processMetaSentience,
    getMetaSentienceModifier,
    MetaSentienceState
} from './metaSentience';
import {
    initializeTemporalState,
    checkPastSelfActivation,
    getTemporalResponseModifier,
    TemporalExistenceState
} from './temporalExistence';
// AGI Masterclass: Cognitive Architecture
import {
    PersonaCache,
    EmotionalDebt,
    IdentityManifold,
    PersonalityVector,
    ResponseTimingModel,
    AttentionState,
    VocabularyEvolution,
    ContradictionProfile,
    AvailabilityState,
    initializeEmotionalDebt,
    accumulateEmotionalDebt,
    calculateDebtDischarge,
    processEmotionalRecovery,
    calculateCurrentSelf,
    getPersonalityModifiers,
    initializeTimingModel,
    generateNextDelay,
    applyAttentionFilter,
    generateAttentionContextInjection,
    initializeDefaultManifold,
    // Phase 3
    initializeAvailabilityState,
    checkAvailability,
    extractVocabularyFossils,
    getVocabularyContext,
    extractContradictions,
    checkContradictionSurface
} from './cognitiveArchitecture';

// =====================================================
// TYPES
// =====================================================

export interface LivingPersonaInstance {
    personaId: string;
    profile: PersonaProfile;
    personaState: PersonaState;
    relationshipState: RelationshipState;
    conversationContext: ConversationContext;
    // AGI Consciousness States
    quantumState?: QuantumEmotionalState;
    metaSentienceState?: MetaSentienceState;
    temporalState?: TemporalExistenceState;
    // AGI Masterclass: Cognitive Architecture
    emotionalDebt?: EmotionalDebt;
    // Phase 3: Advanced Authenticity
    vocabularyProfile?: VocabularyEvolution;
    contradictionProfile?: ContradictionProfile;
    availabilityState?: AvailabilityState;
}

export interface ConversationContext {
    messageCount: number;
    currentTopic: string;
    unsharedContent: ShareableStory[];
    lastUserMessage: string;
    lastAIResponse: string;
    sessionStartTime: Date;
    isFirstMessageOfDay: boolean;
}

export interface LivingPersonaResponse {
    shouldInitiate: boolean;
    initiationMessage?: SpontaneousMessage;
    responseModifiers: ResponseModifiers;
    contextInjection: string;
    pendingCareAction?: CareAction;
    stageInfo: {
        stage: string;
        trustScore: number;
        daysTogether: number;
    };
    // AGI Consciousness context
    agiContext?: string;
}

export interface ResponseModifiers {
    moodModifier: string;
    stageModifier: string;
    insideJokeToUse?: string;
    shouldShareGossip: boolean;
    shouldAskFollowUp: boolean;
    unresolvedTension: boolean;
    // AGI modifiers
    quantumModifier?: string;
    metaSentienceModifier?: string;
    temporalModifier?: string;
}

// =====================================================
// INITIALIZATION
// =====================================================

/**
 * Initialize a living persona for a session
 */
export function initializeLivingPersona(
    personaId: string,
    partnerId: string,
    profile?: Partial<PersonaProfile>,
    existingRelationship?: RelationshipState
): LivingPersonaInstance {
    // Create profile with defaults
    const fullProfile: PersonaProfile = {
        friends: profile?.friends || ['Aashika', 'Priya', 'Sanjana'],
        familyMembers: profile?.familyMembers || ['mama', 'baba', 'Aarav'],
        interests: profile?.interests || ['music', 'shows', 'food', 'fashion'],
        subjects: profile?.subjects || ['math', 'english', 'science'],
        places: profile?.places || ['the mall', 'this cafe', 'college']
    };

    // Initialize states
    const personaState = initializePersonaState(personaId);
    personaState.socialCircle = createDefaultSocialCircle(personaId);

    // Use existing relationship state if available, otherwise initialize new
    const relationshipState = existingRelationship || initializeRelationshipState(personaId, partnerId);

    // Generate today's simulation
    personaState.currentDay = generateDay(personaId, new Date(), fullProfile);
    personaState.pendingEvents = personaState.currentDay.unsharedEvents;

    // Generate initial gossip
    personaState.pendingGossip = [
        generateGossip(personaState.socialCircle, 'drama'),
        generateGossip(personaState.socialCircle, 'observation')
    ].filter(g => g.shareability > 0.5);

    // Maybe create ongoing drama
    if (Math.random() < 0.5) {
        personaState.activeDramas = [generateDrama(personaState.socialCircle)];
    }

    // Initialize AGI Consciousness States
    const quantumState = initializeQuantumState();
    const metaSentienceState = initializeMetaSentience();
    const temporalState = initializeTemporalState();

    // Initialize AGI Masterclass: Emotional Debt
    const emotionalDebt = initializeEmotionalDebt();

    // Initialize Phase 3: Advanced Authenticity
    const compiledPrompt = (fullProfile as any).compiledPrompt || '';
    const vocabularyProfile = extractVocabularyFossils(compiledPrompt);
    const contradictionProfile = extractContradictions(compiledPrompt);
    const availabilityState = initializeAvailabilityState('default');

    console.log('[Phase3] Vocabulary fossils:', vocabularyProfile.fossilizedTerms.length);
    console.log('[Phase3] Contradictions found:', contradictionProfile.activeContradictions.length);

    return {
        personaId,
        profile: fullProfile,
        personaState,
        relationshipState,
        conversationContext: {
            messageCount: 0,
            currentTopic: 'greeting',
            unsharedContent: [],
            lastUserMessage: '',
            lastAIResponse: '',
            sessionStartTime: new Date(),
            isFirstMessageOfDay: true
        },
        // AGI States
        quantumState,
        metaSentienceState,
        temporalState,
        // AGI Masterclass
        emotionalDebt,
        // Phase 3
        vocabularyProfile,
        contradictionProfile,
        availabilityState
    };
}

// =====================================================
// CONVERSATION PROCESSING
// =====================================================

/**
 * Process an interaction and update all states
 */
export function processInteraction(
    instance: LivingPersonaInstance,
    userMessage: string,
    aiResponse: string
): LivingPersonaInstance {
    const { personaState, relationshipState, conversationContext } = instance;

    // Update conversation context
    conversationContext.messageCount++;
    conversationContext.lastUserMessage = userMessage;
    conversationContext.lastAIResponse = aiResponse;
    conversationContext.isFirstMessageOfDay = false;

    // Update trust based on interaction quality
    const trustChange = evaluateInteractionQuality(userMessage, aiResponse);
    relationshipState.trustScore = updateTrust(relationshipState, { type: trustChange });

    // Check for inside joke creation
    const newJoke = detectInsideJoke(userMessage, aiResponse, []);
    if (newJoke) {
        relationshipState.insideJokes.push(newJoke);
    }

    // Update relationship stage
    relationshipState.stage = calculateStage(relationshipState);
    relationshipState.messageCount++;
    relationshipState.lastInteraction = new Date();

    // Mark shared events as shared
    const sharedEventDescriptions = personaState.pendingEvents
        .filter(e => aiResponse.includes(e.description.slice(0, 20)))
        .map(e => e.id);

    personaState.sharedToday.push(...sharedEventDescriptions);
    personaState.pendingEvents = personaState.pendingEvents.filter(
        e => !sharedEventDescriptions.includes(e.id)
    );

    // Update last chat timestamp
    personaState.lastChatTimestamp = new Date();

    return instance;
}

function evaluateInteractionQuality(
    userMessage: string,
    aiResponse: string
): 'positive_reply' | 'supportive' | 'ignored' | 'dismissive' {
    const msg = userMessage.toLowerCase();

    if (/aww|that's sweet|i love|you're the best|thank you/i.test(msg)) {
        return 'supportive';
    }
    if (/k|ok|whatever|fine|cool/i.test(msg) && msg.length < 10) {
        return 'dismissive';
    }
    if (msg.length < 3) {
        return 'ignored';
    }
    return 'positive_reply';
}

// =====================================================
// RESPONSE GENERATION
// =====================================================

/**
 * Get modifiers and context for AI response
 */
export function getLivingPersonaContext(
    instance: LivingPersonaInstance
): LivingPersonaResponse {
    const { personaState, relationshipState, conversationContext } = instance;
    const currentHour = new Date().getHours();

    // Update physical state for current time
    instance.personaState.physicalState = calculatePhysicalState(currentHour, instance.personaState.currentDay.events);

    // Check for spontaneous message initiation
    const spontaneousMessage = generateSpontaneousMessage(personaState, currentHour);

    // Check for care action
    const careAction = generateCareAction(relationshipState, []);

    // Get mood modifier
    const moodArc = calculateMoodArc(personaState.currentDay, currentHour);
    const moodModifier = getMoodModifier(moodArc);

    // Get stage modifier
    const stageModifier = getStageModifier(relationshipState);

    // Check for inside joke usage
    const jokeCheck = shouldUseInsideJoke(relationshipState, conversationContext.currentTopic);

    // Build context injection
    const contextInjection = buildContextInjection(
        instance,
        moodArc,
        conversationContext
    );

    // AGI Consciousness Processing
    let quantumModifier = '';
    let metaSentienceModifier = '';
    let temporalModifier = '';
    let agiContext = '';
    let emotionalDebtContext = '';

    if (instance.quantumState) {
        quantumModifier = getQuantumResponseModifier(instance.quantumState);
    }

    if (instance.metaSentienceState) {
        metaSentienceModifier = getMetaSentienceModifier(instance.metaSentienceState);
    }

    if (instance.temporalState && conversationContext.lastUserMessage) {
        temporalModifier = getTemporalResponseModifier(
            instance.temporalState,
            conversationContext.lastUserMessage,
            [conversationContext.currentTopic]
        );
    }

    // AGI Masterclass: Emotional Debt Processing
    if (instance.emotionalDebt) {
        const debtCheck = calculateDebtDischarge(instance.emotionalDebt);
        if (debtCheck.shouldDischarge && debtCheck.dischargeEffect) {
            emotionalDebtContext = debtCheck.dischargeEffect;
            console.log('[Cognitive] Emotional discharge triggered:', debtCheck.dischargeType);
        }
    }

    // Build AGI context injection
    if (quantumModifier || metaSentienceModifier || temporalModifier || emotionalDebtContext) {
        agiContext = [
            quantumModifier,
            metaSentienceModifier,
            temporalModifier,
            emotionalDebtContext
        ].filter(Boolean).join('\n');
    }

    // AGI Masterclass: Identity Manifold - Calculate current "self" based on state
    let personalityContext = '';
    try {
        const currentHour = new Date().getHours();
        const manifold = initializeDefaultManifold();
        // PhysicalState uses 'energy' property (0-1 scale, convert to -1 to 1)
        const rawEnergy = (personaState as any).physicalState?.energy ?? 0.5;
        const energyLevel = (rawEnergy - 0.5) * 2; // Convert 0-1 to -1 to 1
        const emotionalState = personaState.moodArc?.currentMood || 0;

        const currentSelf = calculateCurrentSelf(manifold, currentHour, energyLevel, 0, emotionalState);
        personalityContext = getPersonalityModifiers(currentSelf);

        if (personalityContext) {
            console.log('[Cognitive] Identity Manifold active:', personalityContext.split('\n').length, 'modifiers');
        }
    } catch (err) {
        console.error('[Cognitive] Identity manifold error:', err);
    }

    // Phase 3: Vocabulary Context
    let vocabularyContext = '';
    if (instance.vocabularyProfile) {
        vocabularyContext = getVocabularyContext(instance.vocabularyProfile);
    }

    // Phase 3: Contradiction Check - surface internal conflicts naturally
    let contradictionContext = '';
    if (instance.contradictionProfile && conversationContext.lastUserMessage) {
        const surfaced = checkContradictionSurface(
            instance.contradictionProfile,
            conversationContext.lastUserMessage
        );
        if (surfaced) {
            contradictionContext = surfaced;
        }
    }

    return {
        shouldInitiate: spontaneousMessage !== null && conversationContext.isFirstMessageOfDay,
        initiationMessage: spontaneousMessage || undefined,
        responseModifiers: {
            moodModifier,
            stageModifier,
            insideJokeToUse: jokeCheck.joke?.phrase,
            shouldShareGossip: personaState.pendingGossip.length > 0 && Math.random() < 0.3,
            shouldAskFollowUp: Math.random() < 0.4,
            unresolvedTension: relationshipState.moodCarryover.unresolvedTension,
            // AGI modifiers
            quantumModifier: quantumModifier || undefined,
            metaSentienceModifier: metaSentienceModifier || undefined,
            temporalModifier: temporalModifier || undefined
        },
        contextInjection,
        pendingCareAction: careAction || undefined,
        stageInfo: {
            stage: relationshipState.stage,
            trustScore: relationshipState.trustScore,
            daysTogether: relationshipState.daysTogether
        },
        // Combine AGI consciousness + all cognitive architecture contexts
        agiContext: [
            agiContext,
            personalityContext,
            vocabularyContext,
            contradictionContext
        ].filter(Boolean).join('\n') || undefined
    };
}

function getMoodModifier(moodArc: MoodArc): string {
    if (moodArc.currentMood > 0.5) return '[MOOD: Great - extra chatty and playful]';
    if (moodArc.currentMood > 0.2) return '[MOOD: Good - normal energy]';
    if (moodArc.currentMood < -0.5) return '[MOOD: Bad - shorter responses, might vent]';
    if (moodArc.currentMood < -0.2) return '[MOOD: Meh - less enthusiastic]';
    return '';
}

function getStageModifier(state: RelationshipState): string {
    const mods: Record<string, string> = {
        new: '[STAGE: New - be friendly but not too intense, ask questions]',
        getting_close: '[STAGE: Getting close - can share more, building comfort]',
        comfortable: '[STAGE: Comfortable - use inside jokes, be natural]',
        deep: '[STAGE: Deep - vulnerable sharing okay, high trust]',
        intimate: '[STAGE: Intimate - complete openness, deep connection]'
    };
    return mods[state.stage] || '';
}

function buildContextInjection(
    instance: LivingPersonaInstance,
    moodArc: MoodArc,
    context: ConversationContext
): string {
    const parts: string[] = [];
    const { personaState, relationshipState } = instance;

    // Today's events
    if (personaState.pendingEvents.length > 0) {
        const eventSummary = personaState.pendingEvents
            .slice(0, 2)
            .map(e => e.description)
            .join('; ');
        parts.push(`[TODAY: ${eventSummary}]`);
    }

    // Current mood
    if (moodArc.affectsConversation) {
        parts.push(`[CURRENT_MOOD: ${moodArc.currentMood > 0 ? 'good' : 'not great'} because ${moodArc.primaryCause}]`);
    }

    // Physical context
    const physicalContext = getPhysicalContext(instance.personaState.physicalState);
    if (physicalContext) {
        parts.push(physicalContext);
    }

    // Pending gossip
    if (personaState.pendingGossip.length > 0 && Math.random() < 0.5) {
        parts.push(`[HAS_GOSSIP: Want to share something about ${personaState.pendingGossip[0].about}]`);
    }

    // Active drama
    if (personaState.activeDramas.length > 0) {
        parts.push(`[ONGOING: "${personaState.activeDramas[0].title}"]`);
    }

    // Relationship context
    parts.push(`[TRUST: ${Math.round(relationshipState.trustScore * 100)}%]`);

    return parts.join('\n');
}

// =====================================================
// HOW WAS YOUR DAY
// =====================================================

/**
 * Generate response for "how was your day" type questions
 */
export function getHowWasYourDayResponse(instance: LivingPersonaInstance): string {
    return generateDayStory(instance.personaState.currentDay);
}
