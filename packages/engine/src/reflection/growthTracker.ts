import type { BehaviorPattern, PersonaEvolution, ReflectionSession } from './types';

const extractKeyword = (label: string): string => {
  const cleaned = label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4);
  return cleaned[cleaned.length - 1] ?? 'context';
};

const evolutionFromPatterns = (patterns: ReadonlyArray<BehaviorPattern>): PersonaEvolution => {
  const vocabularyAdds: string[] = [];
  const interests = new Set<string>();
  const adjustments: string[] = [];

  for (const pattern of patterns) {
    if (pattern.kind === 'topic' || pattern.kind === 'linguistic') {
      const keyword = extractKeyword(pattern.label);
      vocabularyAdds.push(keyword);
      interests.add(keyword);
    }

    if (pattern.kind === 'emotion' && pattern.trend === 'rising') {
      adjustments.push('Increase emotional validation before tactical advice.');
    }

    if (pattern.kind === 'relationship' && pattern.trend !== 'falling') {
      adjustments.push('Lean into trust-building continuity and shared context references.');
    }
  }

  return {
    vocabularyAdds: [...new Set(vocabularyAdds)].slice(0, 6),
    interestsAdded: [...interests].slice(0, 4),
    stanceAdjustments: [...new Set(adjustments)].slice(0, 4),
  };
};

export const derivePersonaEvolution = (
  patterns: ReadonlyArray<BehaviorPattern>
): PersonaEvolution => {
  return evolutionFromPatterns(patterns);
};

export const applyEvolutionToSession = (session: ReflectionSession): ReflectionSession => {
  return {
    ...session,
    evolution: derivePersonaEvolution(session.patterns),
  };
};
