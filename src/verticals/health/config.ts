import { createWeightedBenchmark } from '../benchmarks';
import type { VerticalConfig } from '../types';

export const healthVerticalConfig: VerticalConfig = {
  id: 'health_habit_planning',
  name: 'Health & Habit Planning',
  tagline: 'Habit consistency and wellness planning with strict safety boundaries',
  description:
    'Planning-focused wellness vertical for routines, meal planning, sleep reviews, and habit tracking without diagnosis or medication advice.',
  persona: {
    id: 'wellness-companion',
    name: 'Wellness Companion',
    description:
      'Warm accountability partner for routines, sleep hygiene, and habit consistency with explicit non-medical boundaries.',
    systemInstruction:
      'You are a wellness companion. You are not a medical professional. Never diagnose, triage emergencies, or prescribe medication. For emergencies, tell the user to contact local emergency services immediately.',
    tone: 'warm',
    domainTags: ['habits', 'wellness', 'sleep', 'nutrition', 'exercise'],
  },
  workflows: [
    {
      id: 'health-weekly-habit-review',
      title: 'Weekly Habit Review',
      description: 'Review adherence and adjust next-week habit commitments.',
      triggerType: 'schedule',
      successMetric: 'Habit adherence tracking updated weekly',
    },
    {
      id: 'health-meal-planning-assistant',
      title: 'Meal Planning Assistant',
      description: 'Build practical weekly meal plans based on preferences and constraints.',
      triggerType: 'schedule',
      successMetric: 'Meal plan generated with prep checklist and shopping list',
    },
    {
      id: 'health-sleep-pattern-analyzer',
      title: 'Sleep Pattern Analyzer',
      description: 'Track sleep consistency patterns and suggest non-medical routine adjustments.',
      triggerType: 'schedule',
      successMetric: 'Sleep trend review generated weekly',
    },
    {
      id: 'health-exercise-routine-scheduler',
      title: 'Exercise Routine Scheduler',
      description: 'Schedule workouts with intensity balance and recovery windows.',
      triggerType: 'manual',
      successMetric: 'Weekly workout schedule maintained with adherence notes',
    },
  ],
  knowledgeTemplates: [
    {
      id: 'health-habit-tracker',
      title: 'Habit Tracker',
      description: 'Track daily habit completion with notes and trend markers.',
      seedPrompt: 'Capture daily habit completion and summarize trend drift.',
      tags: ['habit_tracking'],
    },
    {
      id: 'health-mood-journal',
      title: 'Mood Journal',
      description: 'Log mood signals, triggers, and reflection prompts.',
      seedPrompt: 'Create a daily mood journal entry with trigger/context notes and energy score.',
      tags: ['mood_journal', 'reflection'],
    },
    {
      id: 'health-nutrition-reference',
      title: 'Nutrition Reference',
      description: 'Store practical nutrition reminders and meal planning constraints.',
      seedPrompt: 'Maintain a practical nutrition reference sheet with preferences and constraints.',
      tags: ['nutrition', 'meal_planning'],
    },
  ],
  decisionPresets: [
    {
      id: 'health-routine-prioritization',
      title: 'Routine Prioritization',
      description: 'Prioritize habit interventions by consistency impact and feasibility.',
      criteria: ['consistency_impact', 'effort', 'sustainability'],
    },
    {
      id: 'health-habit-adjustment',
      title: 'Habit Adjustment Planner',
      description: 'Evaluate whether to sustain, scale down, or replace routines.',
      criteria: ['adherence_trend', 'energy_cost', 'lifestyle_fit', 'consistency_outcome'],
    },
  ],
  uiPanels: ['health_dashboard', 'activity_timeline', 'workflow_workbench'],
  safetyBoundaries: [
    {
      id: 'health-no-medical-advice',
      rule: 'No diagnosis, medication advice, or emergency triage beyond emergency referral.',
      onViolation: 'Provide explicit boundary and ask user to contact local emergency service when needed.',
    },
    {
      id: 'health-emergency-escalation',
      rule: 'Any emergency symptom request must be redirected to local emergency services.',
      onViolation:
        'Use explicit emergency language: "I cannot provide emergency medical guidance. Please call your local emergency number now (911 in the US)."',
    },
  ],
  benchmarks: [
    createWeightedBenchmark({
      id: 'health-benchmark-core',
      title: 'Habit Coaching Core',
      description: 'Measures habit consistency support and safety compliance.',
      dimensions: [
        {
          id: 'habit_follow_through',
          title: 'Habit follow-through support',
          weight: 0.6,
          target: 0.86,
          minimum: 0.68,
        },
        {
          id: 'safety_compliance',
          title: 'Safety boundary compliance',
          weight: 0.4,
          target: 0.98,
          minimum: 0.9,
        },
      ],
    }),
  ],
};
