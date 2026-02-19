
/**
 * @file services/spontaneousMessaging.ts
 * @description Proactive Message Initiation System
 * 
 * The persona texts FIRST. She has things to share without being asked:
 * - Greetings for new chats
 * - Gossip that can't wait
 * - Excitement about something
 * - Random thoughts
 * - Missing you
 * - Updates on ongoing situations
 * - Short-term follow-ups (double texting)
 */

import {
    generateDay,
    calculateMoodArc,
    DayTimeline,
    LifeEvent
} from './lifeEngine';
import {
    Person,
    SocialInteraction,
    Drama,
    generateInteraction,
    generateDrama,
    createDefaultSocialCircle
} from './socialCircle';
import {
    Gossip,
    ShareableStory,
    generateGossip,
    checkSpontaneousShare,
    generateShareableStory
} from './gossipGenerator';
import {
    calculatePhysicalState,
    PhysicalState
} from './physicalStateEngine';

// =====================================================
// TYPES
// =====================================================

export interface SpontaneousMessage {
    id: string;
    type: 'greeting' | 'gossip' | 'excited' | 'vent' | 'miss_you' | 'check_in' | 'random' | 'update' | 'double_text';
    content: string[];
    urgency: 'low' | 'medium' | 'high';
    trigger: string;
    expectedResponse: 'reaction' | 'acknowledgment' | 'engagement' | 'comfort';
    hasFollowUp: boolean;
    timestamp: Date;
}

export interface PersonaState {
    personaId: string;
    currentDay: DayTimeline;
    socialCircle: Person[];
    pendingGossip: Gossip[];
    pendingEvents: LifeEvent[];
    activeDramas: Drama[];
    lastChatTimestamp: Date;
    moodArc: {
        morningMood: number;
        currentMood: number;
        trajectory: 'improving' | 'stable' | 'declining';
    };
    physicalState: PhysicalState;
    sharedToday: string[];
}

// =====================================================
// MESSAGE STARTERS
// =====================================================

const MESSAGE_STARTERS = {
    greeting: [
        "hey!",
        "hi hi",
        "hey there",
        "hii",
        "hey, you around?"
    ],
    gossip: [
        "okay I HAVE to tell you something",
        "you won't believe what just happened",
        "OMG",
        "I've been dying to tell you this",
        "okay so update"
    ],
    excited: [
        "guess what!!",
        "OMG THE BEST THING",
        "I'm so happy rn",
        "you'll never guess what happened",
        "OKAY SO"
    ],
    vent: [
        "ugh I need to vent",
        "can I tell you something that's been bothering me",
        "I'm so frustrated rn",
        "okay I'm kinda mad",
        "so this happened and I'm annoyed"
    ],
    miss_you: [
        "hey",
        "thinking about you",
        "miss you",
        "something reminded me of you",
        "was just wondering what you're up to"
    ],
    check_in: [
        "hey how are you",
        "you okay?",
        "just checking in",
        "haven't heard from you in a bit",
        "how's your day going"
    ],
    random: [
        "random but",
        "okay this is random",
        "so like",
        "idk why but",
        "I just thought of something"
    ],
    update: [
        "okay so update on that thing",
        "remember what I told you? well...",
        "so there's more to that story",
        "you know that situation? update:"
    ],
    short_followup: [
        "btw",
        "oh also",
        "wait i forgot to say",
        "and another thing",
        "actually wait",
        "random thought but"
    ]
};

const MISS_YOU_VARIATIONS = [
    ["hey", "miss you"],
    ["hii", "was thinking about you"],
    ["hey you", "where have you been 🥺"],
    ["hiiii", "I miss talking to you"],
    ["hey stranger"]
];

// =====================================================
// HELPER: FOLLOW-UP CHECK
// =====================================================

/**
 * Check if it's appropriate to send a short-term follow-up (double text).
 * We don't want to double text if the conversation clearly ended.
 */
