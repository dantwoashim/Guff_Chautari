import type { BranchCondition } from './types';

const parsePathSegments = (path: string): string[] => {
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
};

const resolvePathValue = (source: unknown, path: string): unknown => {
  if (path === '__always') return true;
  if (path === '*') return source;

  const segments = parsePathSegments(path);
  if (segments.length === 0) return undefined;

  let current: unknown = source;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;

    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }

    if (typeof current !== 'object') {
      return undefined;
    }

    const record = current as Record<string, unknown>;
    current = record[segment];
  }

  return current;
};

const normalizeString = (value: unknown, caseSensitive: boolean): string | null => {
  if (value === null || value === undefined) return null;
  const next = String(value);
  return caseSensitive ? next : next.toLowerCase();
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const evaluateBranchCondition = (payload: {
  condition: BranchCondition;
  source: unknown;
}): boolean => {
  const { condition } = payload;
  const left = resolvePathValue(payload.source, condition.sourcePath);

  if (condition.operator === 'exists') {
    return left !== null && left !== undefined;
  }

  if (condition.operator === 'not_exists') {
    return left === null || left === undefined;
  }

  if (condition.operator === 'string_equals') {
    const caseSensitive = condition.caseSensitive ?? false;
    const leftText = normalizeString(left, caseSensitive);
    const rightText = normalizeString(condition.value, caseSensitive);
    if (leftText === null || rightText === null) return false;
    return leftText === rightText;
  }

  if (condition.operator === 'string_contains') {
    const caseSensitive = condition.caseSensitive ?? false;
    const leftText = normalizeString(left, caseSensitive);
    const rightText = normalizeString(condition.value, caseSensitive);
    if (leftText === null || rightText === null) return false;
    return leftText.includes(rightText);
  }

  if (condition.operator === 'number_compare') {
    const leftNumber = toFiniteNumber(left);
    const rightNumber = toFiniteNumber(condition.value);
    if (leftNumber === null || rightNumber === null) return false;

    const comparator = condition.numberComparator ?? 'eq';
    if (comparator === 'gt') return leftNumber > rightNumber;
    if (comparator === 'gte') return leftNumber >= rightNumber;
    if (comparator === 'lt') return leftNumber < rightNumber;
    if (comparator === 'lte') return leftNumber <= rightNumber;
    return leftNumber === rightNumber;
  }

  if (condition.operator === 'regex_match') {
    if (typeof condition.value !== 'string' || condition.value.trim().length === 0) return false;
    const leftText = normalizeString(left, true);
    if (leftText === null) return false;

    try {
      const regex = new RegExp(condition.value, condition.regexFlags);
      return regex.test(leftText);
    } catch {
      return false;
    }
  }

  return false;
};

export const evaluateBranchConditions = (payload: {
  conditions: ReadonlyArray<BranchCondition>;
  source: unknown;
}): boolean => {
  for (const condition of payload.conditions) {
    if (!evaluateBranchCondition({ condition, source: payload.source })) {
      return false;
    }
  }
  return true;
};
