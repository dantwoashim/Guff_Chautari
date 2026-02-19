/**
 * @file services/personaGraph/stateTracker.ts
 * @description Tracks conversation state for progressive persona revelation
 * 
 * This enables the "relationship building" aspect of CPR:
 * As trust grows and topics are covered, deeper persona layers unlock.
 */

import { v4 as uuidv4 } from 'uuid';
import { ConversationState, MessageContext } from './nodeTypes';

// =====================================================
// INITIALIZATION
// =====================================================

/**
 * Initialize a new conversation state
 */
export function initializeState(
    chatId: string,
    personaId: string
): ConversationState {
    return {
        chatId,
        personaId,
        messageCount: 0,
        emotionalDepthReached: 0,
        trustLevel: 0.1,  // Start with baseline trust
        topicsCovered: new Set(),
        vulnerabilityShared: false,
        relationshipAcknowledged: false,
        unlockedLayers: new Set(['surface']),
        significantMoments: [],
        lastInteraction: new Date(),
        createdAt: new Date()
    };
}

// =====================================================
// STATE UPDATES
// =====================================================

/**
 * Update state after a message exchange
 */
export function updateState(
    state: ConversationState,
    userMessage: string,
    aiResponse: string,
    context: MessageContext
): ConversationState {
    const newState = { ...state };

    // 1. Increment message count
    newState.messageCount++;

    // 2. Update last interaction
    newState.lastInteraction = new Date();

    // 3. Track topics covered
    for (const topic of context.topics) {
        newState.topicsCovered.add(topic);
    }

    // 4. Update emotional depth
    if (context.emotionalIntensity > newState.emotionalDepthReached) {
        newState.emotionalDepthReached = context.emotionalIntensity;
    }

    // 5. Build trust over time
    // Trust increases with each interaction, faster with vulnerability
    const trustIncrease = calculateTrustIncrease(context, state);
    newState.trustLevel = Math.min(1, state.trustLevel + trustIncrease);

    // 6. Detect vulnerability sharing
    if (context.messageType === 'vulnerable' ||
        context.relationshipSignals.includes('vulnerability')) {
        newState.vulnerabilityShared = true;
    }

    // 7. Detect relationship acknowledgment
    if (context.topics.includes('relationship') ||
        context.relationshipSignals.includes('deepening')) {
        newState.relationshipAcknowledged = true;
    }

    // 8. Unlock layers based on progression
    newState.unlockedLayers = calculateUnlockedLayers(newState, context);

    // 9. Track significant moments
    const significantMoment = detectSignificantMoment(context, userMessage);
    if (significantMoment) {
        newState.significantMoments.push({
            ...significantMoment,
            messageIndex: newState.messageCount
        });
    }

    console.log(`[CPR State] Updated: trust=${newState.trustLevel.toFixed(2)}, depth=${newState.emotionalDepthReached.toFixed(2)}, layers=${Array.from(newState.unlockedLayers).join(',')}`);

    return newState;
}

// =====================================================
// TRUST CALCULATION
// =====================================================

/**
 * Calculate trust increase based on context
 */
function calculateTrustIncrease(
    context: MessageContext,
    state: ConversationState
): number {
    let increase = 0.02; // Base trust increase per message

    // Vulnerability builds trust faster
    if (context.messageType === 'vulnerable') {
        increase += 0.1;
    }

    // Deep conversations build trust
    if (context.messageType === 'deep') {
        increase += 0.05;
    }

    // Emotional intensity correlates with trust building
    increase += context.emotionalIntensity * 0.03;

    // Late night conversations often indicate trust
    if (context.timeOfDay === 'late_night') {
        increase += 0.02;
    }

    // Relationship signals indicate trust
    if (context.relationshipSignals.includes('seeking_connection')) {
        increase += 0.03;
    }

    // Slow down trust building as it approaches max
    // (diminishing returns)
    increase *= (1 - state.trustLevel * 0.5);

    return increase;
}

// =====================================================
// LAYER UNLOCKING
// =====================================================

type PersonaLayer = 'surface' | 'emotional' | 'spiritual' | 'vulnerable' | 'intimate';

/**
 * Calculate which persona layers should be unlocked
 */
