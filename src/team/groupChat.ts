import type { Persona } from '../../types';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);

const normalizeSentence = (value: string): string => value.replace(/\s+/g, ' ').trim();

const extractQuestionFocus = (question: string): string => {
  const trimmed = normalizeSentence(question);
  if (!trimmed) return 'the topic';

  const short = trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
  return short;
};

const styleAnchor = (persona: Persona): string => {
  const description = normalizeSentence(persona.description || '');
  const instruction = normalizeSentence(persona.system_instruction || '');
  const base = description || instruction || `${persona.name} perspective`;
  return base.length > 120 ? `${base.slice(0, 117)}...` : base;
};

const hashString = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
};

const choose = <T,>(list: readonly T[], seed: string): T => {
  const index = hashString(seed) % list.length;
  return list[index];
};

const openingPhrases = [
  'My take:',
  'From my angle:',
  'I would frame it this way:',
  'One practical view:',
  'Here is my perspective:',
] as const;

const bridgePhrases = [
  'Building on',
  'I agree partly with',
  'Adding to',
  'A counterpoint to',
  'Complementing',
] as const;

const actionPhrases = [
  'prioritize a small experiment with measurable outcomes',
  'clarify ownership and timelines before execution',
  'reduce scope first, then iterate based on evidence',
  'capture risks explicitly and assign mitigation owners',
  'ship a narrow first version and monitor signal quality',
] as const;

const coherenceScore = (question: string, turns: ReadonlyArray<GroupChatTurn>): number => {
  const questionTokens = new Set(tokenize(question));
  if (questionTokens.size === 0 || turns.length === 0) return 0;

  const overlaps = turns.map((turn) => {
    const turnTokens = new Set(tokenize(turn.text));
    let shared = 0;
    for (const token of questionTokens) {
      if (turnTokens.has(token)) shared += 1;
    }
    return shared / questionTokens.size;
  });

  const average = overlaps.reduce((sum, value) => sum + value, 0) / overlaps.length;
  return Number(clamp(average, 0, 1).toFixed(4));
};

export interface GroupChatTurn {
  id: string;
  personaId: string;
  personaName: string;
  round: number;
  text: string;
  createdAtIso: string;
}

export interface GroupChatSession {
  id: string;
  question: string;
  createdByUserId?: string;
  workspaceId?: string;
  personas: Array<{
    id: string;
    name: string;
    anchor: string;
  }>;
  rounds: number;
  turns: GroupChatTurn[];
  generatedAtIso: string;
  coherenceScore: number;
  summary: string;
}

const buildPersonaTurn = (payload: {
  persona: Persona;
  question: string;
  round: number;
  previousTurn?: GroupChatTurn;
}): string => {
  const focus = extractQuestionFocus(payload.question);
  const anchor = styleAnchor(payload.persona);
  const opening = choose(openingPhrases, `${payload.persona.id}-opening-${payload.round}`);
  const action = choose(actionPhrases, `${payload.persona.id}-action-${payload.round}`);

  const bridge = payload.previousTurn
    ? `${choose(bridgePhrases, `${payload.persona.id}-bridge-${payload.round}`)} ${
        payload.previousTurn.personaName
      }, `
    : '';

  return normalizeSentence(
    `${opening} ${bridge}on "${focus}", ${payload.persona.name} (style: ${anchor}) would ${action}.`
  );
};

const summarizeSession = (question: string, turns: ReadonlyArray<GroupChatTurn>): string => {
  if (turns.length === 0) {
    return `No persona responses were generated for "${question}".`;
  }
  const participants = [...new Set(turns.map((turn) => turn.personaName))].join(', ');
  return `Group chat covered "${extractQuestionFocus(
    question
  )}" with ${turns.length} response(s) from ${participants}.`;
};

export const runPersonaGroupChat = (payload: {
  question: string;
  personas: ReadonlyArray<Persona>;
  createdByUserId?: string;
  workspaceId?: string;
  rounds?: number;
  nowIso?: string;
}): GroupChatSession => {
  const question = normalizeSentence(payload.question);
  if (!question) {
    throw new Error('Group chat question is required.');
  }
  if (payload.personas.length === 0) {
    throw new Error('At least one persona is required for group chat.');
  }

  const rounds = clamp(Math.floor(payload.rounds ?? 1), 1, 4);
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const turns: GroupChatTurn[] = [];

  for (let round = 1; round <= rounds; round += 1) {
    for (const persona of payload.personas) {
      const text = buildPersonaTurn({
        persona,
        question,
        round,
        previousTurn: turns[turns.length - 1],
      });
      turns.push({
        id: makeId('group-chat-turn'),
        personaId: persona.id,
        personaName: persona.name,
        round,
        text,
        createdAtIso: nowIso,
      });
    }
  }

  const score = coherenceScore(question, turns);

  return {
    id: makeId('group-chat-session'),
    question,
    createdByUserId: payload.createdByUserId,
    workspaceId: payload.workspaceId,
    personas: payload.personas.map((persona) => ({
      id: persona.id,
      name: persona.name,
      anchor: styleAnchor(persona),
    })),
    rounds,
    turns,
    generatedAtIso: nowIso,
    coherenceScore: score,
    summary: summarizeSession(question, turns),
  };
};

