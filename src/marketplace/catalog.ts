import type {
  PersonaTemplate,
  TemplateCatalogQuery,
  TemplateItem,
  TemplateMetadata,
  TemplateRating,
  WorkflowTemplate,
} from './types';

const BASE_ISO = '2026-11-09T00:00:00.000Z';

const meta = (
  id: string,
  name: string,
  description: string,
  category: TemplateMetadata['category'],
  tags: string[],
  author = 'Ashim Core',
  featured = true
): TemplateMetadata => ({
  id,
  name,
  description,
  category,
  tags,
  author,
  version: '1.0.0',
  createdAtIso: BASE_ISO,
  updatedAtIso: BASE_ISO,
  featured,
});

export const curatedPersonaTemplates: PersonaTemplate[] = [
  {
    kind: 'persona',
    metadata: meta(
      'persona-coach',
      'Execution Coach',
      'Direct accountability coach focused on weekly outcomes.',
      'productivity',
      ['coach', 'accountability', 'planning']
    ),
    summary: 'Turns goals into weekly execution plans and direct next actions.',
    personaYaml: `version: "1.0"
core:
  name: "Execution Coach"
  essence: "Disciplined performance coach"
communication:
  tone: "direct"
  style: ["concise", "practical"]
behavior:
  response_pacing: "fast"
  conflict_style: "challenge assumptions"
boundaries:
  hard: ["No hype without measurable outcomes"]`,
  },
  {
    kind: 'persona',
    metadata: meta(
      'persona-reflector',
      'Reflective Companion',
      'Therapist-style reflective partner with boundaries.',
      'wellbeing',
      ['reflection', 'emotional', 'journaling']
    ),
    summary: 'Mirrors language, surfaces patterns, and asks grounded follow-up questions.',
    personaYaml: `version: "1.0"
core:
  name: "Reflective Companion"
  essence: "Calm reflection guide"
communication:
  tone: "warm"
  style: ["curious", "non-judgmental"]
behavior:
  response_pacing: "measured"
boundaries:
  hard: ["No medical claims", "No crisis handling claims"]`,
  },
  {
    kind: 'persona',
    metadata: meta(
      'persona-study-buddy',
      'Study Buddy',
      'Structured learning partner for revision cycles.',
      'learning',
      ['study', 'revision', 'exam']
    ),
    summary: 'Builds study sprints, quizzes understanding, and tracks weak concepts.',
    personaYaml: `version: "1.0"
core:
  name: "Study Buddy"
  essence: "Focused learning collaborator"
communication:
  tone: "encouraging"
  style: ["structured", "clear"]
behavior:
  response_pacing: "fast"
boundaries:
  hard: ["No fabricated citations"]`,
  },
  {
    kind: 'persona',
    metadata: meta(
      'persona-creative-collab',
      'Creative Collaborator',
      'Idea-expansion partner for writing, design, and storytelling.',
      'creative',
      ['creative', 'brainstorm', 'writing']
    ),
    summary: 'Generates divergent options first, then converges into chosen directions.',
    personaYaml: `version: "1.0"
core:
  name: "Creative Collaborator"
  essence: "Bold ideation partner"
communication:
  tone: "playful"
  style: ["divergent", "visual"]
behavior:
  response_pacing: "dynamic"
boundaries:
  hard: ["No plagiarism"]`,
  },
  {
    kind: 'persona',
    metadata: meta(
      'persona-coding-pair',
      'Coding Pair Partner',
      'Senior-level coding pair focused on correctness and speed.',
      'engineering',
      ['code', 'debugging', 'architecture']
    ),
    summary: 'Breaks down work into executable steps and catches edge cases early.',
    personaYaml: `version: "1.0"
core:
  name: "Coding Pair Partner"
  essence: "Pragmatic senior engineer"
communication:
  tone: "precise"
  style: ["factual", "implementation-first"]
behavior:
  response_pacing: "fast"
boundaries:
  hard: ["No insecure default patterns"]`,
  },
];

