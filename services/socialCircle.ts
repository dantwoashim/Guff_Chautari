/**
 * @file services/socialCircle.ts
 * @description Social Circle Simulation
 * 
 * The persona has a realistic social world:
 * - Best friend (always has drama)
 * - Friend group
 * - Annoying person
 * - Family members
 * - Ex-friend/crush (optional drama)
 * 
 * These people generate stories and gossip.
 */

// =====================================================
// TYPES
// =====================================================

export interface Person {
    id: string;
    name: string;
    nickname?: string;
    relationship: RelationshipType;
    closeness: number; // 0-1
    currentDrama?: string;
    lastInteraction?: Date;
    recurringTopics: string[];
    personality: string[];
    sharedHistory: string[];
}

export type RelationshipType =
    | 'best_friend'
    | 'close_friend'
    | 'friend'
    | 'acquaintance'
    | 'annoying_person'
    | 'crush'
    | 'ex_friend'
    | 'mother'
    | 'father'
    | 'sibling'
    | 'relative';

export interface SocialCircle {
    personaId: string;
    people: Person[];
    activeRelationships: Map<string, RelationshipState>;
    recentInteractions: SocialInteraction[];
    currentDramas: Drama[];
}

export interface RelationshipState {
    personId: string;
    status: 'good' | 'neutral' | 'tense' | 'fighting' | 'not_talking';
    lastStatusChange: Date;
    unresolvedIssue?: string;
}

export interface SocialInteraction {
    id: string;
    personId: string;
    personName: string;
    type: 'texted' | 'called' | 'met' | 'saw' | 'heard_about';
    content: string;
    timestamp: Date;
    emotionalImpact: number;
    canShare: boolean;
}

export interface Drama {
    id: string;
    title: string;
    involvedPeople: string[];
    description: string;
    severity: 'mild' | 'moderate' | 'major' | 'explosive';
    status: 'brewing' | 'happening' | 'aftermath' | 'resolved';
    daysActive: number;
    updates: DramaUpdate[];
}

export interface DramaUpdate {
    day: number;
    description: string;
    newInfo: boolean;
}

// =====================================================
// DEFAULT SOCIAL CIRCLE
// =====================================================

export function createDefaultSocialCircle(personaName: string): Person[] {
    return [
        // Best friend
        {
            id: 'friend_1',
            name: 'Aashika',
            nickname: 'Ash',
            relationship: 'best_friend',
            closeness: 0.95,
            recurringTopics: ['boys', 'drama', 'fashion', 'college'],
            personality: ['dramatic', 'loyal', 'fun'],
            sharedHistory: ['known since school', 'always together']
        },
        // Close friend
        {
            id: 'friend_2',
            name: 'Priya',
            relationship: 'close_friend',
            closeness: 0.8,
            recurringTopics: ['studies', 'career', 'movies'],
            personality: ['smart', 'calm', 'supportive'],
            sharedHistory: ['college friends']
        },
        // Friend
        {
            id: 'friend_3',
            name: 'Sanjana',
            nickname: 'Sanj',
            relationship: 'friend',
            closeness: 0.6,
            recurringTopics: ['food', 'hangouts', 'music'],
            personality: ['chill', 'foodie'],
            sharedHistory: ['friend group']
        },
        // Annoying person
        {
            id: 'annoying_1',
            name: 'Rohan',
            relationship: 'annoying_person',
            closeness: 0.2,
            recurringTopics: ['asking for notes', 'being weird', 'staring'],
            personality: ['creepy', 'persistent', 'clueless'],
            sharedHistory: ['classmate', 'keeps trying to talk']
        },
        // Mother
        {
            id: 'family_1',
            name: 'mama',
            relationship: 'mother',
            closeness: 0.85,
            recurringTopics: ['cleaning', 'studying', 'phone time', 'marriage', 'food'],
            personality: ['caring', 'nagging', 'protective'],
            sharedHistory: []
        },
        // Father
        {
            id: 'family_2',
            name: 'baba',
            relationship: 'father',
            closeness: 0.7,
            recurringTopics: ['career', 'money', 'news'],
            personality: ['strict', 'practical'],
            sharedHistory: []
        },
        // Sibling
        {
            id: 'family_3',
            name: 'Aarav',
            relationship: 'sibling',
            closeness: 0.6,
            recurringTopics: ['borrowing stuff', 'annoying each other', 'games'],
            personality: ['annoying', 'funny sometimes'],
            sharedHistory: ['younger brother']
        }
    ];
}

// =====================================================
// INTERACTION GENERATION
// =====================================================

