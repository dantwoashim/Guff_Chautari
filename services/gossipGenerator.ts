/**
 * @file services/gossipGenerator.ts
 * @description Gossip & Story Generation System
 * 
 * Real people share gossip. So should AI.
 * 
 * Types of shareable content:
 * - Drama about friends
 * - Things she heard/saw
 * - Observations about people
 * - Secrets (some she keeps)
 * - Random discoveries
 */

import { Person, Drama, SocialInteraction } from './socialCircle';
import { LifeEvent } from './lifeEngine';

// =====================================================
// TYPES
// =====================================================

export interface Gossip {
    id: string;
    about: string; // Person name or situation
    type: 'drama' | 'tea' | 'observation' | 'rumor' | 'cute' | 'annoying' | 'secret';
    content: string;
    source: 'witnessed' | 'heard' | 'suspected' | 'told';
    emotionalWeight: number; // How much it affects her
    shareability: number; // 0-1, how likely to share with partner
    urgency: 'casual' | 'need_to_tell' | 'cant_wait';
    expiresAfterDays: number;
    createdAt: Date;
}

export interface ShareableStory {
    type: 'gossip' | 'event' | 'discovery' | 'vent' | 'excitement';
    content: string;
    opener: string;
    urgency: 'low' | 'medium' | 'high';
    expectsReaction: boolean;
    followUpAvailable: boolean;
}

// =====================================================
// GOSSIP TEMPLATES
// =====================================================

const GOSSIP_TEMPLATES = {
    drama: [
        "okay so {friend} and {person} had a HUGE fight",
        "apparently {person} is talking to {other} now",
        "{friend} just told me that {person} did something crazy",
        "you won't BELIEVE what I heard about {person}",
        "the drama with {person} is getting worse",
        "{friend} and {person} aren't talking anymore"
    ],
    tea: [
        "okay don't tell anyone but {tea}",
        "I'm not supposed to say this but {tea}",
        "{friend} told me something in confidence... {tea}",
        "so this is happening with {person}... {tea}",
        "I have tea ☕ ... {tea}"
    ],
    observation: [
        "I've noticed {person} has been acting weird lately",
        "{person} seems off, not sure why",
        "something's definitely going on with {person}",
        "is it just me or is {person} being strange",
        "{person} keeps doing this thing and idk what to think"
    ],
    rumor: [
        "so I heard that {person} might be {rumor}",
        "people are saying {person} {rumor}",
        "there's a rumor going around about {person}",
        "I'm not sure if it's true but apparently {person} {rumor}"
    ],
    cute: [
        "okay this is so cute - {cute_thing}",
        "the sweetest thing happened with {friend}",
        "this made my whole day - {cute_thing}",
        "you'll love this - {cute_thing}"
    ],
    annoying: [
        "okay I need to complain about {person}",
        "{person} did the most annoying thing",
        "I'm SO irritated with {person} rn",
        "why is {person} like this",
        "guess what {person} did now"
    ],
    secret: [
        "I've never told anyone this but {secret}",
        "okay promise not to tell anyone... {secret}",
        "this is between us okay? {secret}",
        "I shouldn't say this but I trust you... {secret}"
    ]
};

const TEA_CONTENT = [
    "she likes someone",
    "they broke up",
    "he got caught doing something",
    "she's been lying about something",
    "they've been sneaking around",
    "there's way more to that story"
];

const RUMOR_CONTENT = [
    "seeing someone new",
    "leaving school",
    "had a big fight with family",
    "secretly dating",
    "keeping a huge secret"
];

const CUTE_CONTENT = [
    "someone did the nicest thing for me",
    "I saw the cutest couple today",
    "a random stranger was so kind",
    "my friend surprised me"
];

const SECRET_CONTENT = [
    "I sometimes feel really insecure about stuff",
    "I've been stressed about something",
    "there's something I've been hiding",
    "I'm scared about the future sometimes"
];

// =====================================================
// GENERATION FUNCTIONS
// =====================================================