export const curatedWorkflowTemplates: WorkflowTemplate[] = [
  {
    kind: 'workflow',
    metadata: meta(
      'workflow-daily-email-summary',
      'Daily Email Summary',
      'Reads inbox and publishes summary with priorities.',
      'productivity',
      ['email', 'summary', 'daily']
    ),
    naturalLanguagePrompt: 'Summarize my inbox every morning with priorities.',
    connectorRequirements: ['email'],
    triggerType: 'schedule',
    steps: [
      {
        id: 'step-fetch-inbox',
        title: 'Fetch inbox',
        description: 'Pull recent inbox messages.',
        kind: 'connector',
        actionId: 'connector.email.fetch_inbox',
        inputTemplate: '{"limit":10}',
      },
      {
        id: 'step-summarize',
        title: 'Summarize',
        description: 'Summarize email highlights.',
        kind: 'transform',
        actionId: 'transform.summarize',
      },
      {
        id: 'step-artifact',
        title: 'Publish',
        description: 'Publish digest artifact.',
        kind: 'artifact',
        actionId: 'artifact.publish',
      },
    ],
  },
  {
    kind: 'workflow',
    metadata: meta(
      'workflow-meeting-notes-processor',
      'Meeting Notes Processor',
      'Converts rough notes into a clean decision/action log.',
      'operations',
      ['meeting', 'notes', 'actions']
    ),
    naturalLanguagePrompt: 'Transform meeting notes into decisions and action items.',
    connectorRequirements: [],
    triggerType: 'manual',
    steps: [
      {
        id: 'step-context',
        title: 'Collect context',
        description: 'Collect current context.',
        kind: 'transform',
        actionId: 'transform.collect_context',
      },
      {
        id: 'step-notes-summary',
        title: 'Synthesize notes',
        description: 'Extract decisions and actions.',
        kind: 'transform',
        actionId: 'transform.summarize',
      },
      {
        id: 'step-notes-artifact',
        title: 'Publish output',
        description: 'Publish final notes artifact.',
        kind: 'artifact',
        actionId: 'artifact.publish',
      },
    ],
  },
  {
    kind: 'workflow',
    metadata: meta(
      'workflow-research-assistant',
      'Research Assistant',
      'Searches knowledge pages and creates a concise research memo.',
      'learning',
      ['research', 'notion', 'summary']
    ),
    naturalLanguagePrompt: 'Research a topic using my notes and summarize key findings.',
    connectorRequirements: ['notion'],
    triggerType: 'manual',
    steps: [
      {
        id: 'step-notion-search',
        title: 'Search Notion',
        description: 'Find relevant pages.',
        kind: 'connector',
        actionId: 'connector.notion.search_pages',
        inputTemplate: '{"query":"research"}',
      },
      {
        id: 'step-research-synthesis',
        title: 'Build synthesis',
        description: 'Summarize relevant points.',
        kind: 'transform',
        actionId: 'transform.summarize',
      },
      {
        id: 'step-research-publish',
        title: 'Publish memo',
        description: 'Publish memo artifact.',
        kind: 'artifact',
        actionId: 'artifact.publish',
      },
    ],
  },
  {
    kind: 'workflow',
    metadata: meta(
      'workflow-journal-prompts',
      'Journal Prompt Generator',
      'Creates weekly reflective prompts based on prior outputs.',
      'wellbeing',
      ['journal', 'reflection', 'prompts']
    ),
    naturalLanguagePrompt: 'Generate reflective journal prompts every week.',
    connectorRequirements: [],
    triggerType: 'schedule',
    steps: [
      {
        id: 'step-journal-context',
        title: 'Collect reflection context',
        description: 'Collect recent context snapshots.',
        kind: 'transform',
        actionId: 'transform.collect_context',
      },
      {
        id: 'step-journal-generate',
        title: 'Generate prompts',
        description: 'Generate prompt set.',
        kind: 'transform',
        actionId: 'transform.summarize',
      },
      {
        id: 'step-journal-publish',
        title: 'Publish prompts',
        description: 'Publish prompt artifact.',
        kind: 'artifact',
        actionId: 'artifact.publish',
      },
    ],
  },
  {
    kind: 'workflow',
    metadata: meta(
      'workflow-weekly-review',
      'Weekly Review',
      'Aggregates workflows and outputs a weekly scorecard.',
      'productivity',
      ['weekly', 'review', 'scorecard']
    ),
    naturalLanguagePrompt: 'Generate a weekly review scorecard and next-week focus.',
    connectorRequirements: ['email', 'notion'],
    triggerType: 'schedule',
    steps: [
      {
        id: 'step-weekly-email',
        title: 'Fetch email',
        description: 'Pull inbox signals.',
        kind: 'connector',
        actionId: 'connector.email.fetch_inbox',
        inputTemplate: '{"limit":8}',
      },
      {
        id: 'step-weekly-notion',
        title: 'List pages',
        description: 'Pull workspace pages.',
        kind: 'connector',
        actionId: 'connector.notion.list_pages',
      },
      {
        id: 'step-weekly-summarize',
        title: 'Create scorecard',
        description: 'Summarize wins, misses, next actions.',
        kind: 'transform',
        actionId: 'transform.summarize',
      },
      {
        id: 'step-weekly-publish',
        title: 'Publish weekly review',
        description: 'Write weekly review artifact.',
        kind: 'artifact',
        actionId: 'artifact.publish',
      },
    ],
  },
];

export const curatedTemplates: TemplateItem[] = [
  ...curatedPersonaTemplates,
  ...curatedWorkflowTemplates,
];

const toMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const normalizeSearch = (value: string): string => value.trim().toLowerCase();

const dedupeByTemplateId = (templates: ReadonlyArray<TemplateItem>): TemplateItem[] => {
  const map = new Map<string, TemplateItem>();
  for (const template of templates) {
    const existing = map.get(template.metadata.id);
    if (!existing) {
      map.set(template.metadata.id, template);
      continue;
    }

    const existingTs = Math.max(toMs(existing.metadata.updatedAtIso), toMs(existing.metadata.createdAtIso));
    const incomingTs = Math.max(toMs(template.metadata.updatedAtIso), toMs(template.metadata.createdAtIso));
    map.set(template.metadata.id, incomingTs >= existingTs ? template : existing);
  }
  return [...map.values()];
};

export const mergeTemplateCatalog = (payload: {
  curated: ReadonlyArray<TemplateItem>;
  communityApproved: ReadonlyArray<TemplateItem>;
}): TemplateItem[] => {
  return dedupeByTemplateId([...payload.curated, ...payload.communityApproved]);
};

const matchesTemplateQuery = (template: TemplateItem, query: TemplateCatalogQuery): boolean => {
  const kind = query.kind ?? 'all';
  if (kind !== 'all' && template.kind !== kind) return false;

  const category = query.category ?? 'all';
  if (category !== 'all' && template.metadata.category !== category) return false;

  const author = query.author?.trim().toLowerCase();
  if (author && template.metadata.author.toLowerCase() !== author) return false;

  if (query.tags && query.tags.length > 0) {
    const candidateTags = new Set(template.metadata.tags.map((tag) => tag.toLowerCase()));
    const requiredTags = query.tags.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0);
    const hasAllTags = requiredTags.every((tag) => candidateTags.has(tag));
    if (!hasAllTags) return false;
  }

  const search = normalizeSearch(query.search ?? '');
  if (search.length === 0) return true;
  const haystack = [
    template.metadata.name,
    template.metadata.description,
    template.metadata.author,
    template.metadata.tags.join(' '),
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(search);
};

export const filterTemplateCatalog = (
  templates: ReadonlyArray<TemplateItem>,
  query: TemplateCatalogQuery
): TemplateItem[] => {
  return templates.filter((template) => matchesTemplateQuery(template, query));
};

const ratingForTemplate = (
  ratings: Record<string, TemplateRating> | undefined,
  templateId: string
): number => {
  if (!ratings) return 0;
  return ratings[templateId]?.average ?? 0;
};

const isFeaturedTemplate = (payload: {
  template: TemplateItem;
  featuredTemplateIds?: ReadonlySet<string>;
}): boolean => {
  if (payload.template.metadata.featured) return true;
  return Boolean(payload.featuredTemplateIds?.has(payload.template.metadata.id));
};

const isCertifiedTemplate = (payload: {
  template: TemplateItem;
  certifiedTemplateIds?: ReadonlySet<string>;
}): boolean => {
  return Boolean(payload.certifiedTemplateIds?.has(payload.template.metadata.id));
};

export const sortTemplateCatalog = (
  templates: ReadonlyArray<TemplateItem>,
  options: {
    ratings?: Record<string, TemplateRating>;
    featuredTemplateIds?: ReadonlySet<string>;
    certifiedTemplateIds?: ReadonlySet<string>;
  } = {}
): TemplateItem[] => {
  return [...templates].sort((left, right) => {
    const leftFeatured = isFeaturedTemplate({ template: left, featuredTemplateIds: options.featuredTemplateIds });
    const rightFeatured = isFeaturedTemplate({ template: right, featuredTemplateIds: options.featuredTemplateIds });
    if (leftFeatured !== rightFeatured) return leftFeatured ? -1 : 1;

    const leftCertified = isCertifiedTemplate({
      template: left,
      certifiedTemplateIds: options.certifiedTemplateIds,
    });
    const rightCertified = isCertifiedTemplate({
      template: right,
      certifiedTemplateIds: options.certifiedTemplateIds,
    });
    if (leftCertified !== rightCertified) return leftCertified ? -1 : 1;

    const leftRating = ratingForTemplate(options.ratings, left.metadata.id);
    const rightRating = ratingForTemplate(options.ratings, right.metadata.id);
    if (leftRating !== rightRating) return rightRating - leftRating;

    const leftNewest = Math.max(toMs(left.metadata.updatedAtIso), toMs(left.metadata.createdAtIso));
    const rightNewest = Math.max(toMs(right.metadata.updatedAtIso), toMs(right.metadata.createdAtIso));
    if (leftNewest !== rightNewest) return rightNewest - leftNewest;

    return left.metadata.name.localeCompare(right.metadata.name);
  });
};
