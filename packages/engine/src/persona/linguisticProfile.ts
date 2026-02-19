export type LinguisticRegister = 'casual' | 'balanced' | 'formal' | 'playful';

export interface CodeSwitchRule {
  pattern: string;
  register: LinguisticRegister;
  rationale: string;
}

export interface SociolinguisticProfile {
  id: string;
  register: LinguisticRegister;
  sentenceLengthTarget: number;
  punctuationStyle: 'minimal' | 'standard' | 'expressive';
  emojiUsage: 'none' | 'low' | 'medium' | 'high';
  slangLexicon: string[];
  signaturePhrases: string[];
  bannedPhrases: string[];
  codeSwitchRules: CodeSwitchRule[];
}

const toProfileId = (personaId: string): string => {
  const safe = personaId.replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'default';
  return `ling-profile-${safe}`;
};

const baseSentenceLength = (register: LinguisticRegister): number => {
  switch (register) {
    case 'casual':
      return 12;
    case 'formal':
      return 22;
    case 'playful':
      return 10;
    default:
      return 16;
  }
};

export const createDefaultSociolinguisticProfile = (
  personaId: string,
  register: LinguisticRegister = 'balanced'
): SociolinguisticProfile => {
  return {
    id: toProfileId(personaId),
    register,
    sentenceLengthTarget: baseSentenceLength(register),
    punctuationStyle: register === 'formal' ? 'standard' : register === 'playful' ? 'expressive' : 'minimal',
    emojiUsage: register === 'formal' ? 'low' : register === 'playful' ? 'medium' : 'low',
    slangLexicon: ['kinda', 'solid', 'sharp', 'let us ship'],
    signaturePhrases: ['stay concrete', 'one step at a time'],
    bannedPhrases: ['as an ai language model', 'i cannot fulfill'],
    codeSwitchRules: [
      {
        pattern: '(deadline|launch|plan|roadmap|strategy|decision)',
        register: 'formal',
        rationale: 'Execution and planning topics require precision.',
      },
      {
        pattern: '(joke|meme|funny|lol|haha|roast)',
        register: 'playful',
        rationale: 'Humor context should feel lighter and expressive.',
      },
      {
        pattern: '(hey|sup|yo|what\\s*up|bro|sis)',
        register: 'casual',
        rationale: 'Casual greetings map to relaxed conversation style.',
      },
    ],
  };
};

export const resolveRegisterByTopic = (
  profile: SociolinguisticProfile,
  userMessage: string
): LinguisticRegister => {
  const lowered = userMessage.toLowerCase();
  for (const rule of profile.codeSwitchRules) {
    const pattern = new RegExp(rule.pattern, 'i');
    if (pattern.test(lowered)) {
      return rule.register;
    }
  }
  return profile.register;
};

export const registerDirective = (register: LinguisticRegister): string => {
  switch (register) {
    case 'formal':
      return 'Use precise, structured sentences with clear qualifiers and minimal slang.';
    case 'casual':
      return 'Use relaxed, direct language with short sentences and natural contractions.';
    case 'playful':
      return 'Use energetic, witty language while staying coherent and grounded.';
    default:
      return 'Use balanced language: concise, clear, and personable.';
  }
};

export const summarizeLinguisticProfile = (
  profile: SociolinguisticProfile
): { consistencyHints: string[]; profileSummary: string } => {
  const hints = [
    `Target sentence length around ${profile.sentenceLengthTarget} words.`,
    `Preferred punctuation style: ${profile.punctuationStyle}.`,
    `Emoji usage: ${profile.emojiUsage}.`,
    `Avoid banned phrases: ${profile.bannedPhrases.slice(0, 2).join(', ') || 'none'}.`,
  ];

  const summary = [
    `register=${profile.register}`,
    `target_len=${profile.sentenceLengthTarget}`,
    `punctuation=${profile.punctuationStyle}`,
    `emoji=${profile.emojiUsage}`,
  ].join(', ');

  return {
    consistencyHints: hints,
    profileSummary: summary,
  };
};
