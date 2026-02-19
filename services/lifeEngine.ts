/**
 * @file services/lifeEngine.ts
 * @description Autonomous Life Simulation Engine
 * 
 * Generates a realistic day-to-day life for the persona:
 * - Daily timeline of events
 * - Emotionally weighted experiences
 * - Things to share with partner
 * - Mood affecting situations
 * 
 * The persona EXISTS when you're not talking to her.
 */

import { supabase } from '../lib/supabase';

// =====================================================
// TYPES
// =====================================================

export interface LifeEvent {
    id: string;
    time: number; // Hour of day (0-23)
    type: 'routine' | 'social' | 'academic' | 'random' | 'drama' | 'discovery' | 'family' | 'self';
    description: string;
    emotionalImpact: number; // -1 = terrible, 0 = neutral, 1 = amazing
    shareability: number; // 0 = private, 1 = definitely share
    involvedPeople: string[];
    tags: string[];
    canGenerateFollowUp: boolean;
}

export interface DayTimeline {
    date: string;
    personaId: string;
    wakeTime: number;
    sleepTime: number;
    events: LifeEvent[];
    overallMood: number; // -1 to 1
    highlight: LifeEvent | null;
    lowlight: LifeEvent | null;
    unsharedEvents: LifeEvent[];
    sharedEvents: LifeEvent[];
}

export interface MoodArc {
    morningMood: number;
    currentMood: number;
    trajectory: 'improving' | 'stable' | 'declining';
    primaryCause: string;
    affectsConversation: boolean;
}

// =====================================================
// EVENT TEMPLATES
// =====================================================

