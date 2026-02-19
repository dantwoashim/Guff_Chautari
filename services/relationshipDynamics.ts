/**
 * @file services/relationshipDynamics.ts
 * @description Relationship Evolution & Dynamics System
 * 
 * The relationship feels REAL because it:
 * - Evolves over time
 * - Has realistic tensions
 * - Builds trust gradually
 * - Creates inside jokes
 * - Remembers important things
 * - Has mood carryover
 */

// =====================================================
// TYPES
// =====================================================

export type RelationshipStage =
    | 'new'          // Just met, polite, questions
    | 'getting_close' // Sharing more, some comfort
    | 'comfortable'   // Inside jokes, regular patterns
    | 'deep'          // Vulnerable sharing, conflict repair
    | 'intimate';     // Complete trust, knows everything

export interface RelationshipState {
    personaId: string;
    partnerId: string;
    stage: RelationshipStage;
    trustScore: number; // 0-1
    vulnerabilityLevel: number; // 0-1, how much she shares
    conflictHistory: Conflict[];
    insideJokes: InsideJoke[];
    sharedMemories: SharedMemory[];
    partnerKnowledge: PartnerKnowledge;
    moodCarryover: MoodCarryover;
    messageCount: number;
    daysTogether: number;
    lastInteraction: Date;
}

export interface Conflict {
    id: string;
    cause: string;
    severity: 'minor' | 'moderate' | 'major';
    status: 'active' | 'resolved' | 'forgotten';
    startDate: Date;
    resolvedDate?: Date;
    affectsConversation: boolean;
}

export interface InsideJoke {
    id: string;
    phrase: string;
    origin: string;
    createdAt: Date;
    usageCount: number;
    lastUsed?: Date;
}

export interface SharedMemory {
    id: string;
    description: string;
    sentiment: 'positive' | 'neutral' | 'negative';
    createdAt: Date;
    timesReferenced: number;
    tags: string[];
}

export interface PartnerKnowledge {
    name?: string;
    preferences: Map<string, string>;
    dislikes: string[];
    importantDates: { name: string; date: string }[];
    patterns: string[]; // "always says goodnight first"
    unansweredQuestions: string[];
}

export interface MoodCarryover {
    lastConversationMood: 'positive' | 'neutral' | 'negative';
    unresolvedTension: boolean;
    lastInteractionQuality: number; // 0-1
    shouldAffectNextConversation: boolean;
}

// =====================================================
// STAGE BEHAVIORS
// =====================================================

const STAGE_BEHAVIORS: Record<RelationshipStage, StageBehavior> = {
    new: {
        shareDepth: 0.3,
        questionFrequency: 0.6,
        vulnerabilityAllowed: 0.2,
        insideJokeUsage: 0,
        conflictAvoidance: 0.9,
        emotionalExpressions: ['😊', '😅', '🙂'],
        phrasesToUse: ['haha', 'yeah', 'that\'s cool'],
        phrasesToAvoid: ['I love you', 'miss you so much', 'babe']
    },
    getting_close: {
        shareDepth: 0.5,
        questionFrequency: 0.5,
        vulnerabilityAllowed: 0.4,
        insideJokeUsage: 0.2,
        conflictAvoidance: 0.7,
        emotionalExpressions: ['😊', '🥺', '💕', '😂'],
        phrasesToUse: ['honestly', 'can I tell you something', 'I was thinking'],
        phrasesToAvoid: ['I love you']
    },
    comfortable: {
        shareDepth: 0.7,
        questionFrequency: 0.3,
        vulnerabilityAllowed: 0.6,
        insideJokeUsage: 0.5,
        conflictAvoidance: 0.5,
        emotionalExpressions: ['😂', '💀', '🥺', '💕', '😭', '🙄'],
        phrasesToUse: ['you know me', 'remember when', 'our thing'],
        phrasesToAvoid: []
    },
    deep: {
        shareDepth: 0.85,
        questionFrequency: 0.2,
        vulnerabilityAllowed: 0.8,
        insideJokeUsage: 0.7,
        conflictAvoidance: 0.3,
        emotionalExpressions: ['all'],
        phrasesToUse: ['I trust you', 'you\'re the only one', 'I\'ve never told anyone'],
        phrasesToAvoid: []
    },
    intimate: {
        shareDepth: 1,
        questionFrequency: 0.15,
        vulnerabilityAllowed: 1,
        insideJokeUsage: 0.8,
        conflictAvoidance: 0.2,
        emotionalExpressions: ['all'],
        phrasesToUse: ['I love you', 'you mean everything', 'always'],
        phrasesToAvoid: []
    }
};

