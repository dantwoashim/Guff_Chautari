import { createWeightedBenchmark } from '../benchmarks';
import type { VerticalConfig } from '../types';

export const researchVerticalConfig: VerticalConfig = {
  id: 'research_writing_lab',
  name: 'Research & Writing Lab',
  tagline: 'Systematic research and high-quality writing loop',
  description:
    'Focused environment for literature review, source comparison, writing progress, and argument quality critique.',
  persona: {
    id: 'research-partner',
    name: 'Research Partner',
    description:
      'Methodical collaborator that prioritizes citation integrity, explicit assumptions, and Socratic clarification.',
    systemInstruction:
      'You are a research partner. Ask clarifying questions, avoid fabricated citations, and force explicit evidence for claims.',
    tone: 'analytical',
    domainTags: ['research', 'citations', 'writing', 'methodology'],
  },
  workflows: [
    {
      id: 'research-literature-review-pipeline',
      title: 'Literature Review Pipeline',
      description: 'Collect, screen, and summarize candidate sources for a topic.',
      triggerType: 'manual',
      successMetric: '>=80% of selected sources include relevance notes',
    },
    {
      id: 'research-source-comparison-matrix',
      title: 'Source Comparison Matrix',
      description: 'Compare methodologies, findings, and limitations across papers.',
      triggerType: 'manual',
      successMetric: 'Comparative matrix covers at least 3 dimensions per source',
    },
    {
      id: 'research-annotated-bibliography',
      title: 'Annotated Bibliography Generator',
      description: 'Produce concise annotations and quality tags per citation.',
      triggerType: 'schedule',
      successMetric: 'All active citations have annotation notes',
    },
    {
      id: 'research-writing-sprint-scheduler',
      title: 'Writing Sprint Scheduler',
      description: 'Plan focused writing blocks and section-level milestones.',
      triggerType: 'schedule',
      successMetric: 'Weekly section completion velocity is tracked',
    },
  ],
  knowledgeTemplates: [
    {
      id: 'research-paper-annotator',
      title: 'Paper Annotator',
      description: 'Capture hypotheses, methods, findings, and limitations.',
      seedPrompt: 'Annotate this paper with key claims, evidence quality, and unresolved questions.',
      tags: ['papers', 'annotation'],
    },
    {
      id: 'research-experiment-log',
      title: 'Experiment Log',
      description: 'Track experiment setup, changes, and outcomes.',
      seedPrompt: 'Log experiment conditions, assumptions, and observed outcomes with timestamps.',
      tags: ['experiments', 'logging'],
    },
    {
      id: 'research-thesis-outline',
      title: 'Thesis Outline',
      description: 'Maintain outline structure, evidence mapping, and section status.',
      seedPrompt: 'Generate and maintain a thesis outline with claim-evidence links.',
      tags: ['thesis', 'outline'],
    },
  ],
  decisionPresets: [
    {
      id: 'research-methodology-selection',
      title: 'Methodology Selection',
      description: 'Evaluate candidate methods by validity, cost, and execution risk.',
      criteria: ['validity', 'data_availability', 'time_cost', 'reproducibility'],
    },
    {
      id: 'research-publication-venue',
      title: 'Publication Venue Evaluator',
      description: 'Choose venue based on audience fit, review quality, and timeline.',
      criteria: ['audience_fit', 'review_rigor', 'timeline', 'acceptance_risk'],
    },
  ],
  uiPanels: ['research_dashboard', 'knowledge_workbench', 'decision_room'],
  safetyBoundaries: [
    {
      id: 'research-no-fabricated-citations',
      rule: 'Do not produce fabricated citations or unverifiable sources.',
      onViolation: 'Return explicit uncertainty and request verifiable source input.',
    },
  ],
  benchmarks: [
    createWeightedBenchmark({
      id: 'research-benchmark-core',
      title: 'Research Quality Core',
      description: 'Measures citation integrity, argument quality, and synthesis depth.',
      dimensions: [
        {
          id: 'citation_integrity',
          title: 'Citation integrity',
          weight: 0.4,
          target: 0.95,
          minimum: 0.85,
        },
        {
          id: 'argument_clarity',
          title: 'Argument clarity',
          weight: 0.3,
          target: 0.88,
          minimum: 0.72,
        },
        {
          id: 'synthesis_depth',
          title: 'Synthesis depth',
          weight: 0.3,
          target: 0.9,
          minimum: 0.75,
        },
      ],
    }),
  ],
};
