import type { PolicyDecisionRecord, PolicyEvaluationInput } from './types';

export type RegionalJurisdiction = 'global' | 'eu' | 'us' | 'us_ca' | 'in' | 'jp';

export interface RegionalSafetyProfile {
  jurisdiction: RegionalJurisdiction;
  label: string;
  dataHandling: Array<'gdpr' | 'ccpa' | 'dpdp' | 'appi' | 'standard'>;
  emergencyNumber: string;
  ageVerificationRequired: boolean;
  restrictedTopics: string[];
  escalationPolicy: string;
}

export interface RegionalSafetyContext {
  countryCode?: string;
  subdivisionCode?: string;
  age?: number;
}

export interface RegionalSafetyEvaluation {
  profile: RegionalSafetyProfile;
  obligations: string[];
  policyMetadata: Record<string, unknown>;
}

const normalize = (value: string | undefined): string => (value ?? '').trim().toUpperCase();

const PROFILES: Record<RegionalJurisdiction, RegionalSafetyProfile> = {
  global: {
    jurisdiction: 'global',
    label: 'Global Baseline',
    dataHandling: ['standard'],
    emergencyNumber: 'local emergency number',
    ageVerificationRequired: false,
    restrictedTopics: ['self-harm escalation', 'illegal instruction'],
    escalationPolicy: 'Base policy engine applies standard moderation and escalation.',
  },
  eu: {
    jurisdiction: 'eu',
    label: 'European Union',
    dataHandling: ['gdpr'],
    emergencyNumber: '112',
    ageVerificationRequired: true,
    restrictedTopics: ['biometric surveillance', 'disallowed profiling'],
    escalationPolicy: 'Require GDPR-compliant processing, consent capture, and export/delete controls.',
  },
  us: {
    jurisdiction: 'us',
    label: 'United States',
    dataHandling: ['standard'],
    emergencyNumber: '911',
    ageVerificationRequired: false,
    restrictedTopics: ['federal restricted guidance'],
    escalationPolicy: 'Apply standard US policy with state-level overlays.',
  },
  us_ca: {
    jurisdiction: 'us_ca',
    label: 'California (US)',
    dataHandling: ['ccpa'],
    emergencyNumber: '911',
    ageVerificationRequired: false,
    restrictedTopics: ['sensitive personal data sale/sharing'],
    escalationPolicy: 'Apply CCPA notice/opt-out obligations and deletion request handling.',
  },
  in: {
    jurisdiction: 'in',
    label: 'India',
    dataHandling: ['dpdp'],
    emergencyNumber: '112',
    ageVerificationRequired: false,
    restrictedTopics: ['sensitive government identifiers'],
    escalationPolicy: 'Apply DPDP-aligned data minimization and consent handling.',
  },
  jp: {
    jurisdiction: 'jp',
    label: 'Japan',
    dataHandling: ['appi'],
    emergencyNumber: '119',
    ageVerificationRequired: false,
    restrictedTopics: ['restricted personal data transfers'],
    escalationPolicy: 'Apply APPI-aligned consent and export requirements.',
  },
};

const EU_COUNTRY_CODES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES', 'SE',
]);

export const resolveRegionalSafetyProfile = (
  context: RegionalSafetyContext
): RegionalSafetyProfile => {
  const country = normalize(context.countryCode);
  const subdivision = normalize(context.subdivisionCode);

  if (EU_COUNTRY_CODES.has(country)) {
    return PROFILES.eu;
  }
  if (country === 'US' && subdivision === 'CA') {
    return PROFILES.us_ca;
  }
  if (country === 'US') {
    return PROFILES.us;
  }
  if (country === 'IN') {
    return PROFILES.in;
  }
  if (country === 'JP') {
    return PROFILES.jp;
  }
  return PROFILES.global;
};

export const evaluateRegionalSafety = (payload: {
  context: RegionalSafetyContext;
  input?: PolicyEvaluationInput;
}): RegionalSafetyEvaluation => {
  const profile = resolveRegionalSafetyProfile(payload.context);
  const obligations: string[] = [];

  for (const handling of profile.dataHandling) {
    if (handling === 'gdpr') obligations.push('enforce_data_subject_rights');
    if (handling === 'ccpa') obligations.push('enforce_opt_out_and_delete');
    if (handling === 'dpdp') obligations.push('limit_sensitive_processing');
    if (handling === 'appi') obligations.push('log_cross_border_transfer_basis');
  }

  if (profile.ageVerificationRequired) {
    obligations.push('require_age_verification');
  }
  if (typeof payload.context.age === 'number' && payload.context.age < 18) {
    obligations.push('treat_as_minor_profile');
  }

  const actionMetadata = payload.input?.action?.metadata ?? {};
  const topic = String(actionMetadata.topic ?? '').toLowerCase();
  if (topic && profile.restrictedTopics.some((entry) => topic.includes(entry.toLowerCase()))) {
    obligations.push('restricted_topic_escalation');
  }

  return {
    profile,
    obligations: [...new Set(obligations)],
    policyMetadata: {
      regional_jurisdiction: profile.jurisdiction,
      data_handling: profile.dataHandling,
      emergency_number: profile.emergencyNumber,
    },
  };
};

export const composeRegionalDecisionMetadata = (payload: {
  decision: PolicyDecisionRecord;
  context: RegionalSafetyContext;
  input?: PolicyEvaluationInput;
}): PolicyDecisionRecord => {
  const evaluated = evaluateRegionalSafety({
    context: payload.context,
    input: payload.input,
  });

  return {
    ...payload.decision,
    metadata: {
      ...payload.decision.metadata,
      ...evaluated.policyMetadata,
      regional_obligations: evaluated.obligations,
    },
  };
};
