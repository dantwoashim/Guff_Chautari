import { connectorRegistry, type ConnectorInvocationOutcome, type ConnectorRegistry } from '../connectors';
import type { ActorRole } from '../policy';
import { workflowEngine, type Workflow, type WorkflowEngine } from '../workflows';
import type {
  MeetingActionExtraction,
  MeetingActionItem,
  MeetingFollowUpExecution,
  MeetingSession,
} from './types';

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const cleanText = (value: string): string => value.replace(/\s+/g, ' ').trim();

const truncate = (value: string, maxLength: number): string =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;

const looksLikeEmailFollowUp = (item: MeetingActionItem): boolean =>
  /\b(email|follow up|follow-up|send update|send notes|draft message)\b/i.test(item.text);

const looksLikeScheduleAction = (item: MeetingActionItem): boolean =>
  /\b(schedule|calendar|book|set up|setup|next meeting|follow-up call|arrange meeting|meeting invite)\b/i.test(
    item.text
  );

const draftEmailSubject = (payload: {
  sessionTitle: string;
  actionItem: MeetingActionItem;
}): string => {
  const actionSummary = truncate(cleanText(payload.actionItem.text), 56);
  return cleanText(`Follow-up: ${payload.sessionTitle} - ${actionSummary}`);
};

const draftEmailBody = (payload: {
  session: MeetingSession;
  extraction: MeetingActionExtraction;
  actionItem: MeetingActionItem;
}): string => {
  const decisionLines = payload.extraction.decisions
    .slice(0, 4)
    .map((decision) => `- ${decision.text}`)
    .join('\n');
  const actionLines = payload.extraction.actionItems
    .slice(0, 6)
    .map((item) => `- ${item.text}`)
    .join('\n');
  const topics = payload.extraction.topics.slice(0, 4).map((topic) => topic.label).join(', ') || 'general';

  return cleanText(
    [
      `Meeting: ${payload.session.title}`,
      `Primary follow-up task: ${payload.actionItem.text}`,
      payload.actionItem.assignee ? `Owner: ${payload.actionItem.assignee}` : '',
      payload.actionItem.deadlineIso ? `Target date: ${payload.actionItem.deadlineIso}` : '',
      `Topics discussed: ${topics}`,
      decisionLines ? `Decisions:\n${decisionLines}` : '',
      actionLines ? `Action items:\n${actionLines}` : '',
      'Please reply with edits before sending.',
    ]
      .filter((line) => line.length > 0)
      .join('\n\n')
  );
};

