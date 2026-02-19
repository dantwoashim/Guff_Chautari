import type { Council } from '../council/types';
import type { AgreementMatrixCell, Argument, ConsensusScore } from './types';

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(2));
};

const round2 = (value: number): number => Number(value.toFixed(2));

const positionToSignal = (position: Argument['position']): number => {
  if (position === 'support') return 1;
  if (position === 'oppose') return -1;
  if (position === 'mixed') return 0.25;
  return 0;
};

const tokenize = (value: string): Set<string> => {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = normalized
    .split(' ')
    .filter((token) => token.length >= 4);
  return new Set(tokens);
};

const jaccard = (left: Set<string>, right: Set<string>): number => {
  if (left.size === 0 && right.size === 0) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set<string>([...left, ...right]).size;
  if (union === 0) return 0;
  return intersection / union;
};

const buildArgumentFingerprint = (argument: Argument): Set<string> => {
  const blob = `${argument.claim}\n${argument.supportingEvidence.join(' ')}`;
  return tokenize(blob);
};

const byMemberAndRound = (argumentsLog: ReadonlyArray<Argument>): Map<string, Map<number, Argument>> => {
  const map = new Map<string, Map<number, Argument>>();

  for (const argument of argumentsLog) {
    const memberMap = map.get(argument.memberId) ?? new Map<number, Argument>();
    if (!memberMap.has(argument.round)) {
      memberMap.set(argument.round, argument);
    }
    map.set(argument.memberId, memberMap);
  }

  return map;
};

const sharedRoundArguments = (left: Map<number, Argument>, right: Map<number, Argument>): Array<[Argument, Argument]> => {
  const pairs: Array<[Argument, Argument]> = [];
  for (const [round, leftArgument] of left.entries()) {
    const rightArgument = right.get(round);
    if (rightArgument) {
      pairs.push([leftArgument, rightArgument]);
    }
  }
  return pairs;
};

const computePairAlignment = (left: Argument, right: Argument): number => {
  const leftSignal = positionToSignal(left.position);
  const rightSignal = positionToSignal(right.position);
  const positionAlignment = 1 - Math.abs(leftSignal - rightSignal) / 2;
  const semanticAlignment = jaccard(buildArgumentFingerprint(left), buildArgumentFingerprint(right));
  return clamp01(positionAlignment * 0.7 + semanticAlignment * 0.3);
};

const computeAgreementMatrix = (
  council: Council,
  argumentsLog: ReadonlyArray<Argument>
): {
  matrix: AgreementMatrixCell[];
  rawAlignment: number;
  confidenceWeightedAlignment: number;
} => {
  const memberRoundMap = byMemberAndRound(argumentsLog);
  const matrix: AgreementMatrixCell[] = [];

  let rawAccumulator = 0;
  let rawCount = 0;
  let weightedAccumulator = 0;
  let weightedCount = 0;

  for (let leftIndex = 0; leftIndex < council.members.length; leftIndex += 1) {
    const leftMember = council.members[leftIndex];
    const leftRounds = memberRoundMap.get(leftMember.id) ?? new Map<number, Argument>();
    const leftAverageConfidence =
      leftRounds.size === 0
        ? 0
        : [...leftRounds.values()].reduce((acc, item) => acc + item.confidence, 0) / leftRounds.size;

    matrix.push({
      memberAId: leftMember.id,
      memberBId: leftMember.id,
      alignment: 1,
      averageConfidence: round2(leftAverageConfidence),
      roundsCompared: leftRounds.size,
    });

    for (let rightIndex = leftIndex + 1; rightIndex < council.members.length; rightIndex += 1) {
      const rightMember = council.members[rightIndex];
      const rightRounds = memberRoundMap.get(rightMember.id) ?? new Map<number, Argument>();
      const pairs = sharedRoundArguments(leftRounds, rightRounds);

      if (pairs.length === 0) {
        matrix.push({
          memberAId: leftMember.id,
          memberBId: rightMember.id,
          alignment: 0,
          averageConfidence: 0,
          roundsCompared: 0,
        });
        continue;
      }

      let pairAlignmentAccumulator = 0;
      let pairConfidenceAccumulator = 0;
      for (const [leftArgument, rightArgument] of pairs) {
        const alignment = computePairAlignment(leftArgument, rightArgument);
        const confidenceWeight = (leftArgument.confidence + rightArgument.confidence) / 2;
        pairAlignmentAccumulator += alignment;
        pairConfidenceAccumulator += confidenceWeight;
      }

      const pairRawAlignment = pairAlignmentAccumulator / pairs.length;
      const pairAverageConfidence = pairConfidenceAccumulator / pairs.length;
      matrix.push({
        memberAId: leftMember.id,
        memberBId: rightMember.id,
        alignment: round2(pairRawAlignment),
        averageConfidence: round2(pairAverageConfidence),
        roundsCompared: pairs.length,
      });

      rawAccumulator += pairRawAlignment;
      rawCount += 1;
      weightedAccumulator += pairRawAlignment * pairAverageConfidence;
      weightedCount += pairAverageConfidence;
    }
  }

  return {
    matrix,
    rawAlignment: rawCount > 0 ? round2(rawAccumulator / rawCount) : 0,
    confidenceWeightedAlignment:
      weightedCount > 0 ? round2(weightedAccumulator / weightedCount) : 0,
  };
};

