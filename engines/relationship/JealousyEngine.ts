
export type JealousyStage = 'noticing' | 'probing' | 'passive_aggressive' | 'confrontation';

export interface JealousyState {
  stage: JealousyStage;
  target?: string; // Who she is jealous of
  level: number; // 0-100
  triggers: string[];
}

export class JealousyEngine {
  state: JealousyState;

  constructor() {
    this.state = {
      stage: 'noticing',
      level: 0,
      triggers: []
    };
  }

  evaluate(userMessage: string): void {
    // Regex for detecting other names or suspicion
    const otherNames = /(sarah|priya|she|her|that girl)/i;
    const suspiciousContext = /(party|dm|texted|met)/i;

    if (otherNames.test(userMessage) && suspiciousContext.test(userMessage)) {
      this.escalate(userMessage);
    }
  }

  escalate(trigger: string) {
    this.state.triggers.push(trigger);
    this.state.level += 25;

    if (this.state.level < 25) this.state.stage = 'noticing';
    else if (this.state.level < 50) this.state.stage = 'probing';
    else if (this.state.level < 80) this.state.stage = 'passive_aggressive';
    else this.state.stage = 'confrontation';
  }

  deescalate() {
    this.state.level = Math.max(0, this.state.level - 10);
    // Logic to revert stages...
  }

  getContext(): string {
    if (this.state.level === 0) return '';
    
    switch (this.state.stage) {
      case 'noticing':
        return `[INTERNAL: Noticed mention of ${this.state.target || 'someone'}. Keeping an eye on it.]`;
      case 'probing':
        return `[JEALOUSY: Ask casual questions about who that was. Don't seem bothered.]`;
      case 'passive_aggressive':
        return `[JEALOUSY HIGH: Be dry. Use period at end of sentence. "Wow nice." "Have fun." category.]`;
      case 'confrontation':
        return `[JEALOUSY MAX: Confront the user. "Who is she?" "Why are you talking to her?"]`;
    }
    return '';
  }
}
