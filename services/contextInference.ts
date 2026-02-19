
/**
 * @file services/contextInference.ts
 * @description Infers visual context (location, lighting, mood) from conversation history
 */

import { Message } from '../types';
import { analyzeMoodFromConversation } from './moodAnalysisService';

export interface ImageContext {
   mood: string;
   location: string;
   timeOfDay: string;
   lighting: string;
   activity: string;
}

export function inferImageContextFromConversation(
   messages: Message[],
   currentHour: number
): ImageContext {
    // 1. Time of Day
    let timeOfDay = 'afternoon';
    if (currentHour >= 5 && currentHour < 12) timeOfDay = 'morning';
    else if (currentHour >= 12 && currentHour < 17) timeOfDay = 'afternoon';
    else if (currentHour >= 17 && currentHour < 21) timeOfDay = 'evening';
    else timeOfDay = 'late_night'; // "night" or "late_night"

    // 2. Mood
    const moodAnalysis = analyzeMoodFromConversation(messages);
    const mood = moodAnalysis.mood;
    
    // 3. Location Inference
    // Combine recent texts (last 10 messages)
    const recentMessages = messages.slice(-10);
    const recentText = recentMessages.map(m => m.text.toLowerCase()).join(' ');
    
    let location = 'Bedroom'; // Default fallback

    // Time-based defaults
    if (timeOfDay === 'morning') location = 'Bedroom';
    if (timeOfDay === 'afternoon') location = 'Living Room';
    if (timeOfDay === 'evening') location = 'Living Room';
    if (timeOfDay === 'late_night') location = 'Bedroom';

    // Keyword overrides (Priority over time defaults)
    if (/(kitchen|cooking|eating|food|hungry|snack|dinner|lunch|breakfast|fridge)/.test(recentText)) location = 'Kitchen';
    else if (/(bathroom|shower|bath|mirror|brushing|getting ready|makeup)/.test(recentText)) location = 'Bathroom Mirror';
    else if (/(outside|walk|park|garden|sun|street|hiking|nature)/.test(recentText)) location = 'Outdoors';
    else if (/(study|desk|work|homework|laptop|typing|office)/.test(recentText)) location = 'Study Desk';
    else if (/(couch|tv|movie|watch|living room|sofa|netflix)/.test(recentText)) location = 'Couch/Living Room';
    else if (/(bed|sleep|tired|nap|pillow|blanket|laying down)/.test(recentText)) location = 'Bedroom';
    else if (/(gym|workout|exercise|run|fitness)/.test(recentText)) location = 'Gym';
    else if (/(cafe|coffee|shop)/.test(recentText)) location = 'Cafe';
    else if (/(car|driving|traffic)/.test(recentText)) location = 'Car';

    // 4. Activity Inference
    let activity = 'taking a photo';
    if (location === 'Kitchen') activity = 'preparing food or eating';
    if (location === 'Study Desk') activity = 'working or studying';
    if (location === 'Bathroom Mirror') activity = 'getting ready';
    if (location === 'Outdoors') activity = 'walking';
    if (location === 'Gym') activity = 'working out';
    if (location === 'Cafe') activity = 'drinking coffee';
    if (location === 'Couch/Living Room') activity = 'relaxing';
    if (location === 'Bedroom') activity = 'relaxing in bed';

    // Refine activity
    if (recentText.includes('reading')) activity = 'reading';
    if (recentText.includes('music')) activity = 'listening to music';
    if (recentText.includes('game') || recentText.includes('playing')) activity = 'gaming';

    // 5. Lighting Inference
    let lighting = 'Natural window light';
    
    if (timeOfDay === 'late_night' || timeOfDay === 'night') {
        lighting = 'Dim indoor bulb (2700K), smartphone screen glow';
        if (location === 'Bedroom') lighting = 'Dark room, phone screen illumination on face';
    } else if (timeOfDay === 'evening') {
        lighting = 'Golden hour warm light or indoor ambient';
    }
    
    if (location === 'Bathroom Mirror') lighting = 'Bright vanity mirror light, slightly harsh';
    if (location === 'Outdoors' && (timeOfDay === 'morning' || timeOfDay === 'afternoon')) lighting = 'Natural sunlight';
    if (location === 'Gym') lighting = 'Fluorescent overhead';

    return {
        mood,
        location,
        timeOfDay,
        lighting,
        activity
    };
}
