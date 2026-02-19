export interface WritingCritiqueIssue {
  id: string;
  type: 'argument_structure' | 'citation_strength' | 'clarity';
  severity: 'low' | 'medium' | 'high';
  message: string;
  evidence?: string;
}

export interface WritingCritiqueResult {
  scores: {
    argumentStructure: number;
    citationStrength: number;
    clarity: number;
  };
  stats: {
    sentenceCount: number;
    citedClaims: number;
    uncitedClaims: number;
    circularReasoningFlags: number;
    averageSentenceLength: number;
    jargonDensity: number;
  };
  issues: WritingCritiqueIssue[];
  summary: string;
}

const ARGUMENT_CONNECTORS = [
  'because',
  'therefore',
  'however',
  'although',
  'while',
  'thus',
  'hence',
  'in contrast',
  'as a result',
];

const JARGON_TERMS = [
  'synergistic',
  'paradigm',
  'methodological',
  'epistemic',
  'ontological',
  'heuristic',
  'axiomatic',
  'multivariate',
  'teleological',
  'heterogeneous',
];

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const sentenceSplit = (text: string): string[] => {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
};

const hasCitation = (sentence: string): boolean => {
  return /(\[[^\]]+\])|(\([A-Za-z][^)]*\d{4}[^)]*\))/.test(sentence);
};

const isClaimSentence = (sentence: string): boolean => {
  const normalized = sentence.toLowerCase();
  if (normalized.length < 24) return false;
  return /(shows|demonstrates|indicates|proves|suggests|therefore|thus|because)/.test(normalized);
};

const circularFingerprint = (sentence: string): string => {
  return sentence
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .slice(0, 7)
    .join(' ')
    .trim();
};

const averageWords = (sentences: ReadonlyArray<string>): number => {
  if (sentences.length === 0) return 0;
  const total = sentences.reduce((sum, sentence) => sum + sentence.split(/\s+/).length, 0);
  return total / sentences.length;
};

const computeJargonDensity = (text: string): number => {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) return 0;

  const jargonCount = words.filter((word) => JARGON_TERMS.includes(word)).length;
  return jargonCount / words.length;
};

export const critiqueWritingSample = (payload: {
  text: string;
  nowIso?: string;
}): WritingCritiqueResult => {
  const text = payload.text.trim();
  const nowIso = payload.nowIso ?? new Date().toISOString();
  if (!text) {
    return {
      scores: {
        argumentStructure: 0,
        citationStrength: 0,
        clarity: 0,
      },
      stats: {
        sentenceCount: 0,
        citedClaims: 0,
        uncitedClaims: 0,
        circularReasoningFlags: 0,
        averageSentenceLength: 0,
        jargonDensity: 0,
      },
      issues: [
        {
          id: `issue-empty-${nowIso}`,
          type: 'clarity',
          severity: 'high',
          message: 'No writing sample provided.',
        },
      ],
      summary: 'Critique unavailable because the writing sample is empty.',
    };
  }

  const sentences = sentenceSplit(text);
  const issues: WritingCritiqueIssue[] = [];

  let citedClaims = 0;
  let uncitedClaims = 0;
  let connectorHits = 0;

  const fingerprints = new Map<string, number>();

  for (const sentence of sentences) {
    const normalized = sentence.toLowerCase();
    if (ARGUMENT_CONNECTORS.some((connector) => normalized.includes(connector))) {
      connectorHits += 1;
    }

    if (isClaimSentence(sentence)) {
      if (hasCitation(sentence)) {
        citedClaims += 1;
      } else {
        uncitedClaims += 1;
        issues.push({
          id: `uncited-${issues.length + 1}`,
          type: 'citation_strength',
          severity: 'medium',
          message: 'Claim appears unsupported by citation.',
          evidence: sentence.slice(0, 180),
        });
      }
    }

    const fingerprint = circularFingerprint(sentence);
    if (!fingerprint) continue;
    const nextCount = (fingerprints.get(fingerprint) ?? 0) + 1;
    fingerprints.set(fingerprint, nextCount);
  }

  const circularReasoningFlags = Array.from(fingerprints.values()).filter((count) => count > 1).length;
  if (circularReasoningFlags > 0) {
    issues.push({
      id: `circular-${issues.length + 1}`,
      type: 'argument_structure',
      severity: circularReasoningFlags > 2 ? 'high' : 'medium',
      message: 'Potential circular reasoning detected through repeated argument lead-ins.',
    });
  }

  const averageSentenceLength = averageWords(sentences);
  const jargonDensity = computeJargonDensity(text);

  if (averageSentenceLength > 30) {
    issues.push({
      id: `clarity-length-${issues.length + 1}`,
      type: 'clarity',
      severity: 'medium',
      message: 'Average sentence length is high; readability may suffer.',
      evidence: `Average sentence length: ${averageSentenceLength.toFixed(1)} words`,
    });
  }

  if (jargonDensity > 0.04) {
    issues.push({
      id: `clarity-jargon-${issues.length + 1}`,
      type: 'clarity',
      severity: jargonDensity > 0.08 ? 'high' : 'medium',
      message: 'Jargon density is elevated; consider plain-language rewrites.',
      evidence: `Jargon density: ${(jargonDensity * 100).toFixed(2)}%`,
    });
  }

  const argumentStructure = clamp(
    (connectorHits / Math.max(1, sentences.length)) * 0.6 +
      (1 - clamp(circularReasoningFlags / Math.max(1, sentences.length), 0, 1)) * 0.4,
    0,
    1
  );

  const claimCount = citedClaims + uncitedClaims;
  const citationStrength = claimCount > 0 ? citedClaims / claimCount : 0.75;

  const lengthPenalty = clamp(Math.abs(averageSentenceLength - 18) / 20, 0, 1);
  const jargonPenalty = clamp(jargonDensity * 8, 0, 1);
  const clarity = clamp(1 - lengthPenalty * 0.6 - jargonPenalty * 0.4, 0, 1);

  return {
    scores: {
      argumentStructure: Number(argumentStructure.toFixed(4)),
      citationStrength: Number(citationStrength.toFixed(4)),
      clarity: Number(clarity.toFixed(4)),
    },
    stats: {
      sentenceCount: sentences.length,
      citedClaims,
      uncitedClaims,
      circularReasoningFlags,
      averageSentenceLength: Number(averageSentenceLength.toFixed(2)),
      jargonDensity: Number(jargonDensity.toFixed(4)),
    },
    issues,
    summary:
      issues.length === 0
        ? 'Writing sample is structurally coherent with acceptable citation coverage and clarity.'
        : `${issues.length} issue(s) detected. Prioritize uncited claims and clarity refinements.`,
  };
};
