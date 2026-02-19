import { createPipelineOrchestrator } from '@ashim/engine';
import type { Council, CouncilMember } from '../council/types';
import type {
  Argument,
  BoardroomSession,
  DebateOrchestrationResult,
  DebateOrchestratorInput,
  DebatePipelineRequest,
  DebatePipelineResponse,
  DebatePipelineRunner,
  DebatePosition,
  StructuredArgumentPayload,
  TurnRecord,
} from './types';

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(2));
};

const parseConfidenceFromText = (text: string): number | null => {
  const match = text.match(/confidence[:\s]+([01](?:\.\d+)?)/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? clamp01(parsed) : null;
};

const normalizePosition = (value: unknown): DebatePosition => {
  if (typeof value !== 'string') return 'neutral';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'support') return 'support';
  if (normalized === 'oppose') return 'oppose';
  if (normalized === 'mixed') return 'mixed';
  if (normalized === 'neutral') return 'neutral';
  if (normalized.includes('support') || normalized.includes('favor')) return 'support';
  if (normalized.includes('oppose') || normalized.includes('against') || normalized.includes('reject')) {
    return 'oppose';
  }
  if (normalized.includes('mixed') || normalized.includes('both')) return 'mixed';
  return 'neutral';
};

const inferPositionFromText = (text: string): DebatePosition => {
  return normalizePosition(text);
};

const extractJsonPayload = (text: string): Record<string, unknown> | null => {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    try {
      const parsed = JSON.parse(fencedMatch[1]);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      // Continue to broader extraction path.
    }
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;

  const candidate = text.slice(firstBrace, lastBrace + 1);
  try {
    const parsed = JSON.parse(candidate);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  return null;
};

const toEvidenceList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim())
      .slice(0, 5);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value
      .split(/[\n;]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, 5);
  }

  return [];
};

const splitSentences = (text: string): string[] => {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
};

const extractEvidenceFromFreeformText = (text: string): string[] => {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const bulletEvidence = lines
    .filter((line) => /^[-*•]|\d+\./.test(line))
    .map((line) => line.replace(/^[-*•]\s*|\d+\.\s*/, '').trim())
    .filter((line) => line.length > 0);
  if (bulletEvidence.length > 0) {
    return bulletEvidence.slice(0, 5);
  }

  const candidates = splitSentences(text).filter((sentence) =>
    /(because|data|metric|evidence|constraint|risk|signal)/i.test(sentence)
  );
  if (candidates.length > 0) {
    return candidates.slice(0, 5);
  }

  const fallback = splitSentences(text).slice(1, 4);
  return fallback.length > 0 ? fallback : ['No explicit evidence provided.'];
};

const extractClaim = (text: string): string => {
  const firstSentence = splitSentences(text)[0];
  if (firstSentence) return firstSentence.slice(0, 280);
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length > 0) return compact.slice(0, 280);
  return 'No claim provided.';
};

const parseStructuredArgument = (text: string): StructuredArgumentPayload => {
  const payload = extractJsonPayload(text);
  if (payload) {
    const claimValue = typeof payload.claim === 'string' ? payload.claim.trim() : '';
    const evidence = toEvidenceList(payload.evidence);
    const confidenceCandidate = Number(payload.confidence);
    const confidence = Number.isFinite(confidenceCandidate)
      ? clamp01(confidenceCandidate)
      : parseConfidenceFromText(text) ?? 0.55;

    return {
      position: normalizePosition(payload.position),
      claim: claimValue.length > 0 ? claimValue : extractClaim(text),
      evidence: evidence.length > 0 ? evidence : extractEvidenceFromFreeformText(text),
      confidence,
      counterArgumentToId:
        typeof payload.counterArgumentToId === 'string' && payload.counterArgumentToId.trim().length > 0
          ? payload.counterArgumentToId.trim()
          : undefined,
    };
  }

  return {
    position: inferPositionFromText(text),
    claim: extractClaim(text),
    evidence: extractEvidenceFromFreeformText(text),
    confidence: parseConfidenceFromText(text) ?? 0.55,
  };
};

const estimateTokenCount = (text: string): number => {
  const words = text.trim().split(/\s+/).filter((word) => word.length > 0);
  return words.length;
};

const enforceTokenLimit = (text: string, tokenLimit: number): string => {
  if (!Number.isFinite(tokenLimit) || tokenLimit <= 0) return text;
  const words = text.trim().split(/\s+/).filter((word) => word.length > 0);
  if (words.length <= tokenLimit) return text.trim();
  return words.slice(0, tokenLimit).join(' ');
};

class TurnTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TurnTimeoutError';
  }
}

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;

  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TurnTimeoutError(`Boardroom turn exceeded timeout (${timeoutMs}ms).`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
};

const buildTurnPrompt = (params: {
  session: BoardroomSession;
  council: Council;
  member: CouncilMember;
  round: number;
  turnIndex: number;
  priorArguments: ReadonlyArray<Argument>;
}): string => {
  const recentArguments =
    params.priorArguments.length === 0
      ? 'No prior arguments yet.'
      : params.priorArguments
          .slice(-8)
          .map(
            (argument) =>
              `- [${argument.id}] ${argument.memberName} (${argument.position}, confidence ${argument.confidence.toFixed(
                2
              )}): ${argument.claim}`
          )
          .join('\n');

  const roleHint = params.member.roleHint ? `Role hint: ${params.member.roleHint}` : 'Role hint: Council member';
  const systemHint = params.member.systemInstruction
    ? `Persona instruction: ${params.member.systemInstruction}`
    : 'Persona instruction: Be concise, evidence-backed, and practical.';

  return [
    `Boardroom session ${params.session.id}`,
    `Council: ${params.council.name}`,
    `Framing prompt: ${params.session.framingPrompt}`,
    `Current round: ${params.round}`,
    `Turn index: ${params.turnIndex}`,
    `Speaker: ${params.member.name} (persona ${params.member.personaId})`,
    roleHint,
    systemHint,
    'Prior arguments:',
    recentArguments,
    'Return a single JSON object with keys:',
    '{"position":"support|oppose|neutral|mixed","claim":"string","evidence":["string"],"confidence":0.0,"counterArgumentToId":"optional_argument_id"}',
    'Do not include markdown. Keep confidence between 0 and 1.',
  ].join('\n');
};

const selectSpeakerForTurn = (params: {
  council: Council;
  mode: BoardroomSession['mode'];
  turnIndex: number;
  moderatorSequence?: ReadonlyArray<string>;
}): CouncilMember => {
  const memberCount = params.council.members.length;
  const roundRobinMember = params.council.members[params.turnIndex % memberCount];

  if (params.mode !== 'moderator_directed') {
    return roundRobinMember;
  }

  const moderatorMemberId = params.moderatorSequence?.[params.turnIndex];
  if (!moderatorMemberId) return roundRobinMember;

  return params.council.members.find((member) => member.id === moderatorMemberId) ?? roundRobinMember;
};

const createDefaultPipelineRunner = (): DebatePipelineRunner => {
  const orchestrator = createPipelineOrchestrator();

  return async (request: DebatePipelineRequest): Promise<DebatePipelineResponse> => {
    const timestamp = Date.now();
    const result = await orchestrator.run(
      {
        threadId: `boardroom-${request.session.id}`,
        userId: request.session.userId,
        personaId: request.member.personaId,
        userMessage: {
          id: `boardroom-msg-${request.session.id}-${request.turnIndex}`,
          role: 'user',
          text: request.prompt,
          timestamp,
        },
        timestamp,
        provider: request.provider,
        model: request.model,
        apiKey: request.apiKey,
        temperature: 0.3,
        persona: {
          id: request.member.personaId,
          name: request.member.name,
          systemInstruction:
            request.member.systemInstruction ??
            `You are ${request.member.name}. ${request.member.roleHint ?? 'Act as a council member.'}`,
        },
      },
      {
        maxRetries: 1,
        retryDelayMs: 120,
      }
    );

    return {
      text: result.llm.text,
      providerId: result.llm.providerId,
      model: result.llm.model,
    };
  };
};

const validateInput = (input: DebateOrchestratorInput): void => {
  if (input.council.id !== input.session.councilId) {
    throw new Error('Boardroom session councilId must match the selected council.');
  }
  if (input.session.roundCount <= 0) {
    throw new Error('Boardroom session roundCount must be greater than 0.');
  }
  if (input.council.members.length < 3 || input.council.members.length > 7) {
    throw new Error('Boardroom debates require councils with 3 to 7 members.');
  }
};

const buildFallbackPayload = (error: unknown): StructuredArgumentPayload => {
  const message = error instanceof Error ? error.message : 'Unknown failure';
  return {
    position: 'neutral',
    claim: 'Turn failed to produce a usable structured argument.',
    evidence: [message],
    confidence: 0.05,
  };
};

