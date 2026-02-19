import type { Workflow, WorkflowPlanInput, WorkflowStep, WorkflowTrigger } from './types';
import { buildLinearPlanGraph } from './planGraph';
import { withWorkflowPolicy } from './workflowPolicy';

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const normalizeName = (prompt: string): string => {
  const trimmed = prompt.trim();
  if (!trimmed) return 'Untitled Workflow';
  const compact = trimmed.replace(/\s+/g, ' ');
  return compact.length > 48 ? `${compact.slice(0, 45)}...` : compact;
};

const nextMorningIso = (now: Date): string => {
  const target = new Date(now.getTime());
  target.setHours(9, 0, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.toISOString();
};

const inferTrigger = (prompt: string, now: Date): WorkflowTrigger => {
  const lowered = prompt.toLowerCase();

  if (/every morning|daily|every day/.test(lowered)) {
    return {
      id: makeId('trigger'),
      type: 'schedule',
      enabled: true,
      schedule: {
        intervalMinutes: 24 * 60,
        nextRunAtIso: nextMorningIso(now),
        cronLike: 'DAILY@09:00',
      },
    };
  }

  if (/every hour|hourly/.test(lowered)) {
    return {
      id: makeId('trigger'),
      type: 'schedule',
      enabled: true,
      schedule: {
        intervalMinutes: 60,
        nextRunAtIso: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
        cronLike: 'HOURLY',
      },
    };
  }

  const keywordMatch = lowered.match(/keyword[:\s]+([a-z0-9_-]+)/i);
  if (/when.*message/.test(lowered) || keywordMatch) {
    return {
      id: makeId('trigger'),
      type: 'event',
      enabled: true,
      event: {
        eventType: keywordMatch ? 'keyword_match' : 'new_message',
        keyword: keywordMatch?.[1],
      },
    };
  }

  return {
    id: makeId('trigger'),
    type: 'manual',
    enabled: true,
  };
};

const buildEmailSteps = (): WorkflowStep[] => [
  {
    id: makeId('step'),
    title: 'Fetch inbox',
    description: 'Read the latest email messages from IMAP.',
    kind: 'connector',
    actionId: 'connector.email.fetch_inbox',
    inputTemplate: '{"limit": 10}',
    status: 'idle',
  },
  {
    id: makeId('step'),
    title: 'Summarize emails',
    description: 'Aggregate key points and action items.',
    kind: 'transform',
    actionId: 'transform.summarize',
    status: 'idle',
  },
  {
    id: makeId('step'),
    title: 'Publish inbox artifact',
    description: 'Create an inbox artifact with summary output.',
    kind: 'artifact',
    actionId: 'artifact.publish',
    status: 'idle',
  },
];

const buildKnowledgeContextStep = (query: string): WorkflowStep => ({
  id: makeId('step'),
  title: 'Query knowledge context',
  description: 'Retrieve relevant notes and prior artifacts before execution.',
  kind: 'transform',
  actionId: 'transform.collect_context',
  inputTemplate: JSON.stringify({
    query,
    topK: 4,
  }),
  status: 'idle',
});

const buildNotionSteps = (): WorkflowStep[] => [
  {
    id: makeId('step'),
    title: 'List Notion pages',
    description: 'Read available pages from Notion workspace.',
    kind: 'connector',
    actionId: 'connector.notion.list_pages',
    status: 'idle',
  },
  {
    id: makeId('step'),
    title: 'Extract key points',
    description: 'Summarize notable updates from the pages.',
    kind: 'transform',
    actionId: 'transform.summarize',
    status: 'idle',
  },
  {
    id: makeId('step'),
    title: 'Publish workspace digest',
    description: 'Publish summary as an inbox artifact.',
    kind: 'artifact',
    actionId: 'artifact.publish',
    status: 'idle',
  },
];

const buildCalendarSteps = (): WorkflowStep[] => [
  {
    id: makeId('step'),
    title: 'List calendar events',
    description: 'Load upcoming events from connected calendar.',
    kind: 'connector',
    actionId: 'connector.calendar.list_events',
    inputTemplate: '{"limit": 10}',
    status: 'idle',
  },
  {
    id: makeId('step'),
    title: 'Summarize calendar priorities',
    description: 'Summarize event cadence and notable conflicts.',
    kind: 'transform',
    actionId: 'transform.summarize',
    status: 'idle',
  },
  {
    id: makeId('step'),
    title: 'Publish schedule briefing',
    description: 'Publish calendar summary artifact.',
    kind: 'artifact',
    actionId: 'artifact.publish',
    status: 'idle',
  },
];

const buildGDocsSteps = (): WorkflowStep[] => [
  {
    id: makeId('step'),
    title: 'List Google Docs',
    description: 'Load available Google documents.',
    kind: 'connector',
    actionId: 'connector.gdocs.list_documents',
    inputTemplate: '{"limit": 10}',
    status: 'idle',
  },
  {
    id: makeId('step'),
    title: 'Extract document highlights',
    description: 'Generate concise highlights from loaded document metadata/content.',
    kind: 'transform',
    actionId: 'transform.summarize',
    status: 'idle',
  },
  {
    id: makeId('step'),
    title: 'Publish document digest',
    description: 'Publish synthesis as an inbox artifact.',
    kind: 'artifact',
    actionId: 'artifact.publish',
    status: 'idle',
  },
];

const buildGenericSteps = (): WorkflowStep[] => [
  {
    id: makeId('step'),
    title: 'Collect source data',
    description: 'Gather context required for this workflow.',
    kind: 'transform',
    actionId: 'transform.collect_context',
    status: 'idle',
  },
  {
    id: makeId('step'),
    title: 'Generate synthesis',
    description: 'Synthesize concise recommendations.',
    kind: 'transform',
    actionId: 'transform.summarize',
    status: 'idle',
  },
  {
    id: makeId('step'),
    title: 'Publish artifact',
    description: 'Store output as an inbox artifact.',
    kind: 'artifact',
    actionId: 'artifact.publish',
    status: 'idle',
  },
];

const inferKnowledgeContextQuery = (prompt: string): string | null => {
  const trimmed = prompt.trim();
  if (!trimmed) return null;

  const lowered = trimmed.toLowerCase();
  const hasKnowledgeIntent = /(knowledge|context|note|notes|memory|memories)/.test(lowered);
  if (!hasKnowledgeIntent) return null;

  const explicitTopicMatch = lowered.match(
    /(?:notes?|knowledge|context|memories?)\s+(?:on|about|for)\s+([^,.!?]+)/i
  );
  if (explicitTopicMatch?.[1]) {
    return explicitTopicMatch[1].trim();
  }

  const beforeClauseMatch = lowered.match(/before\s+(?:sending|writing|drafting)\s+([^,.!?]+)/i);
  if (beforeClauseMatch?.[1]) {
    return `${trimmed} | focus=${beforeClauseMatch[1].trim()}`;
  }

  return trimmed;
};

const inferSteps = (prompt: string): WorkflowStep[] => {
  const lowered = prompt.toLowerCase();
  const knowledgeQuery = inferKnowledgeContextQuery(prompt);

  const withKnowledge = (steps: WorkflowStep[]): WorkflowStep[] => {
    if (!knowledgeQuery) return steps;
    return [buildKnowledgeContextStep(knowledgeQuery), ...steps];
  };

  if (/(email|inbox|mail)/.test(lowered)) return withKnowledge(buildEmailSteps());
  if (/(calendar|event|meeting|schedule|caldav)/.test(lowered)) return withKnowledge(buildCalendarSteps());
  if (/(gdocs|google doc|document|docs?)/.test(lowered)) return withKnowledge(buildGDocsSteps());
  if (/(notion|page|workspace)/.test(lowered)) return withKnowledge(buildNotionSteps());
  return withKnowledge(buildGenericSteps());
};

export const planWorkflowFromPrompt = (input: WorkflowPlanInput): Workflow => {
  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new Error('Workflow prompt is required.');
  }

  const now = input.nowIso ? new Date(input.nowIso) : new Date();
  const nowIso = now.toISOString();
  const steps = inferSteps(prompt);

  return withWorkflowPolicy({
    id: makeId('workflow'),
    userId: input.userId,
    name: normalizeName(prompt),
    description: `Auto-generated plan from prompt: ${prompt}`,
    naturalLanguagePrompt: prompt,
    trigger: inferTrigger(prompt, now),
    steps,
    planGraph: buildLinearPlanGraph(steps),
    status: 'ready',
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  }, nowIso);
};
