import type { CouncilDebateResult, CouncilPerspectiveStyle, SynthesizeCouncilInput, SynthesizedRecommendation } from './types';
import { generateSequentialPerspectives } from './perspectiveGenerator';

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const stylePriority: Record<CouncilPerspectiveStyle, number> = {
  execution_focused: 5,
  analytical: 4,
  skeptical: 3,
  empathetic: 2,
  creative: 1,
};

const recommendedActionForStyle: Record<CouncilPerspectiveStyle, string> = {
  analytical: 'Run a weighted option matrix and commit to the top option with weekly checkpoints.',
  empathetic: 'Choose the path that protects trust and reduces avoidable burnout.',
  skeptical: 'Choose the reversible path with the smallest downside radius.',
  creative: 'Pilot a hybrid option in a constrained two-week experiment.',
  execution_focused: 'Lock one plan today and execute the first milestone within 48 hours.',
};

const topStyle = (counts: Map<CouncilPerspectiveStyle, number>): CouncilPerspectiveStyle => {
  return Array.from(counts.entries()).sort((left, right) => {
    if (right[1] !== left[1]) return right[1] - left[1];
    return stylePriority[right[0]] - stylePriority[left[0]];
  })[0][0];
};

const bottomStyle = (counts: Map<CouncilPerspectiveStyle, number>): CouncilPerspectiveStyle => {
  return Array.from(counts.entries()).sort((left, right) => {
    if (left[1] !== right[1]) return left[1] - right[1];
    return stylePriority[left[0]] - stylePriority[right[0]];
  })[0][0];
};

export const synthesizeCouncilRecommendation = (
  input: SynthesizeCouncilInput
): SynthesizedRecommendation => {
  if (input.perspectives.length === 0) {
    throw new Error('Cannot synthesize council debate without perspectives.');
  }

  const counts = new Map<CouncilPerspectiveStyle, number>();
  for (const perspective of input.perspectives) {
    counts.set(perspective.style, (counts.get(perspective.style) ?? 0) + 1);
  }

  const dominantStyle = topStyle(counts);
  const minorityStyle = bottomStyle(counts);

  const dominantMembers = input.perspectives
    .filter((item) => item.style === dominantStyle)
    .map((item) => item.memberName);
  const minorityMembers = input.perspectives
    .filter((item) => item.style === minorityStyle)
    .map((item) => item.memberName);

  const agreements = Array.from(new Set(input.perspectives.map((item) => item.actionBias))).slice(0, 3);
  const disagreements = input.perspectives
    .filter((item) => item.style !== dominantStyle)
    .map((item) => `${item.memberName}: ${item.actionBias}`)
    .slice(0, 3);

  const confidence = Number((0.45 + (dominantMembers.length / input.perspectives.length) * 0.5).toFixed(2));
  const nowIso = input.nowIso ?? new Date().toISOString();

  return {
    id: makeId('synthesis'),
    councilId: input.council.id,
    prompt: input.prompt,
    consensus: `Primary alignment from ${dominantMembers.join(', ')} using ${dominantStyle} framing.`,
    minorityView:
      minorityMembers.length > 0
        ? `${minorityMembers.join(', ')} push a ${minorityStyle} counterweight to reduce blind spots.`
        : 'No meaningful minority disagreement detected.',
    recommendedAction: recommendedActionForStyle[dominantStyle],
    confidence,
    agreements,
    disagreements,
    references: input.perspectives.map((item) => ({
      memberId: item.memberId,
      memberName: item.memberName,
      style: item.style,
    })),
    createdAtIso: nowIso,
  };
};

export const runCouncilDebate = async (input: {
  council: SynthesizeCouncilInput['council'];
  prompt: string;
  nowIso?: string;
}): Promise<CouncilDebateResult> => {
  const startedAt = Date.now();
  const perspectives = await generateSequentialPerspectives({
    council: input.council,
    prompt: input.prompt,
    nowIso: input.nowIso,
  });
  const synthesis = synthesizeCouncilRecommendation({
    council: input.council,
    prompt: input.prompt,
    perspectives,
    nowIso: input.nowIso,
  });

  return {
    council: input.council,
    prompt: input.prompt,
    perspectives,
    synthesis,
    durationMs: Date.now() - startedAt,
  };
};
