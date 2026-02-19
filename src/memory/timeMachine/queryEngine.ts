import type {
  TemporalMemoryIndex,
  TemporalQueryAnswer,
  TemporalQueryMatch,
  TimelineEvent,
  TimelineLane,
} from './types';

interface QueryInput {
  query: string;
  index: TemporalMemoryIndex;
  nowIso?: string;
  maxMatches?: number;
}

const toMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const toMatch = (event: TimelineEvent): TemporalQueryMatch => ({
  eventId: event.id,
  lane: event.lane,
  occurredAtIso: event.occurredAtIso,
  title: event.title,
  summary: event.summary,
  topic: event.topic,
});

const matchesTopic = (event: TimelineEvent, topic: string): boolean => {
  if (!topic) return true;
  const normalizedTopic = normalize(topic);
  if (!normalizedTopic) return true;
  const haystack = normalize(`${event.topic} ${event.title} ${event.summary}`);
  return haystack.includes(normalizedTopic);
};

const extractTopic = (query: string): string => {
  const lowered = normalize(query);

  const caringMatch = lowered.match(/start caring about\s+([a-z0-9\s-]{2,80})/i);
  if (caringMatch?.[1]) return caringMatch[1].trim();

  const changedMindMatch = lowered.match(/changed my mind about\s+([a-z0-9\s-]{2,80})/i);
  if (changedMindMatch?.[1]) return changedMindMatch[1].trim();

  const aboutMatch = lowered.match(/about\s+([a-z0-9\s-]{2,80})/i);
  if (aboutMatch?.[1]) return aboutMatch[1].trim();

  return '';
};