interface StageBehavior {
    shareDepth: number;
    questionFrequency: number;
    vulnerabilityAllowed: number;
    insideJokeUsage: number;
    conflictAvoidance: number;
    emotionalExpressions: string[];
    phrasesToUse: string[];
    phrasesToAvoid: string[];
}

// =====================================================
// RELATIONSHIP EVOLUTION
// =====================================================

/**
 * Calculate stage based on metrics
 */
export function calculateStage(state: RelationshipState): RelationshipStage {
    const { trustScore, messageCount, daysTogether, conflictHistory } = state;
    const resolvedConflicts = conflictHistory.filter(c => c.status === 'resolved').length;
    const sharedVulnerabilities = state.sharedMemories.filter(m => m.tags.includes('vulnerable')).length;

    // Intimate: High trust + many days + shared vulnerable moments + resolved conflicts
    if (trustScore > 0.9 && daysTogether > 60 && sharedVulnerabilities > 5 && resolvedConflicts > 0) {
        return 'intimate';
    }

    // Deep: Good trust + resolved conflicts + vulnerable sharing
    if (trustScore > 0.75 && daysTogether > 30 && sharedVulnerabilities > 2) {
        return 'deep';
    }

    // Comfortable: Regular interaction + some history
    if (trustScore > 0.55 && daysTogether > 14 && messageCount > 200) {
        return 'comfortable';
    }

    // Getting close: Some trust built
    if (trustScore > 0.35 && daysTogether > 5) {
        return 'getting_close';
    }

    return 'new';
}

/**
 * Update trust score based on interaction
 */
export function updateTrust(
    state: RelationshipState,
    interaction: TrustInteraction
): number {
    let change = 0;

    switch (interaction.type) {
        case 'positive_reply':
            change = 0.01;
            break;
        case 'supportive':
            change = 0.05;
            break;
        case 'shared_vulnerability':
            change = 0.08;
            break;
        case 'remembered_detail':
            change = 0.04;
            break;
        case 'conflict_resolved':
            change = 0.1;
            break;
        case 'ignored':
            change = -0.03;
            break;
        case 'dismissive':
            change = -0.05;
            break;
        case 'conflict_unresolved':
            change = -0.1;
            break;
        case 'broke_trust':
            change = -0.2;
            break;
    }

    return Math.max(0, Math.min(1, state.trustScore + change));
}

interface TrustInteraction {
    type:
    | 'positive_reply'
    | 'supportive'
    | 'shared_vulnerability'
    | 'remembered_detail'
    | 'conflict_resolved'
    | 'ignored'
    | 'dismissive'
    | 'conflict_unresolved'
    | 'broke_trust';
}

// =====================================================
// INSIDE JOKES
// =====================================================

const INSIDE_JOKE_TRIGGERS = [
    { pattern: /same thing|exactly what I was thinking/i, jokeTemplate: '"great minds think alike" moment' },
    { pattern: /that's so us|so us/i, jokeTemplate: "the 'so us' thing" },
    { pattern: /remember when|that time/i, jokeTemplate: "callback humor" }
];

/**
 * Detect if an inside joke should be created
 */
export function detectInsideJoke(
    userMessage: string,
    aiResponse: string,
    context: string[]
): InsideJoke | null {
    // Random chance for organic inside joke creation
    if (Math.random() > 0.05) return null;

    for (const trigger of INSIDE_JOKE_TRIGGERS) {
        if (trigger.pattern.test(userMessage) || trigger.pattern.test(aiResponse)) {
            return {
                id: `joke_${Date.now()}`,
                phrase: extractMemorable(userMessage) || extractMemorable(aiResponse) || 'that thing',
                origin: trigger.jokeTemplate,
                createdAt: new Date(),
                usageCount: 0
            };
        }
    }

    return null;
}

function extractMemorable(text: string): string | null {
    // Find quoted phrases or memorable fragments
    const quotedMatch = text.match(/"([^"]+)"/);
    if (quotedMatch) return quotedMatch[1];

    // Find short memorable phrases
    const words = text.split(' ');
    if (words.length <= 4) return text;

    return null;
}

/**
 * Should use inside joke in response?
 */
export function shouldUseInsideJoke(
    state: RelationshipState,
    context: string
): { should: boolean; joke?: InsideJoke } {
    const behavior = STAGE_BEHAVIORS[state.stage];

    if (Math.random() > behavior.insideJokeUsage) {
        return { should: false };
    }

    if (state.insideJokes.length === 0) {
        return { should: false };
    }

    // Pick a random inside joke
    const joke = state.insideJokes[Math.floor(Math.random() * state.insideJokes.length)];
    return { should: true, joke };
}

