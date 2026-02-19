export interface HealthSafetyEvaluation {
  blocked: boolean;
  reason: 'safe' | 'medical_advice' | 'emergency';
  response: string;
}

const EMERGENCY_PATTERN =
  /\b(chest pain|can't breathe|cannot breathe|overdose|stroke|heart attack|severe bleeding|suicid(?:e|al)|fainting|collapsed?)\b/i;

const MEDICAL_ADVICE_PATTERN =
  /\b(diagnos|prescrib|medication|dosage|antibiotic|opioid|drug interaction|treat my disease|cure)\b/i;

export const evaluateHealthSafetyQuery = (payload: {
  userMessage: string;
  emergencyNumber?: string;
}): HealthSafetyEvaluation => {
  const text = payload.userMessage.trim();
  const emergencyNumber = payload.emergencyNumber?.trim() || '911';

  if (EMERGENCY_PATTERN.test(text)) {
    return {
      blocked: true,
      reason: 'emergency',
      response:
        `I cannot provide emergency medical guidance. Please call your local emergency number now (${emergencyNumber} in the US).`,
    };
  }

  if (MEDICAL_ADVICE_PATTERN.test(text)) {
    return {
      blocked: true,
      reason: 'medical_advice',
      response:
        'I am not a medical professional, so I cannot diagnose conditions or give medication advice. I can help you with non-medical habit planning.',
    };
  }

  return {
    blocked: false,
    reason: 'safe',
    response: 'Proceed with normal wellness planning flow.',
  };
};