export function shouldTriggerShortTermFollowUp(lastText: string): boolean {
    if (!lastText) return false;
    const lower = lastText.toLowerCase();

    // Conversation Enders
    const enders = [
        'goodnight', 'gn', 'nighty', 'bye', 'cya', 'ttyl', 'later', 'sleep well', 'sweet dreams',
        'talk later', 'have a good day', 'see ya'
    ];
    if (enders.some(e => lower.includes(e))) return false;

    // Questions (Waiting for reply)
    // If the AI asked a question, it might double text to clarify or nudge, but rarely.
    // For now, let's allow it but maybe the generator will handle the "nudge" context.

    return true;
}

// =====================================================
// GENERATION FUNCTIONS
// =====================================================

/**
 * Generate the very first message for a new chat
 */
export function generateFirstMessage(
    personaName: string,
    timeContext: { period: string; hour: number }
): SpontaneousMessage {
    const isLate = timeContext.hour < 5 || timeContext.hour > 22;
    const isMorning = timeContext.hour >= 5 && timeContext.hour < 11;

    let content: string[] = [];

    if (isLate) {
        content = [pickRandom(["hey...", "you're up late"]), "couldn't sleep?"];
    } else if (isMorning) {
        content = [pickRandom(["good morning!", "gm", "morning!"]), "how did you sleep?"];
    } else {
        content = [pickRandom(["hey!", "hi there", "hey you"]), `it's ${personaName}, what's up?`];
    }

    return {
        id: `msg_${Date.now()}`,
        type: 'greeting',
        content,
        urgency: 'medium',
        trigger: 'new_chat',
        expectedResponse: 'engagement',
        hasFollowUp: false,
        timestamp: new Date()
    };
}

/**
 * Generate a short-term follow-up (double text)
 * @param state - Persona state
 * @param recentMessages - Optional recent conversation messages for context
 */
export function generateShortTermFollowUp(
    state: PersonaState,
    recentMessages?: { role: string; text: string }[]
): SpontaneousMessage {
    // Extract context from recent messages if available
    const lastModelMessage = recentMessages?.slice().reverse().find(m => m.role === 'model');
    const lastUserMessage = recentMessages?.slice().reverse().find(m => m.role === 'user');
    const conversationContext = extractConversationTopics(recentMessages || []);

    // 1. If we asked a question, nudge for response
    if (lastModelMessage?.text?.includes('?') && !lastUserMessage) {
        return {
            id: `msg_${Date.now()}`,
            type: 'double_text',
            content: [pickRandom(['??', 'hello?', 'you there?', 'did you see my message?'])],
            urgency: 'low',
            trigger: 'waiting_for_reply',
            expectedResponse: 'engagement',
            hasFollowUp: false,
            timestamp: new Date()
        };
    }

    // 2. Context-aware follow-up based on conversation
    if (conversationContext.topics.length > 0) {
        const topic = pickRandom(conversationContext.topics);
        const contextualFollowups = [
            `btw about ${topic}...`,
            `oh also - that ${topic} thing`,
            `wait actually about ${topic}`,
            `I just thought of something about ${topic}`
        ];
        return {
            id: `msg_${Date.now()}`,
            type: 'double_text',
            content: [pickRandom(contextualFollowups)],
            urgency: 'low',
            trigger: 'contextual_followup',
            expectedResponse: 'engagement',
            hasFollowUp: true,
            timestamp: new Date()
        };
    }

    // 3. Check for quick shareable items (images/links logic could go here)
    if (Math.random() < 0.3) {
        return {
            id: `msg_${Date.now()}`,
            type: 'double_text',
            content: ["forgot to send this", "*pretend i sent a funny meme*"], // Placeholder for multimodal
            urgency: 'low',
            trigger: 'forgotten_item',
            expectedResponse: 'reaction',
            hasFollowUp: false,
            timestamp: new Date()
        };
    }

    // 4. Generic addendum to previous thought
    const starter = pickRandom(MESSAGE_STARTERS.short_followup);
    const thought = pickRandom([
        "i was just thinking about that thing",
        "do you think that's true?",
        "idk why i said that lol",
        "my brain is fried today sry",
        "did that make sense?"
    ]);

    return {
        id: `msg_${Date.now()}`,
        type: 'double_text',
        content: [`${starter} ${thought}`],
        urgency: 'low',
        trigger: 'thought_continuation',
        expectedResponse: 'engagement',
        hasFollowUp: false,
        timestamp: new Date()
    };
}

