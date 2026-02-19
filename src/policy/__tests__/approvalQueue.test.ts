import { describe, expect, it } from 'vitest';
import { ApprovalQueue } from '../approvalQueue';

describe('approvalQueue', () => {
  it('creates, resolves, and expires approval requests', () => {
    let now = Date.parse('2026-05-25T10:00:00.000Z');
    const queue = new ApprovalQueue(() => new Date(now).toISOString());

    const request = queue.createRequest({
      payload: {
        actor: { user_id: 'u-1', role: 'member' },
        action: {
          action_id: 'byok.rotate',
          resource_type: 'byok_key',
          mutation: true,
          idempotent: false,
        },
      },
      reason: 'high-risk action',
      expiresAtIso: '2026-05-25T10:01:00.000Z',
    });

    expect(queue.list('pending').length).toBe(1);

    const approved = queue.decide({
      requestId: request.id,
      decision: 'approve',
      reviewerUserId: 'owner-1',
    });

    expect(approved.status).toBe('approved');

    const second = queue.createRequest({
      payload: {
        actor: { user_id: 'u-2', role: 'member' },
        action: {
          action_id: 'policy.update',
          resource_type: 'policy_rule',
          mutation: true,
          idempotent: false,
        },
      },
      reason: 'admin mutation',
      expiresAtIso: '2026-05-25T10:02:00.000Z',
    });

    now = Date.parse('2026-05-25T10:03:00.000Z');
    const expired = queue.expirePending(new Date(now).toISOString());

    expect(expired.map((entry) => entry.id)).toContain(second.id);
    expect(queue.getById(second.id)?.status).toBe('expired');
  });
});