const resolveCounterArgumentReference = (
  parsed: StructuredArgumentPayload,
  priorArguments: ReadonlyArray<Argument>
): string | undefined => {
  if (parsed.counterArgumentToId) {
    const exists = priorArguments.some((argument) => argument.id === parsed.counterArgumentToId);
    if (exists) return parsed.counterArgumentToId;
  }

  if (parsed.position !== 'oppose' && parsed.position !== 'mixed') {
    return undefined;
  }

  const latestDifferentPosition = [...priorArguments]
    .reverse()
    .find((argument) => argument.position !== parsed.position && argument.position !== 'neutral');
  return latestDifferentPosition?.id;
};

export const runBoardroomDebate = async (
  input: DebateOrchestratorInput
): Promise<DebateOrchestrationResult> => {
  validateInput(input);

  const startedAt = Date.now();
  const runner = input.pipelineRunner ?? createDefaultPipelineRunner();
  const turnRecords: TurnRecord[] = [];
  const argumentsLog: Argument[] = [];
  const totalTurns = input.session.roundCount * input.council.members.length;

  for (let turnIndex = 0; turnIndex < totalTurns; turnIndex += 1) {
    const round = Math.floor(turnIndex / input.council.members.length) + 1;
    const member = selectSpeakerForTurn({
      council: input.council,
      mode: input.session.mode,
      turnIndex,
      moderatorSequence: input.moderatorSequence,
    });
    const prompt = buildTurnPrompt({
      session: input.session,
      council: input.council,
      member,
      round,
      turnIndex,
      priorArguments: argumentsLog,
    });

    const startedTurnAtMs = Date.now();
    const startedTurnAtIso = new Date(startedTurnAtMs).toISOString();
    let parsedArgument: StructuredArgumentPayload | null = null;
    let rawResponse = '';
    let status: TurnRecord['status'] = 'completed';

    try {
      const response = await withTimeout(
        runner({
          session: input.session,
          council: input.council,
          member,
          round,
          turnIndex,
          prompt,
          priorArguments: argumentsLog,
          tokenLimit: input.session.limits.maxTokensPerTurn,
          timeLimitMs: input.session.limits.maxDurationMsPerTurn,
          provider: input.provider,
          model: input.model,
          apiKey: input.apiKey,
        }),
        input.session.limits.maxDurationMsPerTurn
      );
      rawResponse = enforceTokenLimit(response.text ?? '', input.session.limits.maxTokensPerTurn);
      parsedArgument = parseStructuredArgument(rawResponse);
    } catch (error) {
      parsedArgument = buildFallbackPayload(error);
      rawResponse = parsedArgument.claim;
      status = error instanceof TurnTimeoutError ? 'timed_out' : 'failed';
    }

    const endedTurnAtMs = Date.now();
    const endedTurnAtIso = new Date(endedTurnAtMs).toISOString();
    const counterArgumentToId = resolveCounterArgumentReference(parsedArgument, argumentsLog);
    const argumentId = makeId('argument');
    const tokensUsed = estimateTokenCount(rawResponse);

    const argument: Argument = {
      id: argumentId,
      sessionId: input.session.id,
      councilId: input.session.councilId,
      memberId: member.id,
      memberName: member.name,
      round,
      turnIndex,
      position: parsedArgument.position,
      claim: parsedArgument.claim,
      supportingEvidence: parsedArgument.evidence,
      confidence: clamp01(parsedArgument.confidence),
      counterArgumentToId,
      prompt,
      rawResponse,
      createdAtIso: endedTurnAtIso,
    };

    argumentsLog.push(argument);

    turnRecords.push({
      id: makeId('turn'),
      sessionId: input.session.id,
      round,
      turnIndex,
      memberId: member.id,
      memberName: member.name,
      roleHint: member.roleHint,
      prompt,
      position: argument.position,
      evidence: argument.supportingEvidence,
      confidence: argument.confidence,
      argumentId,
      tokenLimit: input.session.limits.maxTokensPerTurn,
      timeLimitMs: input.session.limits.maxDurationMsPerTurn,
      tokensUsed,
      startedAtIso: startedTurnAtIso,
      completedAtIso: endedTurnAtIso,
      durationMs: endedTurnAtMs - startedTurnAtMs,
      status,
    });
  }

  return {
    session: input.session,
    turnRecords,
    arguments: argumentsLog,
    durationMs: Date.now() - startedAt,
  };
};
