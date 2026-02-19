import { describe, expect, it } from 'vitest';
import { buildAuditTrailLines } from '../auditLog';
import { PolicyEngine } from '../policyEngine';

describe('policyEngine', () => {
  it('blocks unauthorized mutation attempts', () => {
    const engine = new PolicyEngine({
      nowIso: () => '2026-05-25T10:00:00.000Z',
    });

    const result = engine.evaluate({
      actor: { user_id: 'guest-1', role: 'guest' },
      action: {
        action_id: 'memory.write',
        resource_type: 'memory',
        mutation: true,
        idempotent: false,
      },
    });

    expect(result.decision.decision).toBe('deny');
    expect(result.decision.reason).toContain('unauthorized');
  });

  it('escalates red-tier actions to approval queue and logs decision chain', () => {
    const engine = new PolicyEngine({
      nowIso: () => '2026-05-25T11:00:00.000Z',
    });

    const evaluation = engine.evaluate({
      actor: { user_id: 'owner-1', role: 'owner' },
      action: {
        action_id: 'byok.rotate',
        resource_type: 'byok_key',
        mutation: true,
        idempotent: false,
      },
    });

    expect(evaluation.decision.decision).toBe('escalate');
    expect(evaluation.approval_request).toBeDefined();
    expect(engine.queue.list('pending').length).toBe(1);

    const resolved = engine.resolveApproval({
      requestId: evaluation.approval_request!.id,
      reviewerUserId: 'owner-1',
      approve: true,
      decidedAtIso: '2026-05-25T11:01:00.000Z',
    });

    expect(resolved.decision.decision).toBe('allow');
    expect(resolved.approval_request?.status).toBe('approved');

    const audit = engine.auditLog.listByAction('byok.rotate');
    const lines = buildAuditTrailLines(audit);

    expect(audit.length).toBeGreaterThanOrEqual(4);
    expect(lines.some((line) => line.includes('approval_requested'))).toBe(true);
    expect(lines.some((line) => line.includes('approval_resolved'))).toBe(true);
    expect(lines.some((line) => line.includes('policy_decision'))).toBe(true);
  });

  it('applies yellow-tier notify window for medium risk actions', () => {
    const engine = new PolicyEngine({
      nowIso: () => '2026-05-25T12:00:00.000Z',
    });

    const result = engine.evaluate({
      actor: { user_id: 'member-1', role: 'member' },
      action: {
        action_id: 'persona.update',
        resource_type: 'persona',
        mutation: true,
        idempotent: true,
      },
    });

    expect(result.decision.risk_tier).toBe('yellow');
    expect(result.decision.decision).toBe('allow');
    expect(result.decision.expires_at).toBe('2026-05-25T12:00:30.000Z');
  });

  it('composes regional safety metadata on top of base decisions', () => {
    const engine = new PolicyEngine({
      nowIso: () => '2026-05-25T13:00:00.000Z',
    });

    const result = engine.evaluateWithRegionalContext(
      {
        actor: { user_id: 'member-2', role: 'member' },
        action: {
          action_id: 'memory.read',
          resource_type: 'memory',
          mutation: false,
        },
      },
      {
        countryCode: 'US',
        subdivisionCode: 'CA',
      }
    );

    expect(result.decision.decision).toBe('allow');
    expect(result.decision.metadata.regional_jurisdiction).toBe('us_ca');
    expect(
      (result.decision.metadata.regional_obligations as string[]).includes(
        'enforce_opt_out_and_delete'
      )
    ).toBe(true);
  });
});
