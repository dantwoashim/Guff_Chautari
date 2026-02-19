import { ActivityStore, activityStore } from './store';
import { listActivityEvents } from './eventEmitter';
import { summarizeWeeklyActivity } from './timeline';
import type { WeeklyBriefing } from './types';

const topCategoryLabel = (counts: Record<string, number>): string => {
  const entries = Object.entries(counts).sort((left, right) => right[1] - left[1]);
  if (entries.length === 0 || entries[0][1] === 0) return 'No activity yet';
  return `${entries[0][0]} (${entries[0][1]})`;
};

const firstNonZero = (counts: Record<string, number>, key: string): number => counts[key] ?? 0;

export const generateWeeklyBriefing = (
  payload: {
    userId: string;
    nowIso?: string;
  },
  store: ActivityStore = activityStore
): WeeklyBriefing => {
  const summary = summarizeWeeklyActivity(payload, store);
  const generatedAtIso = payload.nowIso ?? new Date().toISOString();

  if (summary.totalEvents === 0) {
    return {
      title: 'Weekly Activity Briefing',
      generatedAtIso,
      summary:
        'No activity has been recorded this week. Start with one decision, one workflow run, or one knowledge ingestion action.',
      highlights: ['No events captured yet.'],
      followUps: [
        'Create at least one workflow and run it once.',
        'Ask one question in Decision Room with knowledge retrieval enabled.',
      ],
    };
  }

  const highlights: string[] = [
    `Total activity events: ${summary.totalEvents}.`,
    `Dominant category: ${topCategoryLabel(summary.countsByCategory)}.`,
  ];

  if (summary.topEventTypes[0]) {
    highlights.push(
      `Most frequent event type: ${summary.topEventTypes[0].eventType} (${summary.topEventTypes[0].count}).`
    );
  }

  const workflowEvents = listActivityEvents(
    {
      userId: payload.userId,
      filter: {
        categories: ['workflow'],
        dateFromIso: summary.weekStartIso,
        dateToIso: summary.weekEndIso,
      },
      limit: 400,
    },
    store
  );
  if (workflowEvents.length > 0) {
    const completed = workflowEvents.filter((event) => event.eventType === 'workflow.completed').length;
    const failed = workflowEvents.filter((event) => event.eventType === 'workflow.failed').length;
    const pendingReview = workflowEvents.filter(
      (event) =>
        event.eventType === 'workflow.approval_required' ||
        event.eventType === 'workflow.checkpoint_required'
    ).length;

    highlights.push(
      `Workflow execution summary: ${workflowEvents.length} event(s), ${completed} completed, ${failed} failed, ${pendingReview} pending review.`
    );
  }

  const followUps: string[] = [];
  if (firstNonZero(summary.countsByCategory, 'workflow') === 0) {
    followUps.push('Schedule at least one workflow to run automatically this week.');
  }
  if (firstNonZero(summary.countsByCategory, 'knowledge') === 0) {
    followUps.push('Ingest one new knowledge source to improve decision evidence quality.');
  }
  if (firstNonZero(summary.countsByCategory, 'decision') === 0) {
    followUps.push('Complete one Decision Room cycle and log follow-through.');
  }

  if (followUps.length === 0) {
    followUps.push('Maintain consistency: repeat your strongest loop and compare outcomes next week.');
  }

  return {
    title: 'Weekly Activity Briefing',
    generatedAtIso,
    summary:
      `This week ran from ${new Date(summary.weekStartIso).toLocaleDateString()} to ${new Date(summary.weekEndIso).toLocaleDateString()}. ` +
      `You logged ${summary.totalEvents} events across chat, knowledge, decisions, workflows, reflection, and plugins.`,
    highlights,
    followUps,
  };
};
