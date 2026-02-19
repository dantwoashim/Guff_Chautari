import { geminiContextCache, type GeminiContextCache } from '../../providers';
import type { PersonaAspect } from '../pipeline/types';
import { PersonaGraphStore } from './personaGraph';
import type {
  DifferentialLoaderInput,
  DifferentialTierOutput,
  PersonaRuntimeState,
} from './types';

const CORE_BUDGET = 500;
const SESSION_TARGET_BUDGET = 100;
const SESSION_MAX_BUDGET = 150;
const CONTEXT_BUDGET = 200;

const toTokenEstimate = (value: string): number => {
  const words = value
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
  return Math.ceil(words / 0.75);
};

const trimToBudget = (value: string, budget: number): string => {
  if (!value.trim()) return '';
  const words = value.trim().split(/\s+/);

  let cursor = words.length;
  while (cursor > 0) {
    const candidate = words.slice(0, cursor).join(' ');
    if (toTokenEstimate(candidate) <= budget) {
      return candidate;
    }
    cursor -= 1;
  }

  return '';
};

const normalizeState = (state: PersonaRuntimeState): Record<string, string> => {
  return {
    identity_variant: state.identityVariant,
    identity_confidence: state.identityConfidence.toFixed(2),
    energy: state.energy.toFixed(2),
    relationship_stage: state.relationshipStage,
    trust_score: state.trustScore.toFixed(2),
    emotional: state.emotionalSummary,
    time_period: state.timePeriod,
  };
};

const stateDiff = (
  previous: Record<string, string>,
  next: Record<string, string>
): Array<[string, string]> => {
  const entries = Object.entries(next);
  return entries.filter(([key, value]) => previous[key] !== value);
};

const buildContextualText = (aspects: ReadonlyArray<PersonaAspect>, memoryHints: ReadonlyArray<string>): string => {
  if (aspects.length > 0) {
    return aspects.map((aspect) => `- ${aspect.title}: ${aspect.content}`).join('\n');
  }

  if (memoryHints.length > 0) {
    return memoryHints.map((hint) => `- memory: ${hint}`).join('\n');
  }

  return '- no additional context retrieved';
};

const makeSessionKey = (personaId: string, sessionId: string): string => {
  return `${personaId}:${sessionId}`;
};

interface DifferentialLoaderOptions {
  cache?: GeminiContextCache;
}

export class DifferentialPersonaLoader {
  private readonly cache: GeminiContextCache;
  private readonly previousStateBySession = new Map<string, Record<string, string>>();
  private readonly graphByPersona = new Map<string, PersonaGraphStore>();

  constructor(options: DifferentialLoaderOptions = {}) {
    this.cache = options.cache ?? geminiContextCache;
  }

  compose(input: DifferentialLoaderInput): DifferentialTierOutput {
    const immutableCore = trimToBudget(input.systemInstruction, CORE_BUDGET);
    const cacheResult = this.cache.getOrCreate({
      personaId: input.personaId,
      sessionId: input.sessionId,
      immutableCore,
    });

    const sessionKey = makeSessionKey(input.personaId, input.sessionId);
    const previousState = this.previousStateBySession.get(sessionKey) ?? {};
    const normalizedState = normalizeState(input.runtimeState);
    const delta = stateDiff(previousState, normalizedState);

    const patchLines = delta.length > 0
      ? delta.map(([key, value]) => `${key}=${value}`)
      : ['state_unchanged=true'];

    const sessionDiff = trimToBudget(
      trimToBudget(patchLines.join('\n'), SESSION_MAX_BUDGET),
      SESSION_TARGET_BUDGET
    );

    this.previousStateBySession.set(sessionKey, normalizedState);

    const graph = this.getOrCreateGraph(input.personaId, input.aspects);
    const retrievalQuery = `${input.userMessage} ${input.recentHistory.join(' ')}`;
    const retrieval = graph.retrieveRelevant(retrievalQuery, { tokenBudget: CONTEXT_BUDGET, limit: 3 });

    const selectedAspects = retrieval.nodes;
    const contextualRetrieval = trimToBudget(
      buildContextualText(
        selectedAspects.map((node) => ({
          id: node.id,
          title: node.title,
          content: node.content,
          keywords: node.keywords,
          estimatedTokens: node.estimatedTokens,
        })),
        input.memoryHints ?? []
      ),
      CONTEXT_BUDGET
    );

    return {
      immutableCore,
      immutableCoreCacheId: cacheResult.entry.cacheId,
      coreCacheReused: cacheResult.reused,
      sessionDiff,
      contextualRetrieval,
      selectedAspectIds: selectedAspects.map((node) => node.id),
      estimatedTokens:
        toTokenEstimate(immutableCore) + toTokenEstimate(sessionDiff) + toTokenEstimate(contextualRetrieval),
      cprActive: selectedAspects.length > 0,
    };
  }

  resetSession(personaId: string, sessionId: string): void {
    this.previousStateBySession.delete(makeSessionKey(personaId, sessionId));
  }

  private getOrCreateGraph(personaId: string, aspects: ReadonlyArray<PersonaAspect>): PersonaGraphStore {
    const current = this.graphByPersona.get(personaId);
    if (current && current.getNodes().length === aspects.length) {
      return current;
    }

    const graph = PersonaGraphStore.fromAspects(aspects);
    this.graphByPersona.set(personaId, graph);
    return graph;
  }
}

export const differentialPersonaLoader = new DifferentialPersonaLoader();