const formatDate = (iso: string): string => {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const lanePriority: Record<TimelineLane, number> = {
  beliefs: 1,
  goals: 2,
  emotion: 3,
  knowledge: 4,
  decisions: 5,
};

const sortByRelevance = (events: ReadonlyArray<TimelineEvent>, topic: string): TimelineEvent[] => {
  const normalizedTopic = normalize(topic);
  return [...events].sort((left, right) => {
    const leftLaneScore = lanePriority[left.lane];
    const rightLaneScore = lanePriority[right.lane];

    const leftTopicBoost = normalize(`${left.topic} ${left.title}`).includes(normalizedTopic) ? 1 : 0;
    const rightTopicBoost = normalize(`${right.topic} ${right.title}`).includes(normalizedTopic) ? 1 : 0;

    if (rightTopicBoost !== leftTopicBoost) return rightTopicBoost - leftTopicBoost;
    if (leftLaneScore !== rightLaneScore) return leftLaneScore - rightLaneScore;
    return toMs(left.occurredAtIso) - toMs(right.occurredAtIso);
  });
};

const answerBeliefOrigin = (
  query: string,
  topic: string,
  index: TemporalMemoryIndex,
  maxMatches: number,
  generatedAtIso: string
): TemporalQueryAnswer => {
  const candidates = index.events
    .filter((event) => event.lane === 'beliefs' || event.lane === 'knowledge')
    .filter((event) => matchesTopic(event, topic))
    .sort((left, right) => toMs(left.occurredAtIso) - toMs(right.occurredAtIso));

  if (candidates.length === 0) {
    return {
      query,
      intent: 'belief_origin',
      answer: topic
        ? `No clear belief origin found for "${topic}" in the current timeline index.`
        : 'No clear belief origin found in the current timeline index.',
      generatedAtIso,
      matches: [],
    };
  }

  const origin = candidates[0];
  const matches = candidates.slice(0, maxMatches).map(toMatch);

  return {
    query,
    intent: 'belief_origin',
    answer: `Earliest signal was on ${formatDate(origin.occurredAtIso)} via ${origin.title.toLowerCase()}. ${origin.summary}`,
    generatedAtIso,
    matches,
  };
};

const answerBeliefChange = (
  query: string,
  topic: string,
  index: TemporalMemoryIndex,
  maxMatches: number,
  generatedAtIso: string
): TemporalQueryAnswer => {
  const candidates = index.beliefChanges
    .filter((change) => (topic ? normalize(change.topic).includes(normalize(topic)) : true))
    .sort((left, right) => toMs(left.changedAtIso) - toMs(right.changedAtIso));

  if (candidates.length === 0) {
    return {
      query,
      intent: 'belief_change',
      answer: topic
        ? `No belief shift was detected yet for "${topic}".`
        : 'No belief shifts were detected yet in the indexed data.',
      generatedAtIso,
      matches: [],
    };
  }

  const latest = candidates[candidates.length - 1];
  const supportingEvents = index.events
    .filter((event) => matchesTopic(event, latest.topic))
    .sort((left, right) => toMs(right.occurredAtIso) - toMs(left.occurredAtIso))
    .slice(0, maxMatches)
    .map(toMatch);

  return {
    query,
    intent: 'belief_change',
    answer: `Belief changed on ${formatDate(latest.changedAtIso)} from "${latest.oldStance}" to "${latest.newStance}" (confidence ${Math.round(latest.confidence * 100)}%).`,
    generatedAtIso,
    matches: supportingEvents,
  };
};

const answerGoalEvolution = (
  query: string,
  topic: string,
  index: TemporalMemoryIndex,
  maxMatches: number,
  generatedAtIso: string
): TemporalQueryAnswer => {
  const nowMs = toMs(generatedAtIso);
  const quarterStart = new Date(generatedAtIso);
  const quarterMonth = Math.floor(quarterStart.getMonth() / 3) * 3;
  quarterStart.setMonth(quarterMonth, 1);
  quarterStart.setHours(0, 0, 0, 0);
  const quarterStartMs = quarterStart.getTime();

  const thisQuarterOnly = normalize(query).includes('this quarter');

  const goals = index.goalEvolutions
    .filter((goal) => (topic ? normalize(goal.title).includes(normalize(topic)) : true))
    .map((goal) => ({
      ...goal,
      history: thisQuarterOnly
        ? goal.history.filter((stage) => toMs(stage.atIso) >= quarterStartMs && toMs(stage.atIso) <= nowMs)
        : goal.history,
    }))
    .filter((goal) => goal.history.length > 0);

  if (goals.length === 0) {
    return {
      query,
      intent: 'goal_evolution',
      answer: 'No goal evolution history was found for the requested scope.',
      generatedAtIso,
      matches: [],
    };
  }

  const selectedGoal = goals.sort((left, right) => toMs(right.updatedAtIso) - toMs(left.updatedAtIso))[0];
  const historyLine = selectedGoal.history
    .map((stage) => `${stage.status} (${formatDate(stage.atIso)})`)
    .join(' -> ');

  const relatedEvents = sortByRelevance(
    index.events.filter((event) => event.lane === 'goals' && matchesTopic(event, selectedGoal.title)),
    selectedGoal.title
  )
    .slice(0, maxMatches)
    .map(toMatch);

  return {
    query,
    intent: 'goal_evolution',
    answer: `${selectedGoal.title}: ${historyLine}. Current status is ${selectedGoal.currentStatus}.`,
    generatedAtIso,
    matches: relatedEvents,
  };
};

const summarizeTimeline = (
  query: string,
  index: TemporalMemoryIndex,
  maxMatches: number,
  generatedAtIso: string
): TemporalQueryAnswer => {
  const latest = [...index.events]
    .sort((left, right) => toMs(right.occurredAtIso) - toMs(left.occurredAtIso))
    .slice(0, maxMatches);

  if (latest.length === 0) {
    return {
      query,
      intent: 'summary',
      answer: 'Timeline index has no events yet.',
      generatedAtIso,
      matches: [],
    };
  }

  const lanes = new Set(latest.map((event) => event.lane));
  return {
    query,
    intent: 'summary',
    answer: `Recent timeline shows ${latest.length} event(s) across ${lanes.size} lane(s): ${Array.from(lanes).join(', ')}.`,
    generatedAtIso,
    matches: latest.map(toMatch),
  };
};

export const answerTemporalQuery = (payload: QueryInput): TemporalQueryAnswer => {
  const query = payload.query.trim();
  if (!query) {
    return {
      query: payload.query,
      intent: 'summary',
      answer: 'Please provide a time-machine question.',
      generatedAtIso: payload.nowIso ?? new Date().toISOString(),
      matches: [],
    };
  }

  const generatedAtIso = payload.nowIso ?? new Date().toISOString();
  const maxMatches = Math.max(1, Math.min(20, payload.maxMatches ?? 5));
  const normalizedQuery = normalize(query);
  const topic = extractTopic(query);

  if (/when\s+did\s+i\s+start\s+caring/.test(normalizedQuery) || /when\s+did\s+i\s+start/.test(normalizedQuery)) {
    return answerBeliefOrigin(query, topic, payload.index, maxMatches, generatedAtIso);
  }

  if (/what\s+changed\s+my\s+mind/.test(normalizedQuery)) {
    return answerBeliefChange(query, topic, payload.index, maxMatches, generatedAtIso);
  }

  if (/goal\s+evolution/.test(normalizedQuery) || /show\s+me\s+my\s+goals/.test(normalizedQuery)) {
    return answerGoalEvolution(query, topic, payload.index, maxMatches, generatedAtIso);
  }

  return summarizeTimeline(query, payload.index, maxMatches, generatedAtIso);
};