const normalizeEvidence = (evidence: string): string => {
  return evidence
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const deriveConvergenceZones = (council: Council, argumentsLog: ReadonlyArray<Argument>): string[] => {
  const threshold = Math.max(2, Math.ceil(council.members.length * 0.6));
  const supporters = argumentsLog.filter(
    (argument) => argument.confidence >= 0.55 && argument.position !== 'oppose'
  );
  const byEvidence = new Map<string, Set<string>>();

  for (const argument of supporters) {
    const uniqueEvidence = new Set(argument.supportingEvidence.map(normalizeEvidence).filter((item) => item.length > 0));
    for (const evidence of uniqueEvidence) {
      const members = byEvidence.get(evidence) ?? new Set<string>();
      members.add(argument.memberId);
      byEvidence.set(evidence, members);
    }
  }

  return [...byEvidence.entries()]
    .filter(([, members]) => members.size >= threshold)
    .sort((left, right) => right[1].size - left[1].size)
    .map(([evidence]) => evidence)
    .slice(0, 5);
};

const deriveUnresolvedTensions = (argumentsLog: ReadonlyArray<Argument>): string[] => {
  const support = argumentsLog.filter((argument) => argument.position === 'support' && argument.confidence >= 0.6);
  const oppose = argumentsLog.filter((argument) => argument.position === 'oppose' && argument.confidence >= 0.6);

  const tensions: string[] = [];
  if (support.length > 0 && oppose.length > 0) {
    tensions.push(
      `High-confidence split remains (${support.length} support vs ${oppose.length} oppose).`
    );
  }

  const supportEvidence = new Set(
    support.flatMap((argument) => argument.supportingEvidence.map(normalizeEvidence))
  );
  const opposeEvidence = new Set(
    oppose.flatMap((argument) => argument.supportingEvidence.map(normalizeEvidence))
  );

  for (const evidence of supportEvidence) {
    if (evidence.length > 0 && opposeEvidence.has(evidence)) {
      tensions.push(`Both camps cite "${evidence}", but interpret it differently.`);
    }
  }

  return tensions.slice(0, 5);
};

export const scoreBoardroomConsensus = (input: {
  sessionId: string;
  council: Council;
  arguments: ReadonlyArray<Argument>;
  nowIso?: string;
}): ConsensusScore => {
  if (input.arguments.length === 0) {
    throw new Error('Cannot score boardroom consensus without arguments.');
  }

  const { matrix, rawAlignment, confidenceWeightedAlignment } = computeAgreementMatrix(
    input.council,
    input.arguments
  );

  return {
    sessionId: input.sessionId,
    councilId: input.council.id,
    rawAlignment,
    score: confidenceWeightedAlignment,
    agreementMatrix: matrix,
    convergenceZones: deriveConvergenceZones(input.council, input.arguments),
    unresolvedTensions: deriveUnresolvedTensions(input.arguments),
    scoredAtIso: input.nowIso ?? new Date().toISOString(),
  };
};