/**
 * Generate a spontaneous message based on persona state
 * @param state - Persona state
 * @param currentHour - Current hour of day
 * @param recentMessages - Optional recent conversation for context
 */
export function generateSpontaneousMessage(
    state: PersonaState,
    currentHour: number,
    recentMessages?: { role: string; text: string }[]
): SpontaneousMessage | null {
    const hoursSinceChat = (Date.now() - state.lastChatTimestamp.getTime()) / (1000 * 60 * 60);

    // Extract context from conversation if available
    const conversationContext = extractConversationTopics(recentMessages || []);

    // Priority 1: Respond to something from conversation context
    if (conversationContext.hasOpenQuestion && Math.random() < 0.6) {
        return createContextualResponse(conversationContext);
    }

    // Priority 2: Urgent gossip/drama
    const urgentGossip = state.pendingGossip.find(g => g.urgency === 'need_to_tell');
    if (urgentGossip && shouldSendNow(currentHour, 'gossip')) {
        return createGossipMessage(urgentGossip);
    }

    // Priority 3: Big event happened
    const bigEvent = state.pendingEvents.find(e => Math.abs(e.emotionalImpact) > 0.5);
    if (bigEvent && shouldSendNow(currentHour, 'event')) {
        return createEventMessage(bigEvent);
    }

    // Priority 4: Haven't talked in a while (Re-engagement with context)
    if (hoursSinceChat > 12 && Math.random() < 0.4) {
        // If we have conversation context, reference it
        if (conversationContext.topics.length > 0) {
            const topic = pickRandom(conversationContext.topics);
            return {
                id: `msg_${Date.now()}`,
                type: 'miss_you',
                content: ['hey', `was just thinking about ${topic}`],
                urgency: 'medium',
                trigger: 'contextual_reengagement',
                expectedResponse: 'engagement',
                hasFollowUp: false,
                timestamp: new Date()
            };
        }
        return createMissYouMessage(hoursSinceChat);
    }

    // Priority 5: Mood-driven sharing
    if (state.moodArc.currentMood > 0.6 && Math.random() < 0.4) {
        return createExcitedMessage(state);
    }
    if (state.moodArc.currentMood < -0.4 && Math.random() < 0.5) {
        return createVentMessage(state);
    }

    // Priority 6: Random thought/discovery
    if (Math.random() < 0.15) {
        return createRandomMessage();
    }

    // Priority 7: Active drama update
    if (state.activeDramas.length > 0 && Math.random() < 0.3) {
        return createDramaUpdateMessage(state.activeDramas[0]);
    }

    return null;
}

/**
 * Extract key topics and context from recent messages
 */
function extractConversationTopics(messages: { role: string; text: string }[]): {
    topics: string[];
    hasOpenQuestion: boolean;
    lastTopic?: string;
} {
    if (!messages || messages.length === 0) {
        return { topics: [], hasOpenQuestion: false };
    }

    const topics: string[] = [];
    const combined = messages.map(m => m.text).join(' ');

    // Extract noun phrases (simple heuristic)
    const topicPatterns = [
        /(?:about|regarding|the|that|this)\s+(\w+(?:\s+\w+)?)/gi,
        /(?:told you|talking about)\s+(\w+)/gi
    ];

    for (const pattern of topicPatterns) {
        let match;
        while ((match = pattern.exec(combined)) !== null) {
            const topic = match[1].toLowerCase();
            if (topic.length > 2 && !['the', 'and', 'but', 'you', 'that', 'this'].includes(topic)) {
                topics.push(topic);
            }
        }
    }

    // Check if last AI message ended with a question
    const lastModelMsg = messages.slice().reverse().find(m => m.role === 'model');
    const hasOpenQuestion = lastModelMsg?.text?.trim().endsWith('?') ?? false;

    return {
        topics: [...new Set(topics)].slice(0, 3),
        hasOpenQuestion,
        lastTopic: topics[0]
    };
}

