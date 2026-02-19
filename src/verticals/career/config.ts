import { createWeightedBenchmark } from '../benchmarks';
import type { VerticalConfig } from '../types';

export const careerVerticalConfig: VerticalConfig = {
  id: 'career_studio',
  name: 'Career Studio',
  tagline: 'Career strategy, interview execution, and long-term growth planning',
  description:
    'Domain preset for resume tailoring, interview loops, skill gap analysis, networking follow-ups, and offer decisions.',
  persona: {
    id: 'career-strategist',
    name: 'Career Strategist',
    description: 'Direct, goal-oriented advisor for role strategy and market-aware career decisions.',
    systemInstruction:
      'You are a career strategist. Give practical, market-aware guidance, request evidence when assumptions are weak, and never guarantee employment outcomes.',
    tone: 'direct',
    domainTags: ['career', 'interview', 'resume', 'networking', 'compensation'],
  },
  workflows: [
    {
      id: 'career-resume-tailor',
      title: 'Resume Tailoring by Job',
      description: 'Align resume content to target role requirements.',
      triggerType: 'manual',
      successMetric: 'Role-specific resume quality score >= 0.8',
    },
    {
      id: 'career-interview-prep-generator',
      title: 'Interview Prep Generator',
      description: 'Generate question bank, STAR examples, and risk responses by role.',
      triggerType: 'manual',
      successMetric: 'Interview prep packet created for each active loop',
    },
    {
      id: 'career-skill-gap-analyzer',
      title: 'Skill Gap Analyzer',
      description: 'Compare target role requirements against current profile and plan deltas.',
      triggerType: 'schedule',
      successMetric: 'Top 3 skill gaps tracked with weekly progress',
    },
    {
      id: 'career-network-followup-tracker',
      title: 'Networking Follow-Up Tracker',
      description: 'Track outreach follow-ups with context, status, and next touchpoints.',
      triggerType: 'schedule',
      successMetric: '>=85% follow-ups completed within target window',
    },
  ],
  knowledgeTemplates: [
    {
      id: 'career-timeline',
      title: 'Career Timeline',
      description: 'Structured timeline of roles, outcomes, and growth inflection points.',
      seedPrompt: 'Build a career timeline with role scope, measurable outcomes, and lessons learned.',
      tags: ['career', 'timeline'],
    },
    {
      id: 'career-company-research',
      title: 'Company Research',
      description: 'Track company context and role-specific signals.',
      seedPrompt: 'Summarize company strategy, role fit, and interview focus areas.',
      tags: ['career', 'company_research'],
    },
    {
      id: 'career-salary-benchmark',
      title: 'Salary Benchmarking',
      description: 'Compare compensation structure by market, level, and growth path.',
      seedPrompt: 'Create salary benchmark ranges with base, bonus, equity, and risk tradeoffs.',
      tags: ['career', 'compensation', 'benchmarking'],
    },
  ],
  decisionPresets: [
    {
      id: 'career-offer-comparison',
      title: 'Offer Comparison Evaluator',
      description: 'Compare offers on growth, compensation, and long-term optionality.',
      criteria: ['compensation', 'growth', 'stability', 'role_scope'],
    },
    {
      id: 'career-pivot-analyzer',
      title: 'Career Pivot Analyzer',
      description: 'Evaluate staying course versus pivoting role, industry, or function.',
      criteria: ['learning_curve', 'market_demand', 'short_term_risk', 'long_term_optionality'],
    },
  ],
  uiPanels: ['career_dashboard', 'decision_room', 'workflow_workbench'],
  safetyBoundaries: [
    {
      id: 'career-no-guarantees',
      rule: 'Do not guarantee job offers or promotion outcomes.',
      onViolation: 'Provide probabilistic framing and contingency options.',
    },
    {
      id: 'career-no-fabricated-market-claims',
      rule: 'Do not fabricate salary, hiring, or company facts.',
      onViolation: 'State uncertainty and request verifiable context or source links.',
    },
  ],
  benchmarks: [
    createWeightedBenchmark({
      id: 'career-benchmark-core',
      title: 'Career Outcomes Core',
      description: 'Measures interview prep quality and decision rigor.',
      dimensions: [
        {
          id: 'interview_readiness',
          title: 'Interview readiness',
          weight: 0.35,
          target: 0.88,
          minimum: 0.7,
        },
        {
          id: 'decision_rigor',
          title: 'Decision rigor',
          weight: 0.35,
          target: 0.85,
          minimum: 0.68,
        },
        {
          id: 'market_alignment',
          title: 'Market alignment for target role strategy',
          weight: 0.3,
          target: 0.86,
          minimum: 0.7,
        },
      ],
    }),
  ],
};
