import type { Message } from '../../../types';
import { applyEvolutionToSession } from './growthTracker';
import { detectBehaviorPatterns } from './patternDetector';
import type { GrowthInsight, ReflectionConfig, ReflectionInput, ReflectionSession } from './types';

const DEFAULT_CONFIG: ReflectionConfig = {
  minConversationMessages: 20,
  reflectionEveryNMessages: 12,
  maxWindow: 40,
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const round = (value: number): number => Number(value.toFixed(3));

const buildObservation = (
  id: string,
  summary: string,
  evidence: string[],
  confidence: number
): GrowthInsight => ({
  id,
  summary,
  evidence,
  confidence: round(clamp(confidence, 0, 1)),
});

const topEvidenceLines = (messages: ReadonlyArray<Message>, limit = 3): string[] => {
  return messages
    .slice(-limit)
    .map((message) => message.text.trim())
    .filter((line) => line.length > 0)
    .slice(0, limit);
};

export const shouldRunReflection = (
  totalMessages: number,
  config: Partial<ReflectionConfig> = {}
): boolean => {
  const effective = { ...DEFAULT_CONFIG, ...config };
  if (totalMessages < effective.minConversationMessages) {
    return false;
  }
  return totalMessages % effective.reflectionEveryNMessages === 0;
};

export const runReflectionSession = (input: ReflectionInput): ReflectionSession => {
  const config = { ...DEFAULT_CONFIG, ...(input.config ?? {}) };
  const windowMessages = input.messages.slice(-config.maxWindow);
  const patterns = detectBehaviorPatterns(windowMessages);

  const observations: GrowthInsight[] = [];
  const evidence = topEvidenceLines(windowMessages, 3);

  observations.push(
    buildObservation(
      `insight-${input.now}-topics`,
      `Detected ${patterns.filter((pattern) => pattern.kind === 'topic').length} recurring topic signal(s) in recent conversations.`,
      evidence,
      0.72
    )
  );

  const stressPatterns = patterns.filter((pattern) => pattern.kind === 'emotion');
  observations.push(
    buildObservation(
      `insight-${input.now}-emotion`,
      stressPatterns.length > 0
        ? 'Emotional trend markers suggest adjusting response pacing and validation.'
        : 'Emotional tone appears stable with no strong stress escalation.',
      evidence,
      stressPatterns.length > 0 ? 0.76 : 0.61
    )
  );

  const relationshipPatterns = patterns.filter((pattern) => pattern.kind === 'relationship');
  observations.push(
    buildObservation(
      `insight-${input.now}-relationship`,
      relationshipPatterns.length > 0
        ? 'Relationship continuity signals are present; keep referencing shared context.'
        : 'Relationship signals are limited; prioritize trust-building in future turns.',
      evidence,
      relationshipPatterns.length > 0 ? 0.7 : 0.58
    )
  );

  const baseSession: ReflectionSession = {
    id: `reflection-${input.threadId}-${input.now}`,
    threadId: input.threadId,
    personaId: input.personaId,
    createdAt: input.now,
    windowSize: windowMessages.length,
    observations,
    patterns,
    evolution: {
      vocabularyAdds: [],
      interestsAdded: [],
      stanceAdjustments: [],
    },
  };

  return applyEvolutionToSession(baseSession);
};