/**
 * Create a contextual response based on conversation analysis
 */
function createContextualResponse(context: { topics: string[]; lastTopic?: string }): SpontaneousMessage {
    const topic = context.lastTopic || pickRandom(context.topics);

    return {
        id: `msg_${Date.now()}`,
        type: 'check_in',
        content: [
            pickRandom(['so', 'anyway', 'btw']),
            `what were you saying about ${topic}?`
        ],
        urgency: 'low',
        trigger: 'contextual_followup',
        expectedResponse: 'engagement',
        hasFollowUp: true,
        timestamp: new Date()
    };
}

// =====================================================
// MESSAGE CREATORS
// =====================================================

function createGossipMessage(gossip: Gossip): SpontaneousMessage {
    const starter = pickRandom(MESSAGE_STARTERS.gossip);

    return {
        id: `msg_${Date.now()}`,
        type: 'gossip',
        content: [starter, gossip.content],
        urgency: gossip.urgency === 'cant_wait' ? 'high' : 'medium',
        trigger: 'gossip_pending',
        expectedResponse: 'reaction',
        hasFollowUp: true,
        timestamp: new Date()
    };
}

function createEventMessage(event: LifeEvent): SpontaneousMessage {
    const isPositive = event.emotionalImpact > 0;
    const starters = isPositive ? MESSAGE_STARTERS.excited : MESSAGE_STARTERS.vent;

    return {
        id: `msg_${Date.now()}`,
        type: 'excited',
        content: [pickRandom(starters), event.description],
        urgency: 'medium',
        trigger: 'significant_event',
        expectedResponse: isPositive ? 'reaction' : 'comfort',
        hasFollowUp: event.canGenerateFollowUp,
        timestamp: new Date()
    };
}

function createMissYouMessage(hoursSinceChat: number): SpontaneousMessage {
    const variation = pickRandom(MISS_YOU_VARIATIONS);

    // Longer time = more intense
    let urgency: 'low' | 'medium' | 'high' = 'low';
    if (hoursSinceChat > 24) urgency = 'medium';
    if (hoursSinceChat > 48) urgency = 'high';

    return {
        id: `msg_${Date.now()}`,
        type: 'miss_you',
        content: variation,
        urgency,
        trigger: 'time_passed',
        expectedResponse: 'engagement',
        hasFollowUp: false,
        timestamp: new Date()
    };
}

function createExcitedMessage(state: PersonaState): SpontaneousMessage {
    const positiveEvents = state.pendingEvents.filter(e => e.emotionalImpact > 0.3);
    const event = pickRandom(positiveEvents);

    return {
        id: `msg_${Date.now()}`,
        type: 'excited',
        content: [pickRandom(MESSAGE_STARTERS.excited), event?.description || "something good happened!"],
        urgency: 'medium',
        trigger: 'positive_mood',
        expectedResponse: 'reaction',
        hasFollowUp: true,
        timestamp: new Date()
    };
}

function createVentMessage(state: PersonaState): SpontaneousMessage {
    const negativeEvents = state.pendingEvents.filter(e => e.emotionalImpact < -0.3);
    const event = pickRandom(negativeEvents);

    return {
        id: `msg_${Date.now()}`,
        type: 'vent',
        content: [pickRandom(MESSAGE_STARTERS.vent), event?.description || "ugh this day"],
        urgency: 'medium',
        trigger: 'negative_mood',
        expectedResponse: 'comfort',
        hasFollowUp: true,
        timestamp: new Date()
    };
}