const EVENT_TEMPLATES: Record<string, { templates: string[]; emotionalRange: [number, number]; shareability: number }> = {
    // Morning events
    wake_early: {
        templates: [
            "woke up surprisingly early",
            "couldn't sleep so got up early",
            "alarm actually worked for once"
        ],
        emotionalRange: [-0.2, 0.3],
        shareability: 0.3
    },
    wake_late: {
        templates: [
            "overslept 😭",
            "woke up late and panicked",
            "slept through my alarm",
            "finally woke up at like {time}"
        ],
        emotionalRange: [-0.5, -0.2],
        shareability: 0.6
    },
    weird_dream: {
        templates: [
            "had the weirdest dream last night",
            "dreamt about something so random",
            "woke up from a crazy dream",
            "had a dream about {topic}"
        ],
        emotionalRange: [-0.1, 0.3],
        shareability: 0.7
    },

    // Academic/Work events
    boring_class: {
        templates: [
            "class was so boring today",
            "the lecture dragged on forever",
            "couldn't focus in class at all",
            "{subject} class was torture"
        ],
        emotionalRange: [-0.4, -0.1],
        shareability: 0.5
    },
    interesting_class: {
        templates: [
            "actually learned something cool today",
            "class was interesting for once",
            "{subject} was actually good today"
        ],
        emotionalRange: [0.2, 0.5],
        shareability: 0.4
    },
    exam_stress: {
        templates: [
            "so stressed about the upcoming exam",
            "need to study but don't want to",
            "exam anxiety is hitting hard"
        ],
        emotionalRange: [-0.6, -0.3],
        shareability: 0.6
    },
    assignment_done: {
        templates: [
            "finally finished that assignment",
            "submitted the project just in time",
            "one less thing to worry about"
        ],
        emotionalRange: [0.3, 0.6],
        shareability: 0.5
    },

    // Social events
    friend_hangout: {
        templates: [
            "hung out with {friend} today",
            "went out with {friend}",
            "met up with {friend} for coffee",
            "{friend} and I went to {place}"
        ],
        emotionalRange: [0.3, 0.7],
        shareability: 0.7
    },
    friend_drama: {
        templates: [
            "{friend} told me something crazy",
            "drama with {friend}'s situation",
            "{friend} is going through something",
            "heard some tea about {person}"
        ],
        emotionalRange: [-0.2, 0.3],
        shareability: 0.9
    },
    friend_fight: {
        templates: [
            "had a weird moment with {friend}",
            "{friend} seemed off with me",
            "think {friend} might be mad at me"
        ],
        emotionalRange: [-0.6, -0.2],
        shareability: 0.8
    },

    // Family events
    family_annoying: {
        templates: [
            "mom was being annoying about {topic}",
            "family drama happened",
            "got into it with {family_member}",
            "{family_member} won't leave me alone about {topic}"
        ],
        emotionalRange: [-0.5, -0.2],
        shareability: 0.7
    },
    family_nice: {
        templates: [
            "had a nice moment with family",
            "{family_member} was actually sweet today",
            "family dinner wasn't terrible"
        ],
        emotionalRange: [0.2, 0.5],
        shareability: 0.4
    },

    // Random discoveries
    found_music: {
        templates: [
            "found this new song and I'm obsessed",
            "been listening to {song} on repeat",
            "discovered a new artist"
        ],
        emotionalRange: [0.4, 0.7],
        shareability: 0.8
    },
    found_show: {
        templates: [
            "started watching {show}",
            "got into a new show",
            "binge watching something"
        ],
        emotionalRange: [0.3, 0.6],
        shareability: 0.7
    },
    found_food: {
        templates: [
            "tried this new place and it was so good",
            "had the best {food} today",
            "craving {food} so bad"
        ],
        emotionalRange: [0.3, 0.6],
        shareability: 0.6
    },

    // Mood events
    random_sad: {
        templates: [
            "feeling kinda down for no reason",
            "in a weird mood today",
            "just one of those days"
        ],
        emotionalRange: [-0.5, -0.2],
        shareability: 0.6
    },
    random_happy: {
        templates: [
            "in such a good mood today",
            "feeling really good",
            "just vibing honestly"
        ],
        emotionalRange: [0.4, 0.7],
        shareability: 0.5
    },
    missing_you: {
        templates: [
            "kept thinking about you today",
            "something reminded me of you",
            "wished you were here for this"
        ],
        emotionalRange: [0.2, 0.5],
        shareability: 0.9
    },

    // Physical state
    tired: {
        templates: [
            "so exhausted today",
            "running on no sleep",
            "need coffee so bad",
            "can barely keep my eyes open"
        ],
        emotionalRange: [-0.4, -0.1],
        shareability: 0.5
    },
    sick: {
        templates: [
            "not feeling great today",
            "think I'm getting sick",
            "my head hurts"
        ],
        emotionalRange: [-0.5, -0.2],
        shareability: 0.6
    },

    // Phone/Social media
    saw_something: {
        templates: [
            "saw this thing on tiktok",
            "instagram is wild today",
            "saw {person}'s story and 💀",
            "this tweet killed me"
        ],
        emotionalRange: [-0.1, 0.4],
        shareability: 0.7
    }
};

// =====================================================
// DAY GENERATION
// =====================================================

/**
 * Generate a simulated day for the persona
 */