function calculateUnlockedLayers(
    state: ConversationState,
    context: MessageContext
): Set<PersonaLayer> {
    const layers = new Set<PersonaLayer>(['surface']);

    // Emotional layer: After some interaction OR emotional topics
    if (state.messageCount >= 5 ||
        state.emotionalDepthReached > 0.3 ||
        state.topicsCovered.has('emotional')) {
        layers.add('emotional');
    }

    // Spiritual layer: After discussing beliefs OR high trust
    if (state.topicsCovered.has('spiritual') ||
        state.trustLevel > 0.4) {
        layers.add('spiritual');
    }

    // Vulnerable layer: Trust + emotional depth required
    if (state.trustLevel > 0.5 && state.emotionalDepthReached > 0.5) {
        layers.add('vulnerable');
    }

    // Intimate layer: High trust + vulnerability shared
    if (state.trustLevel > 0.7 && state.vulnerabilityShared) {
        layers.add('intimate');
    }

    return layers;
}

// =====================================================
// SIGNIFICANT MOMENTS
// =====================================================

interface SignificantMomentDetection {
    type: 'vulnerability' | 'conflict' | 'connection' | 'revelation';
    summary: string;
}

/**
 * Detect if this message represents a significant moment
 */
function detectSignificantMoment(
    context: MessageContext,
    userMessage: string
): SignificantMomentDetection | null {

    // Vulnerability moment
    if (context.messageType === 'vulnerable') {
        return {
            type: 'vulnerability',
            summary: 'User shared something vulnerable'
        };
    }

    // Conflict moment
    if (context.messageType === 'confrontational') {
        return {
            type: 'conflict',
            summary: 'Tension or confrontation detected'
        };
    }

    // Connection moment
    if (context.relationshipSignals.includes('deepening') ||
        context.relationshipSignals.includes('seeking_connection')) {
        return {
            type: 'connection',
            summary: 'Relationship deepening moment'
        };
    }

    // Very high emotional intensity
    if (context.emotionalIntensity > 0.8) {
        return {
            type: 'revelation',
            summary: 'Highly emotional exchange'
        };
    }

    return null;
}

// =====================================================
// SERIALIZATION
// =====================================================

/**
 * Serialize state for storage
 */
export function serializeState(state: ConversationState): string {
    return JSON.stringify({
        ...state,
        topicsCovered: Array.from(state.topicsCovered),
        unlockedLayers: Array.from(state.unlockedLayers),
        lastInteraction: state.lastInteraction.toISOString(),
        createdAt: state.createdAt.toISOString()
    });
}

/**
 * Deserialize state from storage
 */
export function deserializeState(json: string): ConversationState {
    const data = JSON.parse(json);
    return {
        ...data,
        topicsCovered: new Set(data.topicsCovered),
        unlockedLayers: new Set(data.unlockedLayers),
        lastInteraction: new Date(data.lastInteraction),
        createdAt: new Date(data.createdAt)
    };
}

// =====================================================
// STATE QUERIES
// =====================================================

/**
 * Check if a specific layer is unlocked
 */
export function isLayerUnlocked(
    state: ConversationState,
    layer: PersonaLayer
): boolean {
    return state.unlockedLayers.has(layer);
}

/**
 * Get the relationship stage based on state
 */
export function getRelationshipStage(
    state: ConversationState
): 'stranger' | 'acquaintance' | 'friend' | 'close_friend' | 'intimate' {
    if (state.trustLevel < 0.2) return 'stranger';
    if (state.trustLevel < 0.4) return 'acquaintance';
    if (state.trustLevel < 0.6) return 'friend';
    if (state.trustLevel < 0.8) return 'close_friend';
    return 'intimate';
}

/**
 * Get recommended token budget based on state
 */
export function getRecommendedTokenBudget(
    state: ConversationState,
    context: MessageContext
): number {
    let budget = 1500; // Base budget

    // First few messages get more context
    if (state.messageCount < 5) {
        budget += 500;
    }

    // Deep conversations need more context
    if (context.requiresDeepContext) {
        budget += 500;
    }

    // High emotional intensity needs emotional context
    if (context.emotionalIntensity > 0.6) {
        budget += 300;
    }

    return Math.min(budget, 3000); // Cap at 3000
}

export default {
    initializeState,
    updateState,
    serializeState,
    deserializeState,
    isLayerUnlocked,
    getRelationshipStage,
    getRecommendedTokenBudget
};
