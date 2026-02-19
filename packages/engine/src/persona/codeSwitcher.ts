import {
  type LinguisticRegister,
  type SociolinguisticProfile,
  registerDirective,
  resolveRegisterByTopic,
} from './linguisticProfile';

export interface CodeSwitchDecision {
  register: LinguisticRegister;
  directive: string;
  reasons: string[];
}

const detectToneRegister = (message: string): LinguisticRegister | null => {
  const lowered = message.toLowerCase();

  if (/(please|kindly|explain|analyze|compare|tradeoff|objective|therefore|hence)/i.test(lowered)) {
    return 'formal';
  }
  if (/(haha|lol|lmao|joke|meme|roast|funny)/i.test(lowered)) {
    return 'playful';
  }
  if (/(yo|sup|what'?s up|bro|sis|nah|yep|cool|hey)/i.test(lowered)) {
    return 'casual';
  }
  return null;
};

export const buildCodeSwitchDecision = (
  profile: SociolinguisticProfile,
  userMessage: string
): CodeSwitchDecision => {
  const reasons: string[] = [];

  const topicRegister = resolveRegisterByTopic(profile, userMessage);
  if (topicRegister !== profile.register) {
    reasons.push(`Topic rule switched register from ${profile.register} to ${topicRegister}.`);
  } else {
    reasons.push('No topic override detected; baseline register retained.');
  }

  const toneRegister = detectToneRegister(userMessage);
  const finalRegister = toneRegister ?? topicRegister;
  if (toneRegister && toneRegister !== topicRegister) {
    reasons.push(`Tone cues adjusted register to ${toneRegister}.`);
  }

  return {
    register: finalRegister,
    directive: registerDirective(finalRegister),
    reasons,
  };
};
