import type { VerticalConfig } from './types';

export interface VerticalConfigValidationResult {
  ok: boolean;
  issues: string[];
}

const NON_EMPTY = /[^\s]/;
const SAFE_ID = /^[a-z0-9_][a-z0-9_-]{2,63}$/;

const hasText = (value: string | undefined): boolean => {
  return typeof value === 'string' && NON_EMPTY.test(value);
};

const hasUniqueIds = <T extends { id: string }>(items: ReadonlyArray<T>): boolean => {
  const ids = items.map((item) => item.id);
  return new Set(ids).size === ids.length;
};

export const validateVerticalConfig = (
  config: VerticalConfig
): VerticalConfigValidationResult => {
  const issues: string[] = [];

  if (!SAFE_ID.test(config.id)) {
    issues.push('id must use lowercase slug format (3-64 chars, letters/numbers/_/-).');
  }
  if (!hasText(config.name)) issues.push('name is required.');
  if (!hasText(config.tagline)) issues.push('tagline is required.');
  if (!hasText(config.description)) issues.push('description is required.');

  if (!hasText(config.persona?.id)) issues.push('persona.id is required.');
  if (!hasText(config.persona?.name)) issues.push('persona.name is required.');
  if (!hasText(config.persona?.systemInstruction)) issues.push('persona.systemInstruction is required.');

  if (!Array.isArray(config.workflows) || config.workflows.length === 0) {
    issues.push('at least one workflow is required.');
  } else if (!hasUniqueIds(config.workflows)) {
    issues.push('workflow ids must be unique.');
  }

  if (!Array.isArray(config.knowledgeTemplates) || config.knowledgeTemplates.length === 0) {
    issues.push('at least one knowledge template is required.');
  } else if (!hasUniqueIds(config.knowledgeTemplates)) {
    issues.push('knowledge template ids must be unique.');
  }

  if (!Array.isArray(config.decisionPresets) || config.decisionPresets.length === 0) {
    issues.push('at least one decision preset is required.');
  } else if (!hasUniqueIds(config.decisionPresets)) {
    issues.push('decision preset ids must be unique.');
  }

  if (!Array.isArray(config.uiPanels) || config.uiPanels.length === 0) {
    issues.push('at least one ui panel id is required.');
  }
  if (!Array.isArray(config.safetyBoundaries) || config.safetyBoundaries.length === 0) {
    issues.push('at least one safety boundary is required.');
  } else if (!hasUniqueIds(config.safetyBoundaries)) {
    issues.push('safety boundary ids must be unique.');
  }

  return {
    ok: issues.length === 0,
    issues,
  };
};

export const normalizeVerticalConfig = (config: VerticalConfig): VerticalConfig => {
  return {
    ...config,
    source: config.source ?? 'built_in',
    version: config.version ?? '1.0.0',
    workflows: [...config.workflows],
    knowledgeTemplates: [...config.knowledgeTemplates],
    decisionPresets: [...config.decisionPresets],
    uiPanels: [...config.uiPanels],
    safetyBoundaries: [...config.safetyBoundaries],
    benchmarks: [...config.benchmarks],
  };
};