export function generateDay(
    personaId: string,
    date: Date = new Date(),
    personaProfile: PersonaProfile
): DayTimeline {
    const dateStr = date.toISOString().split('T')[0];
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Determine wake/sleep times
    const wakeTime = isWeekend
        ? 9 + Math.floor(Math.random() * 3)
        : 6 + Math.floor(Math.random() * 2);
    const sleepTime = 22 + Math.floor(Math.random() * 3);

    // Generate events throughout the day
    const events: LifeEvent[] = [];
    let currentHour = wakeTime;

    // Morning event (wake up related)
    const morningEvent = generateEvent('morning', currentHour, personaProfile);
    events.push(morningEvent);
    currentHour += 1 + Math.floor(Math.random() * 2);

    // Mid-morning (academic/work if weekday)
    if (!isWeekend && currentHour < 12) {
        const academicEvent = generateEvent('academic', currentHour, personaProfile);
        events.push(academicEvent);
        currentHour += 2 + Math.floor(Math.random() * 2);
    }

    // Afternoon events (1-3 random events)
    const afternoonEventCount = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < afternoonEventCount && currentHour < 18; i++) {
        const category = pickRandom(['social', 'random', 'discovery', 'family']);
        const event = generateEvent(category, currentHour, personaProfile);
        events.push(event);
        currentHour += 1 + Math.floor(Math.random() * 3);
    }

    // Evening event
    if (currentHour < sleepTime) {
        const eveningEvent = generateEvent('evening', currentHour, personaProfile);
        events.push(eveningEvent);
    }

    // Calculate overall mood from events
    const totalMood = events.reduce((sum, e) => sum + e.emotionalImpact, 0);
    const overallMood = Math.max(-1, Math.min(1, totalMood / events.length));

    // Find highlight and lowlight
    const sortedByImpact = [...events].sort((a, b) => b.emotionalImpact - a.emotionalImpact);
    const highlight = sortedByImpact[0]?.emotionalImpact > 0 ? sortedByImpact[0] : null;
    const lowlight = sortedByImpact[sortedByImpact.length - 1]?.emotionalImpact < 0
        ? sortedByImpact[sortedByImpact.length - 1]
        : null;

    return {
        date: dateStr,
        personaId,
        wakeTime,
        sleepTime,
        events,
        overallMood,
        highlight,
        lowlight,
        unsharedEvents: events.filter(e => e.shareability > 0.5),
        sharedEvents: []
    };
}

/**
 * Generate a single life event
 */