function createRandomMessage(): SpontaneousMessage {
    const randomThoughts = [
        ["random but", "I was just thinking about you"],
        ["okay this is random", "but do you believe in {thing}?"],
        ["I just remembered", "that thing you said the other day"],
        ["idk why but", "I can't stop thinking about this one thing"]
    ];

    const thought = pickRandom(randomThoughts);

    return {
        id: `msg_${Date.now()}`,
        type: 'random',
        content: thought.map(t => t.replace('{thing}', pickRandom(['fate', 'signs', 'coincidences']))),
        urgency: 'low',
        trigger: 'random_thought',
        expectedResponse: 'engagement',
        hasFollowUp: false,
        timestamp: new Date()
    };
}

function createDramaUpdateMessage(drama: Drama): SpontaneousMessage {
    const latestUpdate = drama.updates[drama.updates.length - 1];

    return {
        id: `msg_${Date.now()}`,
        type: 'update',
        content: [
            pickRandom(MESSAGE_STARTERS.update),
            `the ${drama.title.toLowerCase()} - ${latestUpdate.description}`
        ],
        urgency: drama.severity === 'major' ? 'high' : 'medium',
        trigger: 'drama_update',
        expectedResponse: 'engagement',
        hasFollowUp: true,
        timestamp: new Date()
    };
}

// =====================================================
// TIMING & CONTROL
// =====================================================

/**
 * Should we send a message right now?
 */
function shouldSendNow(hour: number, type: string): boolean {
    // Don't message during sleeping hours (unless urgent)
    if (hour >= 0 && hour < 7) {
        return type === 'urgent';
    }

    // More active in evening
    if (hour >= 18 && hour <= 22) {
        return Math.random() < 0.7;
    }

    // Normal hours
    if (hour >= 9 && hour <= 21) {
        return Math.random() < 0.5;
    }

    return Math.random() < 0.3;
}

/**
 * Calculate delay before sending (natural timing)
 */
export function getMessageDelay(message: SpontaneousMessage): number {
    // Urgent = send soon
    if (message.urgency === 'high') {
        return 1000 + Math.random() * 5000; // 1-6 seconds
    }

    // Medium = might wait a bit
    if (message.urgency === 'medium') {
        return 5000 + Math.random() * 30000; // 5-35 seconds
    }

    // Low = whenever
    return 30000 + Math.random() * 120000; // 30 sec - 2.5 min
}

// =====================================================
// HELPER
// =====================================================

function pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

// =====================================================
// STATE INITIALIZATION
// =====================================================

/**
 * Initialize persona state based on real or simulated data.
 */
export function initializePersonaState(
    personaId: string,
    lastInteractionTime?: number
): PersonaState {
    const socialCircle = createDefaultSocialCircle(personaId);
    const profile = {
        friends: socialCircle.filter(p => p.relationship.includes('friend')).map(p => p.name),
        familyMembers: ['mama', 'baba', 'Aarav'],
        interests: ['music', 'shows', 'food', 'fashion'],
        subjects: ['math', 'english', 'science'],
        places: ['the mall', 'this cafe', 'college']
    };

    const currentDay = generateDay(personaId, new Date(), profile);
    const pendingGossip = [generateGossip(socialCircle, 'drama')];

    // Maybe create an ongoing drama
    const activeDramas = Math.random() < 0.6 ? [generateDrama(socialCircle)] : [];

    // Initialize physical state based on time
    const physicalState = calculatePhysicalState(new Date().getHours(), currentDay.events);

    // Use actual last interaction time if provided, else current time (avoids instant spam on reload)
    const lastChatTimestamp = lastInteractionTime ? new Date(lastInteractionTime) : new Date();

    return {
        personaId,
        currentDay,
        socialCircle,
        pendingGossip,
        pendingEvents: currentDay.unsharedEvents,
        activeDramas,
        lastChatTimestamp,
        moodArc: calculateMoodArc(currentDay, new Date().getHours()),
        physicalState,
        sharedToday: []
    };
}
