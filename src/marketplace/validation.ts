import type { TemplateItem } from './types';

export interface TemplateValidationResult {
  ok: boolean;
  issues: string[];
}

const isSemver = (value: string): boolean => /^\d+\.\d+\.\d+$/.test(value);

export const validateTemplate = (template: TemplateItem): TemplateValidationResult => {
  const issues: string[] = [];

  if (!template.metadata.id.trim()) {
    issues.push('metadata.id is required');
  }
  if (!template.metadata.name.trim()) {
    issues.push('metadata.name is required');
  }
  if (!template.metadata.description.trim()) {
    issues.push('metadata.description is required');
  }
  if (!isSemver(template.metadata.version)) {
    issues.push('metadata.version must be semver (x.y.z)');
  }
  if (!Array.isArray(template.metadata.tags) || template.metadata.tags.length === 0) {
    issues.push('metadata.tags must include at least one tag');
  }

  if (template.kind === 'persona') {
    if (!template.personaYaml.trim()) {
      issues.push('personaYaml is required');
    }
    if (!template.summary.trim()) {
      issues.push('persona summary is required');
    }
  } else {
    if (!template.naturalLanguagePrompt.trim()) {
      issues.push('naturalLanguagePrompt is required');
    }
    if (!Array.isArray(template.steps) || template.steps.length < 2) {
      issues.push('workflow template must have at least 2 steps');
    }
    for (const step of template.steps) {
      if (!step.id.trim()) issues.push('workflow step id cannot be empty');
      if (!step.title.trim()) issues.push(`workflow step ${step.id || '<unknown>'} title required`);
      if (!step.actionId.trim()) issues.push(`workflow step ${step.id || '<unknown>'} actionId required`);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
};
