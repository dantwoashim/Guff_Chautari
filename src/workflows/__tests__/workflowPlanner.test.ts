import { describe, expect, it } from 'vitest';
import { planWorkflowFromPrompt } from '../index';

describe('workflowPlanner', () => {
  it('creates a three-step email summary workflow from natural language', () => {
    const workflow = planWorkflowFromPrompt({
      userId: 'user-1',
      prompt: 'Summarize my emails every morning',
      nowIso: '2026-02-16T08:00:00.000Z',
    });

    expect(workflow.steps).toHaveLength(3);
    expect(workflow.steps[0].actionId).toBe('connector.email.fetch_inbox');
    expect(workflow.steps[1].actionId).toBe('transform.summarize');
    expect(workflow.steps[2].actionId).toBe('artifact.publish');
    expect(workflow.trigger.type).toBe('schedule');
    expect(workflow.trigger.schedule?.intervalMinutes).toBe(1440);
    expect(workflow.planGraph?.entryStepId).toBe(workflow.steps[0].id);
    expect(workflow.planGraph?.branches).toHaveLength(2);
  });

  it('creates event trigger when keyword event is requested', () => {
    const workflow = planWorkflowFromPrompt({
      userId: 'user-2',
      prompt: 'Run this when message arrives keyword:invoice',
      nowIso: '2026-02-16T08:00:00.000Z',
    });

    expect(workflow.trigger.type).toBe('event');
    expect(workflow.trigger.event?.eventType).toBe('keyword_match');
    expect(workflow.trigger.event?.keyword).toBe('invoice');
  });

  it('creates calendar workflow steps when scheduling language is used', () => {
    const workflow = planWorkflowFromPrompt({
      userId: 'user-3',
      prompt: 'Review my calendar events and summarize schedule risks',
      nowIso: '2026-02-16T08:00:00.000Z',
    });

    expect(workflow.steps[0].actionId).toBe('connector.calendar.list_events');
    expect(workflow.steps[1].actionId).toBe('transform.summarize');
    expect(workflow.steps[2].actionId).toBe('artifact.publish');
  });

  it('creates gdocs workflow steps when document language is used', () => {
    const workflow = planWorkflowFromPrompt({
      userId: 'user-4',
      prompt: 'Summarize my google docs into one digest',
      nowIso: '2026-02-16T08:00:00.000Z',
    });

    expect(workflow.steps[0].actionId).toBe('connector.gdocs.list_documents');
    expect(workflow.steps[1].actionId).toBe('transform.summarize');
    expect(workflow.steps[2].actionId).toBe('artifact.publish');
  });

  it('prepends knowledge context step when prompt asks for notes before email drafting', () => {
    const workflow = planWorkflowFromPrompt({
      userId: 'user-5',
      prompt: 'Summarize my notes on churn before sending email update',
      nowIso: '2026-02-16T08:00:00.000Z',
    });

    expect(workflow.steps[0].actionId).toBe('transform.collect_context');
    expect(workflow.steps[1].actionId).toBe('connector.email.fetch_inbox');
    expect(workflow.policy?.allowedConnectorIds).toContain('email');
  });
});