const buildEmailWorkflow = (payload: {
  nowIso: string;
  actorUserId: string;
  session: MeetingSession;
  actionItem: MeetingActionItem;
  draftSubject: string;
  draftBody: string;
}): Workflow => {
  const nowIso = payload.nowIso;
  return {
    id: makeId('meeting-email-workflow'),
    userId: payload.actorUserId,
    name: truncate(`Meeting Email Draft - ${payload.session.title}`, 72),
    description: truncate(`Draft follow-up email for action item: ${payload.actionItem.text}`, 180),
    naturalLanguagePrompt: payload.draftBody,
    trigger: {
      id: makeId('meeting-email-trigger'),
      type: 'manual',
      enabled: true,
    },
    steps: [
      {
        id: makeId('meeting-email-step'),
        title: 'Collect context',
        description: 'Gather context relevant to the meeting follow-up draft.',
        kind: 'transform',
        actionId: 'transform.collect_context',
        inputTemplate: JSON.stringify({
          query: payload.actionItem.text,
          topK: 6,
        }),
        status: 'idle',
      },
      {
        id: makeId('meeting-email-step'),
        title: 'Summarize context',
        description: 'Summarize context for the follow-up email.',
        kind: 'transform',
        actionId: 'transform.summarize',
        status: 'idle',
      },
      {
        id: makeId('meeting-email-step'),
        title: 'Publish draft artifact',
        description: `Publish draft email artifact for subject "${payload.draftSubject}".`,
        kind: 'artifact',
        actionId: 'artifact.publish',
        status: 'idle',
      },
    ],
    status: 'ready',
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
};

const deriveScheduleWindow = (payload: {
  actionItem: MeetingActionItem;
  nowIso: string;
  defaultDurationMinutes: number;
}): { startsAtIso: string; endsAtIso: string } => {
  const defaultDurationMs = Math.max(15, payload.defaultDurationMinutes) * 60 * 1000;
  const baselineMs = Date.parse(payload.nowIso);

  let startMs = baselineMs + 24 * 60 * 60 * 1000;
  if (payload.actionItem.deadlineIso) {
    const deadlineMs = Date.parse(payload.actionItem.deadlineIso);
    if (!Number.isNaN(deadlineMs)) {
      startMs = deadlineMs;
    }
  }

  const startsAt = new Date(startMs);
  if (startsAt.getHours() === 0 && startsAt.getMinutes() === 0) {
    startsAt.setHours(10, 0, 0, 0);
  }
  const endsAt = new Date(startsAt.getTime() + defaultDurationMs);
  return {
    startsAtIso: startsAt.toISOString(),
    endsAtIso: endsAt.toISOString(),
  };
};

interface MeetingFollowUpExecutionDependencies {
  workflowEngine?: Pick<WorkflowEngine, 'saveWorkflow'>;
  connectorRegistry?: Pick<ConnectorRegistry, 'invoke'>;
  nowIso?: () => string;
}

export const executeMeetingFollowUps = async (
  payload: {
    actorUserId: string;
    actorRole?: ActorRole;
    session: MeetingSession;
    extraction: MeetingActionExtraction;
    defaultCalendarDurationMinutes?: number;
  },
  dependencies: MeetingFollowUpExecutionDependencies = {}
): Promise<MeetingFollowUpExecution> => {
  const workflowEngineRef = dependencies.workflowEngine ?? workflowEngine;
  const connectorRegistryRef = dependencies.connectorRegistry ?? connectorRegistry;
  const nowIso = dependencies.nowIso ? dependencies.nowIso() : new Date().toISOString();
  const defaultCalendarDurationMinutes = payload.defaultCalendarDurationMinutes ?? 30;

  const createdWorkflows: Workflow[] = [];
  const connectorInvocations: ConnectorInvocationOutcome[] = [];
  const generatedEmailDrafts: MeetingFollowUpExecution['generatedEmailDrafts'] = [];
  const scheduledEvents: MeetingFollowUpExecution['scheduledEvents'] = [];

  for (const item of payload.extraction.actionItems) {
    if (looksLikeEmailFollowUp(item)) {
      const subject = draftEmailSubject({
        sessionTitle: payload.session.title,
        actionItem: item,
      });
      const body = draftEmailBody({
        session: payload.session,
        extraction: payload.extraction,
        actionItem: item,
      });
      const workflow = buildEmailWorkflow({
        nowIso,
        actorUserId: payload.actorUserId,
        session: payload.session,
        actionItem: item,
        draftSubject: subject,
        draftBody: body,
      });
      const saved = workflowEngineRef.saveWorkflow(payload.actorUserId, workflow);
      createdWorkflows.push(saved);
      generatedEmailDrafts.push({
        actionItemId: item.id,
        draftSubject: subject,
        draftBody: body,
        workflowId: saved.id,
      });
    }

    if (looksLikeScheduleAction(item)) {
      const scheduleWindow = deriveScheduleWindow({
        actionItem: item,
        nowIso,
        defaultDurationMinutes: defaultCalendarDurationMinutes,
      });
      try {
        const outcome = await connectorRegistryRef.invoke({
          userId: payload.actorUserId,
          actorRole: payload.actorRole ?? 'owner',
          connectorId: 'calendar',
          actionId: 'create_event',
          payload: {
            title: truncate(`Meeting Follow-up: ${payload.session.title}`, 80),
            startsAtIso: scheduleWindow.startsAtIso,
            endsAtIso: scheduleWindow.endsAtIso,
            notes: cleanText(item.text),
            attendees: item.assignee ? [item.assignee] : undefined,
          },
        });
        connectorInvocations.push(outcome);
        scheduledEvents.push({
          actionItemId: item.id,
          invoked: true,
        });
      } catch (error) {
        scheduledEvents.push({
          actionItemId: item.id,
          invoked: false,
          reason: error instanceof Error ? error.message : 'Calendar invocation failed.',
        });
      }
    }
  }

  return {
    createdWorkflows,
    connectorInvocations,
    generatedEmailDrafts,
    scheduledEvents,
  };
};

