import { describe, expect, it } from 'vitest';
import { evaluateBranchCondition, evaluateBranchConditions } from '../conditionEvaluator';

describe('conditionEvaluator', () => {
  const source = {
    root: {
      meta: {
        channel: 'email',
      },
    },
    current: {
      route: 'FINANCE',
      summary: 'Invoice overdue and escalation required',
      score: 92,
    },
    steps: {
      previous: {
        output: {
          total: 7,
        },
      },
    },
  };

  it('evaluates string equality', () => {
    expect(
      evaluateBranchCondition({
        source,
        condition: {
          id: 'c1',
          sourcePath: 'current.route',
          operator: 'string_equals',
          value: 'finance',
        },
      })
    ).toBe(true);
  });

  it('evaluates string contains', () => {
    expect(
      evaluateBranchCondition({
        source,
        condition: {
          id: 'c2',
          sourcePath: 'current.summary',
          operator: 'string_contains',
          value: 'overdue',
        },
      })
    ).toBe(true);
  });

  it('evaluates number compare greater than', () => {
    expect(
      evaluateBranchCondition({
        source,
        condition: {
          id: 'c3',
          sourcePath: 'current.score',
          operator: 'number_compare',
          value: 90,
          numberComparator: 'gt',
        },
      })
    ).toBe(true);
  });

  it('evaluates number compare less-than-or-equal', () => {
    expect(
      evaluateBranchCondition({
        source,
        condition: {
          id: 'c4',
          sourcePath: 'steps.previous.output.total',
          operator: 'number_compare',
          value: 7,
          numberComparator: 'lte',
        },
      })
    ).toBe(true);
  });

  it('evaluates regex matching', () => {
    expect(
      evaluateBranchCondition({
        source,
        condition: {
          id: 'c5',
          sourcePath: 'current.summary',
          operator: 'regex_match',
          value: 'invoice\\s+overdue',
          regexFlags: 'i',
        },
      })
    ).toBe(true);
  });

  it('evaluates exists', () => {
    expect(
      evaluateBranchCondition({
        source,
        condition: {
          id: 'c6',
          sourcePath: 'root.meta.channel',
          operator: 'exists',
        },
      })
    ).toBe(true);
  });

  it('evaluates not exists', () => {
    expect(
      evaluateBranchCondition({
        source,
        condition: {
          id: 'c7',
          sourcePath: 'root.meta.unknown_field',
          operator: 'not_exists',
        },
      })
    ).toBe(true);
  });

  it('evaluates condition sets as AND groups', () => {
    expect(
      evaluateBranchConditions({
        source,
        conditions: [
          {
            id: 'c8a',
            sourcePath: 'current.route',
            operator: 'string_equals',
            value: 'finance',
          },
          {
            id: 'c8b',
            sourcePath: 'current.score',
            operator: 'number_compare',
            value: 80,
            numberComparator: 'gte',
          },
        ],
      })
    ).toBe(true);
  });
});