/**
 * Generate a piece of gossip
 */
export function generateGossip(
    people: Person[],
    type: Gossip['type'] = 'drama'
): Gossip {
    const templates = GOSSIP_TEMPLATES[type];
    let template = pickRandom(templates);

    const friends = people.filter(p =>
        p.relationship === 'best_friend' ||
        p.relationship === 'close_friend'
    );
    const friend = pickRandom(friends);
    const person = pickRandom(people.filter(p => p.id !== friend?.id));
    const other = pickRandom(people.filter(p => p.id !== friend?.id && p.id !== person?.id));

    // Fill placeholders
    let content = template
        .replace('{friend}', friend?.name || 'my friend')
        .replace('{person}', person?.name || 'someone')
        .replace('{other}', other?.name || 'someone else')
        .replace('{tea}', pickRandom(TEA_CONTENT))
        .replace('{rumor}', pickRandom(RUMOR_CONTENT))
        .replace('{cute_thing}', pickRandom(CUTE_CONTENT))
        .replace('{secret}', pickRandom(SECRET_CONTENT));

    // Determine shareability by type
    const shareabilityByType: Record<string, number> = {
        drama: 0.9,
        tea: 0.85,
        observation: 0.7,
        rumor: 0.6,
        cute: 0.8,
        annoying: 0.85,
        secret: 0.4 // Secrets are less likely to share
    };

    return {
        id: `gossip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        about: person?.name || 'someone',
        type,
        content,
        source: pickRandom(['witnessed', 'heard', 'told']),
        emotionalWeight: type === 'drama' ? 0.7 : type === 'secret' ? 0.9 : 0.5,
        shareability: shareabilityByType[type] || 0.5,
        urgency: type === 'drama' ? 'need_to_tell' : 'casual',
        expiresAfterDays: type === 'drama' ? 7 : 3,
        createdAt: new Date()
    };
}

/**
 * Generate a shareable story from various sources
 */
export function generateShareableStory(
    gossip: Gossip | null,
    event: LifeEvent | null,
    mood: number
): ShareableStory | null {
    // Prioritize urgent gossip
    if (gossip && gossip.urgency === 'need_to_tell') {
        return {
            type: 'gossip',
            content: gossip.content,
            opener: getOpener('gossip', gossip.urgency),
            urgency: 'high',
            expectsReaction: true,
            followUpAvailable: true
        };
    }

    // Then check for significant events
    if (event && Math.abs(event.emotionalImpact) > 0.4) {
        const isPositive = event.emotionalImpact > 0;
        return {
            type: isPositive ? 'excitement' : 'vent',
            content: event.description,
            opener: getOpener(isPositive ? 'excitement' : 'vent', 'medium'),
            urgency: 'medium',
            expectsReaction: true,
            followUpAvailable: event.canGenerateFollowUp
        };
    }

    // Casual gossip
    if (gossip) {
        return {
            type: 'gossip',
            content: gossip.content,
            opener: getOpener('gossip', 'casual'),
            urgency: 'low',
            expectsReaction: false,
            followUpAvailable: true
        };
    }

    return null;
}

// =====================================================
// OPENERS
// =====================================================

const OPENERS = {
    gossip: {
        casual: ["so", "btw", "oh also", "random but"],
        medium: ["okay so", "wait", "omg", "I have to tell you"],
        high: ["OMG", "OKAY SO", "YOU WON'T BELIEVE", "I'VE BEEN DYING TO TELL YOU"]
    },
    excitement: {
        casual: ["guess what", "so this happened", "lol so"],
        medium: ["okay so", "the best thing", "omg"],
        high: ["OMG GUESS WHAT", "THE BEST THING JUST HAPPENED", "I'M SO HAPPY"]
    },
    vent: {
        casual: ["ugh", "so like", "idk if this is dumb but"],
        medium: ["I'm kinda annoyed", "can I vent", "okay so"],
        high: ["I'M SO MAD", "I need to vent rn", "UGH"]
    },
    discovery: {
        casual: ["I found this thing", "so like", "random but"],
        medium: ["okay you need to see this", "I'm obsessed with"],
        high: ["YOU NEED TO SEE THIS", "I FOUND SOMETHING AMAZING"]
    }
};

function getOpener(type: keyof typeof OPENERS, urgency: string): string {
    const openerSet = OPENERS[type]?.[urgency as keyof typeof OPENERS.gossip] || ['so'];
    return pickRandom(openerSet);
}

// =====================================================
// SPONTANEOUS SHARE TRIGGERS
// =====================================================

export interface SpontaneousTrigger {
    type: 'time_passed' | 'event_happened' | 'reminded_of_you' | 'need_to_vent' | 'excited' | 'random';
    probability: number;
    content: ShareableStory;
}

/**
 * Check if persona should initiate sharing
 */
export function checkSpontaneousShare(
    hoursSinceLastChat: number,
    pendingGossip: Gossip[],
    pendingEvents: LifeEvent[],
    currentMood: number
): SpontaneousTrigger | null {
    // High priority gossip
    const urgentGossip = pendingGossip.find(g => g.urgency === 'need_to_tell');
    if (urgentGossip && Math.random() < 0.8) {
        return {
            type: 'event_happened',
            probability: 0.8,
            content: {
                type: 'gossip',
                content: urgentGossip.content,
                opener: getOpener('gossip', 'high'),
                urgency: 'high',
                expectsReaction: true,
                followUpAvailable: true
            }
        };
    }

    // Been a while - miss you trigger
    if (hoursSinceLastChat > 12 && Math.random() < 0.3) {
        return {
            type: 'reminded_of_you',
            probability: 0.3,
            content: {
                type: 'event',
                content: pickRandom([
                    "something reminded me of you",
                    "was just thinking about you",
                    "saw something and thought of you"
                ]),
                opener: "hey",
                urgency: 'low',
                expectsReaction: false,
                followUpAvailable: false
            }
        };
    }

    // Significant event happened
    const bigEvent = pendingEvents.find(e => Math.abs(e.emotionalImpact) > 0.5);
    if (bigEvent && Math.random() < 0.6) {
        const isPositive = bigEvent.emotionalImpact > 0;
        return {
            type: isPositive ? 'excited' : 'need_to_vent',
            probability: 0.6,
            content: {
                type: isPositive ? 'excitement' : 'vent',
                content: bigEvent.description,
                opener: getOpener(isPositive ? 'excitement' : 'vent', 'medium'),
                urgency: 'medium',
                expectsReaction: true,
                followUpAvailable: true
            }
        };
    }

    // Random share (low probability)
    if (Math.random() < 0.1 && pendingGossip.length > 0) {
        const randomGossip = pickRandom(pendingGossip);
        return {
            type: 'random',
            probability: 0.1,
            content: {
                type: 'gossip',
                content: randomGossip.content,
                opener: getOpener('gossip', 'casual'),
                urgency: 'low',
                expectsReaction: false,
                followUpAvailable: true
            }
        };
    }

    return null;
}

// =====================================================
// FOLLOW-UP GENERATION
// =====================================================

/**
 * Generate follow-up to previous story
 */
export function generateFollowUp(previousContent: string, type: string): string {
    const followUps = {
        gossip: [
            "and like, that's not even the worst part",
            "there's actually more to it",
            "idk what to think about it tbh",
            "like am I crazy for thinking this is weird?",
            "anyway that's the tea ☕"
        ],
        vent: [
            "sorry for venting",
            "idk I just needed to tell someone",
            "anyway... how are you?",
            "ugh okay I'm done complaining",
            "thanks for listening to me rant"
        ],
        excitement: [
            "I'm so happy about it",
            "like finally something good",
            "anyway just wanted to share",
            "you'll love this"
        ]
    };

    return pickRandom(followUps[type as keyof typeof followUps] || followUps.gossip);
}

// =====================================================
// HELPER
// =====================================================

function pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}