function generateEvent(
    category: string,
    hour: number,
    profile: PersonaProfile
): LifeEvent {
    // Select event type based on category and randomness
    const eventTypes = getEventTypesForCategory(category);
    const eventType = pickRandom(eventTypes);
    const template = EVENT_TEMPLATES[eventType];

    if (!template) {
        return createGenericEvent(category, hour);
    }

    // Generate description from template
    const description = fillTemplate(
        pickRandom(template.templates),
        profile
    );

    // Calculate emotional impact within range
    const [minImpact, maxImpact] = template.emotionalRange;
    const emotionalImpact = minImpact + Math.random() * (maxImpact - minImpact);

    return {
        id: `event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        time: hour,
        type: getCategoryType(category),
        description,
        emotionalImpact: Math.round(emotionalImpact * 100) / 100,
        shareability: template.shareability + (Math.random() - 0.5) * 0.2,
        involvedPeople: extractPeople(description, profile),
        tags: [category, eventType],
        canGenerateFollowUp: emotionalImpact > 0.3 || emotionalImpact < -0.3
    };
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

interface PersonaProfile {
    friends: string[];
    familyMembers: string[];
    interests: string[];
    subjects: string[];
    places: string[];
}

function getEventTypesForCategory(category: string): string[] {
    const categoryMap: Record<string, string[]> = {
        morning: ['wake_early', 'wake_late', 'weird_dream', 'tired'],
        academic: ['boring_class', 'interesting_class', 'exam_stress', 'assignment_done'],
        social: ['friend_hangout', 'friend_drama', 'friend_fight'],
        family: ['family_annoying', 'family_nice'],
        discovery: ['found_music', 'found_show', 'found_food'],
        random: ['random_sad', 'random_happy', 'missing_you', 'saw_something'],
        evening: ['friend_hangout', 'found_show', 'tired', 'random_happy']
    };

    return categoryMap[category] || ['random_happy'];
}

function getCategoryType(category: string): LifeEvent['type'] {
    const typeMap: Record<string, LifeEvent['type']> = {
        morning: 'routine',
        academic: 'academic',
        social: 'social',
        family: 'family',
        discovery: 'discovery',
        random: 'random',
        evening: 'social'
    };
    return typeMap[category] || 'random';
}

function fillTemplate(template: string, profile: PersonaProfile): string {
    let result = template;

    // Replace placeholders
    result = result.replace('{friend}', pickRandom(profile.friends || ['Aashika']));
    result = result.replace('{family_member}', pickRandom(profile.familyMembers || ['mom']));
    result = result.replace('{subject}', pickRandom(profile.subjects || ['math']));
    result = result.replace('{place}', pickRandom(profile.places || ['the mall']));
    result = result.replace('{person}', pickRandom([...profile.friends, 'someone']));
    result = result.replace('{topic}', pickRandom(['cleaning', 'studying', 'phone time', 'going out']));
    result = result.replace('{time}', `${9 + Math.floor(Math.random() * 4)}am`);
    result = result.replace('{song}', 'this song');
    result = result.replace('{show}', pickRandom(['this new show', 'something on Netflix']));
    result = result.replace('{food}', pickRandom(['coffee', 'momo', 'pizza', 'noodles']));

    return result;
}

function extractPeople(description: string, profile: PersonaProfile): string[] {
    const people: string[] = [];
    for (const friend of profile.friends) {
        if (description.toLowerCase().includes(friend.toLowerCase())) {
            people.push(friend);
        }
    }
    for (const family of profile.familyMembers) {
        if (description.toLowerCase().includes(family.toLowerCase())) {
            people.push(family);
        }
    }
    return people;
}

function pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function createGenericEvent(category: string, hour: number): LifeEvent {
    return {
        id: `event_${Date.now()}_generic`,
        time: hour,
        type: 'random',
        description: 'nothing much happened',
        emotionalImpact: 0,
        shareability: 0.2,
        involvedPeople: [],
        tags: [category],
        canGenerateFollowUp: false
    };
}

// =====================================================
// MOOD ARC
// =====================================================

/**
 * Calculate current mood from day events
 */
export function calculateMoodArc(timeline: DayTimeline, currentHour: number): MoodArc {
    const eventsUpToNow = timeline.events.filter(e => e.time <= currentHour);

    if (eventsUpToNow.length === 0) {
        return {
            morningMood: 0,
            currentMood: 0,
            trajectory: 'stable',
            primaryCause: 'just woke up',
            affectsConversation: false
        };
    }

    const morningEvents = eventsUpToNow.filter(e => e.time < 12);
    const morningMood = morningEvents.length > 0
        ? morningEvents.reduce((sum, e) => sum + e.emotionalImpact, 0) / morningEvents.length
        : 0;

    const recentEvents = eventsUpToNow.slice(-3);
    const currentMood = recentEvents.reduce((sum, e) => sum + e.emotionalImpact, 0) / recentEvents.length;

    const trajectory = currentMood > morningMood + 0.2 ? 'improving'
        : currentMood < morningMood - 0.2 ? 'declining'
            : 'stable';

    const mostImpactful = [...eventsUpToNow].sort((a, b) =>
        Math.abs(b.emotionalImpact) - Math.abs(a.emotionalImpact)
    )[0];

    return {
        morningMood: Math.round(morningMood * 100) / 100,
        currentMood: Math.round(currentMood * 100) / 100,
        trajectory,
        primaryCause: mostImpactful?.description || 'nothing specific',
        affectsConversation: Math.abs(currentMood) > 0.3
    };
}

// =====================================================
// STORY GENERATION
// =====================================================

/**
 * Generate "how was your day" response
 */
export function generateDayStory(timeline: DayTimeline): string {
    const shareable = timeline.unsharedEvents;

    if (shareable.length === 0) {
        const blandResponses = [
            "nothing much really",
            "pretty regular day tbh",
            "same old same old"
        ];
        return pickRandom(blandResponses);
    }

    const highlight = timeline.highlight;
    const mood = timeline.overallMood;

    let prefix = '';
    if (mood > 0.3) {
        prefix = pickRandom(["it was good actually!", "pretty good tbh", "good!"]);
    } else if (mood < -0.3) {
        prefix = pickRandom(["ugh don't even ask", "not great tbh", "kinda rough actually"]);
    } else {
        prefix = pickRandom(["eh it was okay", "nothing special", "decent I guess"]);
    }

    if (highlight) {
        return `${prefix} ${highlight.description}`;
    }

    const randomEvent = pickRandom(shareable);
    return `${prefix} ${randomEvent.description}`;
}

// =====================================================
// EXPORTS
// =====================================================

export type { PersonaProfile };
export { EVENT_TEMPLATES };