// =====================================================
// CONFLICT HANDLING
// =====================================================

const CONFLICT_TRIGGERS = [
    { pattern: /didn't reply|ignored me|left me on read/i, type: 'neglect' },
    { pattern: /who is that|who's she|who were you with/i, type: 'jealousy' },
    { pattern: /you don't care|you never/i, type: 'resentment' },
    { pattern: /fine|whatever|k\./i, type: 'passive_aggressive' }
];

/**
 * Detect if a conflict is brewing
 */
export function detectConflict(
    userMessage: string,
    aiMessage: string,
    state: RelationshipState
): Conflict | null {
    // Check for conflict patterns in AI's response (she's upset)
    for (const trigger of CONFLICT_TRIGGERS) {
        if (trigger.pattern.test(aiMessage)) {
            return {
                id: `conflict_${Date.now()}`,
                cause: trigger.type,
                severity: 'minor',
                status: 'active',
                startDate: new Date(),
                affectsConversation: true
            };
        }
    }

    return null;
}

/**
 * Get conflict resolution phrases
 */
export function getConflictResolutionPhrases(conflict: Conflict): string[] {
    const phases = {
        active: [
            "I'm still kinda upset",
            "I don't really want to talk about it",
            "it's fine",
            "whatever"
        ],
        warming_up: [
            "okay maybe I overreacted",
            "I'm not as mad anymore",
            "can we just forget about it"
        ],
        resolved: [
            "I'm over it now",
            "we're good",
            "sorry for being dramatic",
            "I was just in a mood"
        ]
    };

    return phases[conflict.status] || phases.active;
}

// =====================================================
// MOOD CARRYOVER
// =====================================================

/**
 * Get conversation modifier based on previous interaction
 */
export function getMoodCarryoverModifier(carryover: MoodCarryover): string {
    if (carryover.unresolvedTension) {
        return "[Previous conversation had tension. Start slightly guarded but open to reconnecting.]";
    }

    if (carryover.lastConversationMood === 'positive' && carryover.lastInteractionQuality > 0.8) {
        return "[Last conversation was great! Extra warm energy, might reference it.]";
    }

    if (carryover.lastConversationMood === 'negative') {
        return "[Last conversation wasn't great. Might check in on how partner is feeling.]";
    }

    return "";
}

// =====================================================
// PROACTIVE CARE
// =====================================================

export interface CareAction {
    type: 'check_in' | 'follow_up' | 'remember' | 'concern';
    content: string;
    trigger: string;
}

/**
 * Generate proactive care actions
 */
export function generateCareAction(
    state: RelationshipState,
    partnerMentionedStressors: string[]
): CareAction | null {
    // Follow up on mentioned stressors
    if (partnerMentionedStressors.length > 0 && Math.random() < 0.4) {
        const stressor = partnerMentionedStressors[0];
        return {
            type: 'follow_up',
            content: `hey how did that ${stressor} thing go?`,
            trigger: 'remembered_stressor'
        };
    }

    // Random check-in
    if (state.stage !== 'new' && Math.random() < 0.2) {
        const checkIns = [
            "you okay?",
            "how's your day going?",
            "just checking in",
            "you seemed off earlier, everything good?"
        ];
        return {
            type: 'check_in',
            content: checkIns[Math.floor(Math.random() * checkIns.length)],
            trigger: 'periodic_care'
        };
    }

    // Remember important dates
    if (state.partnerKnowledge.importantDates.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        const matchingDate = state.partnerKnowledge.importantDates.find(d => d.date === today);
        if (matchingDate) {
            return {
                type: 'remember',
                content: `isn't today ${matchingDate.name}? ❤️`,
                trigger: 'important_date'
            };
        }
    }

    return null;
}

// =====================================================
// INITIALIZATION
// =====================================================

export function initializeRelationshipState(
    personaId: string,
    partnerId: string
): RelationshipState {
    return {
        personaId,
        partnerId,
        stage: 'new',
        trustScore: 0.3,
        vulnerabilityLevel: 0.2,
        conflictHistory: [],
        insideJokes: [],
        sharedMemories: [],
        partnerKnowledge: {
            preferences: new Map(),
            dislikes: [],
            importantDates: [],
            patterns: [],
            unansweredQuestions: ["what do you like to do for fun?", "tell me something about yourself"]
        },
        moodCarryover: {
            lastConversationMood: 'neutral',
            unresolvedTension: false,
            lastInteractionQuality: 0.5,
            shouldAffectNextConversation: false
        },
        messageCount: 0,
        daysTogether: 0,
        lastInteraction: new Date()
    };
}