const INTERACTION_TEMPLATES: Record<string, string[]> = {
    best_friend_positive: [
        "{name} and I had the best time today",
        "{name} texted me something so funny",
        "{name} is literally the best, she said {quote}",
        "was laughing with {name} about {topic}"
    ],
    best_friend_drama: [
        "{name} told me some TEA about {person}",
        "you won't believe what {name} just told me",
        "{name} is going through something, I'm worried",
        "OMG {name} just called me with news"
    ],
    friend_normal: [
        "hung out with {name} today",
        "{name} and I went to {place}",
        "saw {name}, we talked about {topic}",
        "coffee with {name} was nice"
    ],
    annoying_person: [
        "{name} was being so annoying again",
        "guess who I had to deal with today... {name}",
        "{name} won't leave me alone",
        "ugh {name} did the thing again"
    ],
    mother_nagging: [
        "mama won't stop talking about {topic}",
        "got lectured about {topic} again",
        "mama is on my case about {topic}",
        "parents being parents... {topic} as usual"
    ],
    mother_sweet: [
        "mama was actually sweet today",
        "had a nice talk with mama",
        "mama made my favorite food"
    ],
    sibling: [
        "{name} was being annoying",
        "{name} borrowed my stuff without asking AGAIN",
        "fighting with {name} over nothing",
        "actually {name} was funny today"
    ]
};

/**
 * Generate a social interaction
 */
export function generateInteraction(
    person: Person,
    type: 'positive' | 'negative' | 'neutral' | 'drama' = 'neutral'
): SocialInteraction {
    const templates = getTemplatesForPerson(person, type);
    let template = pickRandom(templates);

    // Fill in placeholders
    template = template.replace('{name}', person.nickname || person.name);
    template = template.replace('{topic}', pickRandom(person.recurringTopics));
    template = template.replace('{place}', pickRandom(['the mall', 'this cafe', 'college', 'her place']));
    template = template.replace('{quote}', pickRandom([
        'this one thing',
        'something so cute',
        'the funniest thing'
    ]));
    template = template.replace('{person}', pickRandom(['this guy', 'someone from class', 'her ex']));

    return {
        id: `interaction_${Date.now()}`,
        personId: person.id,
        personName: person.name,
        type: 'texted',
        content: template,
        timestamp: new Date(),
        emotionalImpact: type === 'positive' ? 0.5 : type === 'negative' ? -0.4 : 0.1,
        canShare: true
    };
}

function getTemplatesForPerson(person: Person, type: string): string[] {
    if (person.relationship === 'best_friend') {
        if (type === 'drama') return INTERACTION_TEMPLATES.best_friend_drama;
        return INTERACTION_TEMPLATES.best_friend_positive;
    }
    if (person.relationship === 'annoying_person') {
        return INTERACTION_TEMPLATES.annoying_person;
    }
    if (person.relationship === 'mother') {
        if (type === 'negative') return INTERACTION_TEMPLATES.mother_nagging;
        return INTERACTION_TEMPLATES.mother_sweet;
    }
    if (person.relationship === 'sibling') {
        return INTERACTION_TEMPLATES.sibling;
    }
    return INTERACTION_TEMPLATES.friend_normal;
}

// =====================================================
// DRAMA GENERATION
// =====================================================

const DRAMA_TEMPLATES = [
    {
        title: "The {person1} and {person2} Situation",
        description: "{person1} and {person2} might have something going on",
        severity: 'moderate' as const
    },
    {
        title: "{person} Being Weird",
        description: "{person} has been acting strange lately",
        severity: 'mild' as const
    },
    {
        title: "Fight with {person}",
        description: "things are tense with {person} right now",
        severity: 'moderate' as const
    },
    {
        title: "The {topic} Drama",
        description: "whole friend group is divided about {topic}",
        severity: 'moderate' as const
    },
    {
        title: "{person}'s Secret",
        description: "found out something about {person}",
        severity: 'major' as const
    }
];

/**
 * Generate a new drama storyline
 */
export function generateDrama(people: Person[]): Drama {
    const friends = people.filter(p =>
        p.relationship === 'best_friend' ||
        p.relationship === 'close_friend' ||
        p.relationship === 'friend'
    );

    const template = pickRandom(DRAMA_TEMPLATES);
    const person1 = pickRandom(friends);
    const person2 = pickRandom(friends.filter(f => f.id !== person1.id));

    let title = template.title
        .replace('{person1}', person1.name)
        .replace('{person2}', person2?.name || 'Someone')
        .replace('{person}', person1.name)
        .replace('{topic}', pickRandom(['this guy', 'going out', 'a secret']));

    let description = template.description
        .replace('{person1}', person1.name)
        .replace('{person2}', person2?.name || 'someone')
        .replace('{person}', person1.name)
        .replace('{topic}', pickRandom(['this drama', 'what happened']));

    return {
        id: `drama_${Date.now()}`,
        title,
        involvedPeople: [person1.id, person2?.id].filter(Boolean) as string[],
        description,
        severity: template.severity,
        status: 'happening',
        daysActive: 1,
        updates: [{
            day: 1,
            description: description,
            newInfo: true
        }]
    };
}

/**
 * Update an ongoing drama
 */
export function updateDrama(drama: Drama): Drama {
    const updates = [
        "there's new development with this",
        "okay so update on this situation",
        "more tea on this",
        "things are getting interesting"
    ];

    drama.daysActive++;
    drama.updates.push({
        day: drama.daysActive,
        description: pickRandom(updates),
        newInfo: true
    });

    // Maybe resolve after a few days
    if (drama.daysActive > 5 && Math.random() < 0.3) {
        drama.status = 'resolved';
    }

    return drama;
}

// =====================================================
// HELPER
// =====================================================

function pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}