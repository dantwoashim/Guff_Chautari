/**
 * @file services/personaGraph/topicDetector.ts
 * @description Detects topics, emotions, and context from user messages
 * 
 * This powers the intelligent retrieval - understanding WHAT the user
 * is talking about so we can retrieve the right persona nodes.
 */

import {
    MessageContext,
    PersonaGraph,
    DEFAULT_TOPIC_TRIGGERS
} from './nodeTypes';

// =====================================================
// TOPIC DETECTION
// =====================================================

/**
 * Detect topics from user message using trigger matching
 */
function detectTopicsFromTriggers(
    message: string,
    graph: PersonaGraph
): Map<string, number> {
    const topicScores = new Map<string, number>();
    const lowerMessage = message.toLowerCase();
    const words = lowerMessage.split(/\s+/);

    // Check each trigger in the index
    for (const [trigger, nodeIds] of graph.triggerIndex) {
        if (lowerMessage.includes(trigger)) {
            // Weight by trigger length (longer = more specific = higher score)
            const score = trigger.length / 10;

            for (const nodeId of nodeIds) {
                const node = graph.nodes.get(nodeId);
                if (node) {
                    const topic = node.category;
                    const current = topicScores.get(topic) || 0;
                    topicScores.set(topic, current + score);
                }
            }
        }
    }

    // Also check default topic triggers
    for (const [topic, triggers] of Object.entries(DEFAULT_TOPIC_TRIGGERS)) {
        for (const trigger of triggers) {
            if (lowerMessage.includes(trigger)) {
                const current = topicScores.get(topic) || 0;
                topicScores.set(topic, current + 0.5);
            }
        }
    }

    return topicScores;
}

// =====================================================
// EMOTIONAL ANALYSIS
// =====================================================

const EMOTIONAL_INDICATORS = {
    high: [
        'love', 'hate', 'scared', 'terrified', 'amazing', 'horrible',
        'never told', 'secret', 'trust', 'miss', 'need', 'want',
        'crying', 'tears', 'heartbreak', 'ecstatic'
    ],
    medium: [
        'feel', 'feeling', 'think', 'hope', 'wish', 'worry',
        'happy', 'sad', 'angry', 'confused', 'lonely', 'alone'
    ],
    low: [
        'okay', 'fine', 'good', 'bad', 'meh', 'whatever', 'normal'
    ]
};

/**
 * Analyze emotional intensity of a message
 */
function analyzeEmotionalIntensity(message: string): number {
    const lower = message.toLowerCase();
    let intensity = 0;

    // Check for high intensity words
    for (const word of EMOTIONAL_INDICATORS.high) {
        if (lower.includes(word)) intensity += 0.3;
    }

    // Check for medium intensity words
    for (const word of EMOTIONAL_INDICATORS.medium) {
        if (lower.includes(word)) intensity += 0.15;
    }

    // Punctuation intensity
    const exclamations = (message.match(/!/g) || []).length;
    const questions = (message.match(/\?/g) || []).length;
    const ellipses = (message.match(/\.{2,}/g) || []).length;

    intensity += exclamations * 0.1;
    intensity += questions * 0.05;
    intensity += ellipses * 0.08;

    // Length factor (longer emotional messages = more intense)
    if (message.length > 200) intensity += 0.1;
    if (message.length > 500) intensity += 0.1;

    // Cap at 1
    return Math.min(1, intensity);
}

/**
 * Analyze sentiment of a message
 */
function analyzeSentiment(message: string): 'positive' | 'negative' | 'neutral' | 'mixed' {
    const lower = message.toLowerCase();

    const positiveWords = ['love', 'happy', 'great', 'amazing', 'beautiful', 'wonderful', 'thank', 'glad', 'excited'];
    const negativeWords = ['hate', 'sad', 'angry', 'scared', 'worried', 'hurt', 'lonely', 'alone', 'tired', 'sorry'];

    let positiveScore = 0;
    let negativeScore = 0;

    for (const word of positiveWords) {
        if (lower.includes(word)) positiveScore++;
    }

    for (const word of negativeWords) {
        if (lower.includes(word)) negativeScore++;
    }

    if (positiveScore > 0 && negativeScore > 0) return 'mixed';
    if (positiveScore > negativeScore) return 'positive';
    if (negativeScore > positiveScore) return 'negative';
    return 'neutral';
}

// =====================================================
// MESSAGE TYPE DETECTION
// =====================================================

/**
 * Detect the type of message
 */
