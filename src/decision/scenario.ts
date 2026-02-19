import { normalizeAssumptions } from './assumptions';
import { rankDecisionOptions } from './optionMatrix';
import type { DecisionMatrix, ScenarioBranch, ScenarioEvaluation } from './types';

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const withBranchApplied = (matrix: DecisionMatrix, branch: ScenarioBranch): DecisionMatrix => {
  const criteria = matrix.criteria.map((criterion) => ({
    ...criterion,
    weight: branch.criterion_weight_overrides?.[criterion.id] ?? criterion.weight,
  }));

  const options = matrix.options.map((option) => ({
    ...option,
    scores: {
      ...option.scores,
      ...(branch.option_score_overrides?.[option.id] ?? {}),
    },
  }));

  const assumptions = normalizeAssumptions(
    matrix.assumptions.map((assumption) => ({
      ...assumption,
      confidence:
        branch.assumption_confidence_overrides?.[assumption.id] ?? assumption.confidence,
    }))
  );

  return {
    ...matrix,
    criteria,
    options,
    assumptions,
  };
};

export const addScenarioBranch = (
  matrix: DecisionMatrix,
  branch: Omit<ScenarioBranch, 'id'> & { id?: string }
): DecisionMatrix => {
  const nextBranch: ScenarioBranch = {
    ...branch,
    id: branch.id ?? makeId('scenario'),
  };

  return {
    ...matrix,
    branches: [...matrix.branches, nextBranch],
  };
};

export const evaluateScenario = (
  matrix: DecisionMatrix,
  branch: ScenarioBranch | null
): ScenarioEvaluation => {
  const evaluatedMatrix = branch ? withBranchApplied(matrix, branch) : matrix;
  const rankings = rankDecisionOptions(evaluatedMatrix);
  const top = rankings[0];

  return {
    branch_id: branch?.id ?? 'base',
    branch_label: branch?.label ?? 'Base',
    top_option_id: top?.option_id ?? null,
    top_score: top?.score ?? 0,
    rankings,
  };
};

export const compareScenarios = (
  matrix: DecisionMatrix,
  branchIds?: string[]
): ScenarioEvaluation[] => {
  const selectedBranches = branchIds
    ? matrix.branches.filter((branch) => branchIds.includes(branch.id))
    : matrix.branches;

  return [
    evaluateScenario(matrix, null),
    ...selectedBranches.map((branch) => evaluateScenario(matrix, branch)),
  ];
};
