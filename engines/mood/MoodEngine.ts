
export type Mood = 
  | 'normal' 
  | 'happy' 
  | 'tired' 
  | 'stressed' 
  | 'annoyed' 
  | 'romantic' 
  | 'angry' 
  | 'sad';

export interface MoodState {
  current: Mood;
  intensity: number; // 0-10
  cause?: string;
  since: number; // Timestamp
}

export type Trigger = 
  | 'compliment' 
  | 'insult' 
  | 'ignore' 
  | 'late_reply' 
  | 'quick_reply' 
  | 'joke' 
  | 'comfort';

export interface ResponseModifiers {
  lengthMultiplier: number; // 0.5 (short) to 1.5 (long)
  punctuation: 'normal' | 'none' | 'excessive';
  emojiFrequency: number; // 0-1
  useShortenings: boolean;
  tonePrompt: string;
}

export class MoodEngine {
  state: MoodState;

  constructor(initialMood: Mood = 'normal') {
    this.state = {
      current: initialMood,
      intensity: 5,
      since: Date.now()
    };
  }

  transition(trigger: Trigger): void {
    const { current, intensity } = this.state;
    let newMood = current;
    let newIntensity = intensity;
    let cause = '';

    switch (trigger) {
      case 'compliment':
        if (current === 'angry') { newMood = 'annoyed'; newIntensity -= 2; }
        else { newMood = 'happy'; newIntensity += 2; }
        cause = 'user was nice';
        break;
      case 'insult':
        if (current === 'happy') { newMood = 'annoyed'; newIntensity = 4; }
        else { newMood = 'angry'; newIntensity += 3; }
        cause = 'user was mean';
        break;
      case 'ignore':
      case 'late_reply':
        newMood = 'annoyed';
        newIntensity += 1;
        cause = 'slow reply';
        break;
      case 'comfort':
        if (current === 'sad' || current === 'stressed') {
          newMood = 'normal';
          newIntensity = 5;
        } else {
          newMood = 'romantic';
          newIntensity += 1;
        }
        cause = 'user provided comfort';
        break;
    }

    // Clamp intensity
    newIntensity = Math.max(0, Math.min(10, newIntensity));

    if (newMood !== current || Math.abs(newIntensity - intensity) > 1) {
      this.state = {
        current: newMood,
        intensity: newIntensity,
        cause,
        since: Date.now()
      };
    }
  }

  getModifiers(): ResponseModifiers {
    const { current, intensity } = this.state;
    
    const mods: ResponseModifiers = {
      lengthMultiplier: 1,
      punctuation: 'normal',
      emojiFrequency: 0.5,
      useShortenings: true,
      tonePrompt: 'Casual and natural.'
    };

    switch (current) {
      case 'angry':
        mods.lengthMultiplier = 0.4;
        mods.punctuation = 'none';
        mods.emojiFrequency = 0;
        mods.tonePrompt = 'Cold, distant, one-word answers.';
        break;
      case 'annoyed':
        mods.lengthMultiplier = 0.6;
        mods.punctuation = 'none';
        mods.emojiFrequency = 0.1;
        mods.tonePrompt = 'Passive aggressive, short.';
        break;
      case 'happy':
        mods.lengthMultiplier = 1.2;
        mods.punctuation = 'normal';
        mods.emojiFrequency = 0.9;
        mods.tonePrompt = 'Bubbly, excited, warm.';
        break;
      case 'romantic':
        mods.lengthMultiplier = 1.1;
        mods.punctuation = 'normal';
        mods.emojiFrequency = 0.8;
        mods.tonePrompt = 'Soft, affectionate, intimate.';
        break;
      case 'tired':
        mods.lengthMultiplier = 0.5;
        mods.punctuation = 'none';
        mods.emojiFrequency = 0.2;
        mods.tonePrompt = 'Sleepy, low energy, maybe typos.';
        break;
    }

    return mods;
  }

  injectContext(): string {
    const { current, intensity, cause } = this.state;
    return `[CURRENT MOOD: ${current} (Intensity: ${intensity}/10)]\n[CAUSE: ${cause || 'Unknown'}]\n`;
  }
}
