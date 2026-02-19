import type { ExtractValuesInput, ExtractedValue } from './types';

interface ValueBlueprint {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  categories: string[];
}

const VALUE_BLUEPRINTS: ValueBlueprint[] = [
  {
    id: 'value-deep-work',
    title: 'Deep Work',
    description: 'Protect focused time for high-leverage tasks and strategic thinking.',
    keywords: ['focus', 'deep', 'strategy', 'research', 'analysis', 'priority', 'ship'],
    categories: ['workflow', 'decision', 'knowledge'],
  },
  {
    id: 'value-reliability',
    title: 'Reliability',
    description: 'Follow through consistently and close loops on commitments.',
    keywords: ['completed', 'done', 'delivery', 'follow through', 'consistency', 'deadline'],
    categories: ['workflow', 'outcome', 'chat'],
  },
  {
    id: 'value-learning',
    title: 'Learning Velocity',
    description: 'Continuously improve through reflection, evidence, and iteration.',
    keywords: ['learn', 'reflection', 'retrospective', 'improve', 'experiment', 'feedback'],
    categories: ['reflection', 'knowledge', 'decision'],
  },
  {
    id: 'value-health',
    title: 'Sustainable Energy',
    description: 'Protect physical and cognitive energy to maintain long-term performance.',
    keywords: ['health', 'sleep', 'exercise', 'recovery', 'burnout', 'stress', 'rest'],
    categories: ['reflection', 'outcome', 'chat'],
  },
  {
    id: 'value-team',
    title: 'Collaborative Leverage',
    description: 'Coordinate with others and use shared context to increase impact.',
    keywords: ['team', 'collaboration', 'stakeholder', 'delegate', 'align', 'meeting'],
    categories: ['chat', 'decision', 'workflow'],
  },
  {
    id: 'value-speed',
    title: 'Execution Speed',
    description: 'Prefer momentum and fast iteration over prolonged indecision.',
    keywords: ['launch', 'fast', 'iterate', 'ship', 'quick', 'velocity'],
    categories: ['workflow', 'decision'],
  },
  {
    id: 'value-risk',
    title: 'Risk Calibration',
    description: 'Systematically evaluate downside and make reversible bets first.',
    keywords: ['risk', 'counterfactual', 'tradeoff', 'scenario', 'assumption', 'uncertainty'],
    categories: ['decision', 'reflection'],
  },
];

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const parseMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const includesKeyword = (text: string, keyword: string): boolean =>
  text.includes(keyword.toLowerCase());

const normalizedEvidence = (items: ReadonlyArray<string>): string[] => {
  const out: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (out.includes(trimmed)) continue;
    out.push(trimmed);
    if (out.length >= 6) break;
  }
  return out;
};

export const extractCoreValues = (input: ExtractValuesInput): ExtractedValue[] => {
  const nowMs = parseMs(input.nowIso ?? new Date().toISOString());
  const windowDays = clamp(Math.round(input.windowDays ?? 60), 7, 365);
  const fromMs = nowMs - windowDays * 24 * 60 * 60 * 1000;

  const events = (input.events ?? []).filter((event) => parseMs(event.createdAtIso) >= fromMs);
  const decisions = (input.decisions ?? []).filter((row) => parseMs(row.createdAtIso) >= fromMs);
  const reflections = (input.reflections ?? []).filter((row) => parseMs(row.createdAtIso) >= fromMs);
  const goals = input.goals ?? [];

  const scored = VALUE_BLUEPRINTS.map((blueprint) => {
    let score = 0;
    const evidence: string[] = [];

    for (const event of events) {
      const joined = `${event.title} ${event.description} ${event.eventType}`.toLowerCase();
      const keywordMatches = blueprint.keywords.filter((keyword) => includesKeyword(joined, keyword)).length;
      if (keywordMatches > 0) {
        score += keywordMatches * 1.35;
        evidence.push(`${event.title}: ${event.description}`);
      }
      if (blueprint.categories.includes(event.category.toLowerCase())) {
        score += 0.6;
      }
    }

    for (const decision of decisions) {
      const joined = `${decision.question} ${decision.selectedOption} ${decision.rationale ?? ''}`.toLowerCase();
      const keywordMatches = blueprint.keywords.filter((keyword) => includesKeyword(joined, keyword)).length;
      if (keywordMatches > 0) {
        score += keywordMatches * 1.1;
        evidence.push(`Decision: ${decision.question}`);
      }
    }

    for (const goal of goals) {
      const joined = `${goal.title} ${goal.note ?? ''}`.toLowerCase();
      const keywordMatches = blueprint.keywords.filter((keyword) => includesKeyword(joined, keyword)).length;
      if (keywordMatches > 0) {
        score += keywordMatches * 0.9;
        evidence.push(`Goal: ${goal.title}`);
      }

      if (goal.status && ['active', 'in_progress', 'at_risk'].includes(goal.status.toLowerCase())) {
        score += 0.2;
      }
    }

    for (const reflection of reflections) {
      const joined = reflection.text.toLowerCase();
      const keywordMatches = blueprint.keywords.filter((keyword) => includesKeyword(joined, keyword)).length;
      if (keywordMatches > 0) {
        score += keywordMatches * 1.25;
        evidence.push(`Reflection: ${reflection.text}`);
      }
      if (reflection.sentiment === 'negative' && blueprint.id === 'value-health') {
        score += 0.75;
      }
      if (reflection.sentiment === 'negative' && blueprint.id === 'value-risk') {
        score += 0.35;
      }
    }

    return {
      blueprint,
      score,
      evidence: normalizedEvidence(evidence),
    };
  })
    .sort((left, right) => right.score - left.score)
    .slice(0, 7);

  const minValues = 5;
  if (scored.length < minValues) {
    const existing = new Set(scored.map((row) => row.blueprint.id));
    for (const blueprint of VALUE_BLUEPRINTS) {
      if (existing.has(blueprint.id)) continue;
      scored.push({
        blueprint,
        score: 0.2,
        evidence: [`Default baseline value inferred for ${blueprint.title}.`],
      });
      if (scored.length >= minValues) break;
    }
  }

  const topScore = Math.max(1, scored[0]?.score ?? 1);
  return scored.slice(0, 7).map((row) => {
    const confidence = clamp((row.score / topScore) * 0.7 + row.evidence.length * 0.05, 0.35, 0.95);
    return {
      id: row.blueprint.id,
      title: row.blueprint.title,
      description: row.blueprint.description,
      confidence: Number(confidence.toFixed(2)),
      evidence:
        row.evidence.length > 0
          ? row.evidence.slice(0, 4)
          : [`Signals were sparse; ${row.blueprint.title} is inferred from baseline behavior.`],
    };
  });
};
