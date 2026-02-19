import { createWeightedBenchmark } from '../benchmarks';
import type { VerticalConfig } from '../types';

export const founderVerticalConfig: VerticalConfig = {
  id: 'founder_os',
  name: 'Founder OS',
  tagline: 'Execution engine for founders and operators',
  description:
    'Combines execution coaching, founder workflows, strategic knowledge templates, and high-pressure decision presets.',
  persona: {
    id: 'founder-execution-coach',
    name: 'Execution Coach',
    description:
      'Direct founder advisor focused on fundraising discipline, hiring leverage, and product execution loops.',
    systemInstruction:
      'You are an execution coach for founders. Be concrete, metrics-driven, and explicit about tradeoffs. Prioritize weekly outcomes over narrative comfort.',
    tone: 'direct',
    domainTags: ['fundraising', 'hiring', 'product_strategy', 'execution'],
  },
  workflows: [
    {
      id: 'founder-weekly-okr-review',
      title: 'Weekly OKR Review',
      description: 'Evaluate objective progress, blockers, and next-week focus.',
      triggerType: 'schedule',
      successMetric: '>=90% OKR review completion rate',
    },
    {
      id: 'founder-investor-update-drafter',
      title: 'Investor Update Drafter',
      description: 'Draft concise weekly investor updates with traction and asks.',
      triggerType: 'schedule',
      successMetric: 'Investor updates sent weekly with clear KPI deltas',
    },
    {
      id: 'founder-hiring-pipeline-tracker',
      title: 'Hiring Pipeline Tracker',
      description: 'Track role funnel health and hiring bottlenecks.',
      triggerType: 'manual',
      successMetric: 'Open roles maintain healthy candidate pipeline',
    },
    {
      id: 'founder-sprint-planning',
      title: 'Sprint Planning',
      description: 'Map priorities into a focused sprint plan with owners and risk flags.',
      triggerType: 'schedule',
      successMetric: 'Sprint goals map to top company objective',
    },
  ],
  knowledgeTemplates: [
    {
      id: 'founder-pitch-deck-analyzer',
      title: 'Pitch Deck Analyzer',
      description: 'Evaluates narrative clarity, traction proof, and objection risks.',
      seedPrompt: 'Analyze the pitch deck for weak claims, missing metrics, and investor objection vectors.',
      tags: ['pitch_deck', 'fundraising'],
    },
    {
      id: 'founder-market-research-synthesizer',
      title: 'Market Research Synthesizer',
      description: 'Consolidates market notes into actionable positioning insights.',
      seedPrompt: 'Synthesize market research into TAM assumptions, competitive gaps, and positioning thesis.',
      tags: ['market_research', 'positioning'],
    },
    {
      id: 'founder-competitive-landscape',
      title: 'Competitive Landscape',
      description: 'Tracks competitor moves, strengths, and likely strategic responses.',
      seedPrompt: 'Build a competitive landscape with capability matrix and likely counter-moves.',
      tags: ['competition', 'strategy'],
    },
  ],
  decisionPresets: [
    {
      id: 'founder-fundraise-vs-bootstrap',
      title: 'Fundraise vs Bootstrap',
      description: 'Trade capital acceleration against dilution and execution constraints.',
      criteria: ['runway_extension', 'growth_velocity', 'ownership_cost', 'execution_risk'],
    },
    {
      id: 'founder-hire-vs-outsource',
      title: 'Hire vs Outsource',
      description: 'Compare capability depth, speed, cost, and dependency risk.',
      criteria: ['time_to_output', 'quality_control', 'cost', 'team_leverage'],
    },
  ],
  uiPanels: ['founder_dashboard', 'decision_room', 'workflow_workbench', 'activity_timeline'],
  safetyBoundaries: [
    {
      id: 'founder-no-guarantees',
      rule: 'Do not guarantee funding, growth, or outcome certainty.',
      onViolation: 'Respond with calibrated uncertainty and explicit risk statement.',
    },
  ],
  benchmarks: [
    createWeightedBenchmark({
      id: 'founder-benchmark-core',
      title: 'Founder Execution Core',
      description: 'Measures decision quality and weekly execution discipline.',
      dimensions: [
        {
          id: 'decision_consistency',
          title: 'Decision consistency in ambiguous situations',
          weight: 0.4,
          target: 0.85,
          minimum: 0.65,
        },
        {
          id: 'follow_through_rate',
          title: 'Follow-through on weekly commitments',
          weight: 0.35,
          target: 0.9,
          minimum: 0.7,
        },
        {
          id: 'okr_tracking_accuracy',
          title: 'OKR tracking and status accuracy',
          weight: 0.25,
          target: 0.92,
          minimum: 0.75,
        },
      ],
    }),
  ],
};