function detectMessageType(
    message: string
): 'casual' | 'question' | 'deep' | 'vulnerable' | 'playful' | 'confrontational' {
    const lower = message.toLowerCase();

    // Vulnerable indicators
    const vulnerablePatterns = [
        'never told', 'secret', 'scared to', 'trust you', 'don\'t know if',
        'been thinking', 'need to tell', 'honest with you', 'what if i told'
    ];
    for (const pattern of vulnerablePatterns) {
        if (lower.includes(pattern)) return 'vulnerable';
    }

    // Deep question indicators
    const deepPatterns = [
        'do you believe', 'what do you think about', 'meaning of', 'purpose',
        'what is', 'why do', 'how do you feel about', 'what are we'
    ];
    for (const pattern of deepPatterns) {
        if (lower.includes(pattern)) return 'deep';
    }

    // Confrontational
    const confrontationalPatterns = [
        'why did you', 'you never', 'you always', 'don\'t understand',
        'how could you', 'what\'s wrong with'
    ];
    for (const pattern of confrontationalPatterns) {
        if (lower.includes(pattern)) return 'confrontational';
    }

    // Playful
    const playfulPatterns = [
        'lol', 'haha', 'lmao', '😂', '🤣', 'funny', 'joke', 'just kidding',
        'wanna', 'let\'s', 'dare'
    ];
    for (const pattern of playfulPatterns) {
        if (lower.includes(pattern)) return 'playful';
    }

    // Question
    if (message.includes('?')) return 'question';

    // Casual (default)
    return 'casual';
}

// =====================================================
// RELATIONSHIP SIGNALS
// =====================================================

const RELATIONSHIP_SIGNALS = {
    seeking_connection: ['miss you', 'thinking about you', 'wish you were', 'want to see'],
    vulnerability: ['trust', 'scared', 'tell you something', 'never told anyone'],
    flirting: ['cute', 'beautiful', 'handsome', 'like you', 'think about you'],
    distance: ['busy', 'later', 'can\'t talk', 'need space'],
    deepening: ['what are we', 'us', 'feel about me', 'where is this going'],
    comfort: ['here for you', 'it\'s okay', 'understand', 'don\'t worry']
};

/**
 * Detect relationship signals in message
 */
function detectRelationshipSignals(message: string): string[] {
    const lower = message.toLowerCase();
    const signals: string[] = [];

    for (const [signal, patterns] of Object.entries(RELATIONSHIP_SIGNALS)) {
        for (const pattern of patterns) {
            if (lower.includes(pattern)) {
                if (!signals.includes(signal)) {
                    signals.push(signal);
                }
                break;
            }
        }
    }

    return signals;
}

// =====================================================
// TIME CONTEXT
// =====================================================

/**
 * Get time of day context
 */
function getTimeOfDay(): 'morning' | 'day' | 'evening' | 'late_night' {
    const hour = new Date().getHours();

    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'day';
    if (hour >= 18 && hour < 23) return 'evening';
    return 'late_night';
}

// =====================================================
// MAIN DETECTION FUNCTION
// =====================================================

/**
 * Analyze a user message and detect all relevant context
 * 
 * @param message The user's message
 * @param graph The persona graph (for trigger matching)
 * @param recentHistory Recent message history for context
 * @param isFirstMessage Whether this is the first message in conversation
 * @returns Complete MessageContext
 */
export function detectMessageContext(
    message: string,
    graph: PersonaGraph,
    recentHistory: { role: string; text: string }[] = [],
    isFirstMessage: boolean = false
): MessageContext {

    // Detect topics using graph triggers
    const topicScores = detectTopicsFromTriggers(message, graph);

    // Get topics sorted by score
    const topics = Array.from(topicScores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([topic]) => topic);

    // If no topics detected, add 'casual' as default
    if (topics.length === 0) {
        topics.push('casual_greeting');
        topicScores.set('casual_greeting', 0.1);
    }

    // Emotional analysis
    const emotionalIntensity = analyzeEmotionalIntensity(message);
    const sentiment = analyzeSentiment(message);

    // Message type
    const messageType = detectMessageType(message);

    // Relationship signals
    const relationshipSignals = detectRelationshipSignals(message);

    // Time context
    const timeOfDay = getTimeOfDay();

    // Check if deep context is required
    const requiresDeepContext =
        messageType === 'deep' ||
        messageType === 'vulnerable' ||
        emotionalIntensity > 0.6 ||
        relationshipSignals.length > 0;

    console.log(`[CPR] Context detected: topics=[${topics.join(', ')}], type=${messageType}, emotion=${emotionalIntensity.toFixed(2)}`);

    return {
        topics,
        topicScores,
        emotionalIntensity,
        sentiment,
        messageType,
        relationshipSignals,
        timeOfDay,
        isFirstMessage,
        requiresDeepContext
    };
}

export default {
    detectMessageContext,
    analyzeEmotionalIntensity,
    detectMessageType
};
