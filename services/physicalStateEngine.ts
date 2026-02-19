
/**
 * @file services/physicalStateEngine.ts
 * @description Physical State Engine - Body awareness for the persona
 * 
 * Simulates physical needs and states:
 * - Energy levels based on time of day
 * - Hunger/Thirst cycles
 * - Sleep quality and duration
 * - Physical comfort/discomfort
 */

export interface PhysicalState {
  energy: 'exhausted' | 'very_tired' | 'tired' | 'okay' | 'good' | 'energetic' | 'wired';
  hunger: 'starving' | 'very_hungry' | 'hungry' | 'satisfied' | 'full' | 'stuffed';
  thirst: 'parched' | 'thirsty' | 'okay' | 'hydrated';
  sleep: {
    hoursLastNight: number;
    quality: 'terrible' | 'poor' | 'okay' | 'good' | 'great';
    wentToBedAt: number; // Hour
    wokeUpAt: number;
  };
  health: 'sick' | 'unwell' | 'recovering' | 'okay' | 'good' | 'great';
  pain?: string; // "headache", "cramps", "backache"
  temperature: 'freezing' | 'cold' | 'cool' | 'comfortable' | 'warm' | 'hot' | 'sweating';
}

export function calculatePhysicalState(hour: number, dayEvents: any[]): PhysicalState {
  // Energy decreases through day
  let energy: PhysicalState['energy'] = 'okay';
  if (hour < 7) energy = 'exhausted';
  else if (hour < 9) energy = 'tired';
  else if (hour < 12) energy = 'good';
  else if (hour < 15) energy = 'okay'; // Post-lunch dip
  else if (hour < 18) energy = 'good';
  else if (hour < 21) energy = 'okay';
  else if (hour < 23) energy = 'tired';
  else energy = 'very_tired';
  
  // Hunger based on meals
  let hunger: PhysicalState['hunger'] = 'satisfied';
  const hoursSinceBreakfast = hour < 8 ? 12 : hour - 8;
  const hoursSinceLunch = hour < 13 ? 16 : hour - 13;
  const hoursSinceDinner = hour < 20 ? 8 : hour - 20;
  
  const minHoursSinceMeal = Math.min(hoursSinceBreakfast, hoursSinceLunch, hoursSinceDinner);
  if (minHoursSinceMeal > 5) hunger = 'starving';
  else if (minHoursSinceMeal > 4) hunger = 'very_hungry';
  else if (minHoursSinceMeal > 3) hunger = 'hungry';
  else if (minHoursSinceMeal < 1) hunger = 'full';
  
  return {
    energy,
    hunger,
    thirst: 'okay',
    sleep: {
      hoursLastNight: 6 + Math.floor(Math.random() * 3),
      quality: 'okay',
      wentToBedAt: 23,
      wokeUpAt: 7
    },
    health: 'good',
    temperature: 'comfortable'
  };
}

export function getPhysicalContext(state: PhysicalState): string {
  const parts: string[] = [];
  
  if (state.energy === 'exhausted' || state.energy === 'very_tired') {
    parts.push('[PHYSICAL: Exhausted. Yawning. Responses may be shorter, typos more common.]');
  }
  if (state.hunger === 'starving' || state.hunger === 'very_hungry') {
    parts.push('[PHYSICAL: Hungry. Might mention food, be slightly irritable.]');
  }
  if (state.pain) {
    parts.push(`[PHYSICAL: ${state.pain}. May be distracted, less patient.]`);
  }
  if (state.temperature === 'cold' || state.temperature === 'freezing') {
    parts.push('[PHYSICAL: Cold. Wrapped in blanket, mentions being cold.]');
  }
  
  return parts.join('\n');
}
