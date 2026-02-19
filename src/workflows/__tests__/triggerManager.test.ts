import { describe, expect, it } from 'vitest';
import { WorkflowTriggerManager, type Workflow } from '../index';

const buildScheduleWorkflow = (): Workflow => ({
  id: 'wf-1',
  userId: 'user-1',
  name: 'Scheduled Workflow',
  description: 'test',
  naturalLanguagePrompt: 'prompt',
  trigger: {
    id: 'tr-1',
    type: 'schedule',
    enabled: true,
    schedule: {
      intervalMinutes: 60,
      nextRunAtIso: '2026-02-16T10:00:00.000Z',
      cronLike: 'HOURLY',
    },
  },
  steps: [],
  status: 'ready',
  createdAtIso: '2026-02-16T09:00:00.000Z',
  updatedAtIso: '2026-02-16T09:00:00.000Z',
});

describe('triggerManager', () => {
  it('fires due scheduled workflows once and advances next run', async () => {
    const manager = new WorkflowTriggerManager();
    let count = 0;

    manager.register(buildScheduleWorkflow(), async () => {
      count += 1;
    });

    await manager.tick('2026-02-16T10:00:05.000Z');
    await manager.tick('2026-02-16T10:01:00.000Z');

    expect(count).toBe(1);
  });

  it('fires keyword event workflows only when keyword is present', async () => {
    const manager = new WorkflowTriggerManager();
    let count = 0;

    manager.register(
      {
        ...buildScheduleWorkflow(),
        id: 'wf-2',
        trigger: {
          id: 'tr-2',
          type: 'event',
          enabled: true,
          event: {
            eventType: 'keyword_match',
            keyword: 'invoice',
          },
        },
      },
      () => {
        count += 1;
      }
    );

    await manager.dispatchEvent({ type: 'keyword_match', text: 'status update' });
    await manager.dispatchEvent({ type: 'keyword_match', text: 'invoice processed today' });

    expect(count).toBe(1);
  });
});
