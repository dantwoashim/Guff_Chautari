export type BuiltInVerticalId =
  | 'founder_os'
  | 'research_writing_lab'
  | 'career_studio'
  | 'health_habit_planning';

export type VerticalId = BuiltInVerticalId | (string & {});

export type VerticalModuleType =
  | 'persona'
  | 'workflow'
  | 'knowledge_template'
  | 'decision_preset'
  | 'ui_panel'
  | 'safety_boundary';

export interface VerticalModule {
  type: VerticalModuleType;
  id: string;
  title: string;
  description: string;
}

export interface VerticalPersonaConfig {
  id: string;
  name: string;
  description: string;
  systemInstruction: string;
  tone: 'direct' | 'warm' | 'balanced' | 'analytical';
  domainTags: string[];
}

export interface VerticalWorkflowConfig {
  id: string;
  title: string;
  description: string;
  triggerType: 'manual' | 'schedule' | 'event';
  successMetric: string;
}

export interface VerticalKnowledgeTemplate {
  id: string;
  title: string;
  description: string;
  seedPrompt: string;
  tags: string[];
}

export interface VerticalDecisionPreset {
  id: string;
  title: string;
  description: string;
  criteria: string[];
}

export interface VerticalSafetyBoundary {
  id: string;
  rule: string;
  onViolation: string;
}

export interface DomainBenchmarkDimension {
  id: string;
  title: string;
  weight: number;
  target: number;
  minimum: number;
}

export interface DomainBenchmarkRunInput {
  verticalId: VerticalId;
  nowIso: string;
  observations: Record<string, number>;
}

export interface DomainBenchmarkResult {
  benchmarkId: string;
  verticalId: VerticalId;
  score: number;
  passed: boolean;
  dimensions: Array<{
    id: string;
    score: number;
    target: number;
    minimum: number;
    passed: boolean;
  }>;
  generatedAtIso: string;
}

export interface DomainBenchmark {
  id: string;
  title: string;
  description: string;
  dimensions: DomainBenchmarkDimension[];
  run: (input: DomainBenchmarkRunInput) => DomainBenchmarkResult;
}

export interface VerticalConfig {
  id: VerticalId;
  name: string;
  tagline: string;
  description: string;
  source?: 'built_in' | 'community';
  version?: string;
  createdByUserId?: string;
  persona: VerticalPersonaConfig;
  workflows: VerticalWorkflowConfig[];
  knowledgeTemplates: VerticalKnowledgeTemplate[];
  decisionPresets: VerticalDecisionPreset[];
  uiPanels: string[];
  safetyBoundaries: VerticalSafetyBoundary[];
  benchmarks: DomainBenchmark[];
}

export interface VerticalActivation {
  workspaceId: string;
  userId: string;
  verticalId: VerticalId;
  activatedAtIso: string;
  previousVerticalId?: VerticalId;
  modules: VerticalModule[];
  panelIds: string[];
  knowledgeNamespaces: string[];
  searchableNamespaces: string[];
}

export interface VerticalActivationInput {
  workspaceId: string;
  userId: string;
  verticalId: VerticalId;
  nowIso?: string;
}

export interface VerticalActivationHistoryEntry {
  workspaceId: string;
  verticalId: VerticalId;
  activatedAtIso: string;
}
