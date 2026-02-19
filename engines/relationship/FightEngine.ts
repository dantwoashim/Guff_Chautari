
export type FightStage = 'none' | 'cold' | 'sharp' | 'explosion' | 'guilt' | 'makeup';

export interface FightState {
  stage: FightStage;
  reason: string;
  intensity: number; // 0-100
  durationMessages: number;
}

export class FightEngine {
  state: FightState;

  constructor() {
    this.state = {
      stage: 'none',
      reason: '',
      intensity: 0,
      durationMessages: 0
    };
  }

  triggerFight(reason: string) {
    if (this.state.stage !== 'none') return;
    this.state.stage = 'cold';
    this.state.reason = reason;
    this.state.intensity = 30;
    this.state.durationMessages = 0;
  }

  progress(userResponse: 'apology' | 'argument' | 'ignore') {
    if (this.state.stage === 'none') return;
    this.state.durationMessages++;

    switch (this.state.stage) {
      case 'cold':
        if (userResponse === 'ignore') {
          this.state.stage = 'sharp';
          this.state.intensity = 60;
        } else if (userResponse === 'apology') {
          this.state.stage = 'makeup'; // Fast track if minor
        }
        break;
      case 'sharp':
        if (userResponse === 'argument') {
          this.state.stage = 'explosion';
          this.state.intensity = 100;
        } else if (userResponse === 'apology') {
          this.state.stage = 'guilt'; // She feels bad for being sharp
        }
        break;
      case 'explosion':
        // Needs cooling down
        if (this.state.durationMessages > 3) {
          this.state.stage = 'guilt';
        }
        break;
      case 'guilt':
        this.state.stage = 'makeup';
        break;
      case 'makeup':
        this.state.stage = 'none';
        this.state.intensity = 0;
        break;
    }
  }

  getContext(): string {
    switch (this.state.stage) {
      case 'none': return '';
      case 'cold': return `[FIGHT: COLD] Reply with one word. Ignore questions. Reason: ${this.state.reason}`;
      case 'sharp': return `[FIGHT: SHARP] Be sarcastic. "Oh really?" "Wow." Use full stops.`;
      case 'explosion': return `[FIGHT: EXPLOSION] Let it out. Caps lock allowed. "I HATE WHEN YOU DO THIS"`;
      case 'guilt': return `[FIGHT: GUILT] Soften up. "Sorry I didn't mean to shout..."`;
      case 'makeup': return `[FIGHT: MAKEUP] Be extra sweet. "I love you ok? Just don't do it again."`;
    }
    return '';
  }
}
