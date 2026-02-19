import { ingestKnowledgeNote } from '../knowledge';
import { installTemplate, listInstalledTemplateIds } from './manager';
import { recordMarketplaceInstallEvent } from './analytics';
import { verticalRuntime } from '../verticals';

export type VerticalPackId = string;

export interface VerticalPackDefinition {
  id: VerticalPackId;
  name: string;
  description: string;
  audience: string;
  featured: boolean;
  premium?: boolean;
  verticalConfigId?: string;
  components: {
    personaTemplateId: string;
    workflowTemplateId: string;
    knowledgeTemplate: {
      title: string;
      text: string;
      tags: string[];
    };
  };
}

export interface VerticalPackPreview {
  pack: VerticalPackDefinition;
  installedTemplateIds: string[];
  missingTemplateIds: string[];
  ready: boolean;
}

export interface VerticalPackInstallResult {
  ok: boolean;
  pack: VerticalPackDefinition;
  installedTemplateIds: string[];
  installedWorkflowIds: string[];
  ingestedKnowledgeSourceIds: string[];
  summary: string;
}

export const BUILT_IN_VERTICAL_PACKS: ReadonlyArray<VerticalPackDefinition> = [
  {
    id: 'research_writing_lab',
    name: 'Research & Writing Lab',
    description:
      'Methodical research partner pack for citation-safe synthesis, writing progress, and source comparison loops.',
    audience: 'Researchers, students, and technical writers',
    featured: true,
    premium: true,
    verticalConfigId: 'research_writing_lab',
    components: {
      personaTemplateId: 'persona-study-buddy',
      workflowTemplateId: 'workflow-research-assistant',
      knowledgeTemplate: {
        title: 'Research Citation Integrity Playbook',
        text:
          'Track each claim with source evidence. Mark uncertain claims explicitly. Never present unverified citations as facts.',
        tags: ['research', 'citations', 'writing-lab'],
      },
    },
  },
  {
    id: 'career_studio',
    name: 'Career Studio',
    description:
      'Career strategist pack for interview prep, skill-gap planning, and structured offer/pivot decisions.',
    audience: 'Job seekers and career transition professionals',
    featured: true,
    premium: true,
    verticalConfigId: 'career_studio',
    components: {
      personaTemplateId: 'persona-coach',
      workflowTemplateId: 'workflow-weekly-review',
      knowledgeTemplate: {
        title: 'Career Transition Operating Cadence',
        text:
          'Run one role-focused execution loop each week: target role analysis, resume tailoring, outreach follow-ups, and interview reflection.',
        tags: ['career', 'interview', 'offer'],
      },
    },
  },
  {
    id: 'health_habit_planning',
    name: 'Health & Habit Planning',
    description:
      'Wellness planning pack with strict non-medical boundaries, routine scheduling, and consistency tracking.',
    audience: 'Habit builders and wellness-focused users',
    featured: true,
    premium: true,
    verticalConfigId: 'health_habit_planning',
    components: {
      personaTemplateId: 'persona-reflector',
      workflowTemplateId: 'workflow-journal-prompts',
      knowledgeTemplate: {
        title: 'Habit Consistency Protocol',
        text:
          'Focus on simple, repeatable routines. Track adherence and context triggers weekly. Escalate emergency concerns to local emergency services.',
        tags: ['health', 'habits', 'wellness'],
      },
    },
  },
  {
    id: 'founder_os',
    name: 'Founder OS',
    description:
      'Execution coach persona, weekly review workflow, and strategic operating note for founder cadence.',
    audience: 'Founders and operators',
    featured: true,
    premium: true,
    verticalConfigId: 'founder_os',
    components: {
      personaTemplateId: 'persona-coach',
      workflowTemplateId: 'workflow-weekly-review',
      knowledgeTemplate: {
        title: 'Founder Operating Cadence',
        text:
          'Run one measurable weekly objective. Every Monday pick one metric. Every day run top 3 execution tasks. Every Friday review wins, misses, and countermeasures for next week.',
        tags: ['founder', 'operating-system', 'weekly-review'],
      },
    },
  },
  {
    id: 'student_os',
    name: 'Student OS',
    description:
      'Study buddy persona, research workflow, and spaced revision guidance for focused learning loops.',
    audience: 'Students and self-learners',
    featured: true,
    components: {
      personaTemplateId: 'persona-study-buddy',
      workflowTemplateId: 'workflow-research-assistant',
      knowledgeTemplate: {
        title: 'Spaced Revision Protocol',
        text:
          'Use 25-minute focus blocks, daily recall checks, and weekly synthesis notes. Track weak concepts and revisit them at increasing intervals to improve long-term retention.',
        tags: ['student', 'revision', 'learning-loop'],
      },
    },
  },
  {
    id: 'engineering_lead_os',
    name: 'Engineering Lead OS',
    description:
      'Coding pair persona, meeting notes processor workflow, and execution rubric for sprint leadership.',
    audience: 'Engineering leads and technical managers',
    featured: true,
    components: {
      personaTemplateId: 'persona-coding-pair',
      workflowTemplateId: 'workflow-meeting-notes-processor',
      knowledgeTemplate: {
        title: 'Engineering Lead Sprint Rubric',
        text:
          'Define sprint outcomes before tasks. Convert meetings into explicit decisions and action owners. Track risk register weekly and escalate blockers within 24 hours.',
        tags: ['engineering', 'leadership', 'sprint'],
      },
    },
  },
  {
    id: 'writers_studio_os',
    name: "Writer's Studio OS",
    description:
      'Creative collaborator persona, journal prompt workflow, and repeatable drafting framework.',
    audience: 'Writers and creators',
    featured: true,
    components: {
      personaTemplateId: 'persona-creative-collab',
      workflowTemplateId: 'workflow-journal-prompts',
      knowledgeTemplate: {
        title: 'Writer Draft Loop',
        text:
          'Draft quickly first, revise structure second, refine voice last. Keep an idea backlog, a weekly theme, and a post-publication reflection to improve consistency.',
        tags: ['writing', 'creative', 'drafting'],
      },
    },
  },
];

const normalizeSearch = (value: string): string => value.trim().toLowerCase();

export const listVerticalPacks = (payload: {
  search?: string;
  featuredOnly?: boolean;
  premiumOnly?: boolean;
} = {}): VerticalPackDefinition[] => {
  const search = normalizeSearch(payload.search ?? '');

  return BUILT_IN_VERTICAL_PACKS
    .filter((pack) => (payload.featuredOnly ? pack.featured : true))
    .filter((pack) => (payload.premiumOnly ? pack.premium === true : true))
    .filter((pack) => {
      if (!search) return true;
      const haystack = [
        pack.name,
        pack.description,
        pack.audience,
        pack.components.knowledgeTemplate.title,
        pack.components.knowledgeTemplate.tags.join(' '),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(search);
    })
    .sort((left, right) => {
      if (left.featured !== right.featured) return left.featured ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
};

export const getVerticalPackById = (packId: VerticalPackId): VerticalPackDefinition | null => {
  return BUILT_IN_VERTICAL_PACKS.find((pack) => pack.id === packId) ?? null;
};

export const previewVerticalPack = (payload: {
  userId: string;
  packId: VerticalPackId;
}): VerticalPackPreview => {
  const pack = getVerticalPackById(payload.packId);
  if (!pack) {
    throw new Error(`Pack ${payload.packId} not found.`);
  }

  const installedTemplateIds = new Set(listInstalledTemplateIds(payload.userId));
  const requiredTemplateIds = [
    pack.components.personaTemplateId,
    pack.components.workflowTemplateId,
  ];
  const missingTemplateIds = requiredTemplateIds.filter(
    (templateId) => !installedTemplateIds.has(templateId)
  );

  return {
    pack,
    installedTemplateIds: requiredTemplateIds.filter((templateId) =>
      installedTemplateIds.has(templateId)
    ),
    missingTemplateIds,
    ready: missingTemplateIds.length === 0,
  };
};

export const installVerticalPack = (payload: {
  userId: string;
  packId: VerticalPackId;
  nowIso?: string;
  workspaceId?: string;
  workspaceProfileKey?: string;
}): VerticalPackInstallResult => {
  const pack = getVerticalPackById(payload.packId);
  if (!pack) {
    throw new Error(`Pack ${payload.packId} not found.`);
  }

  const nowIso = payload.nowIso ?? new Date().toISOString();

  const personaInstall = installTemplate({
    userId: payload.userId,
    templateId: pack.components.personaTemplateId,
    workspaceId: payload.workspaceId,
    workspaceProfileKey: payload.workspaceProfileKey,
    nowIso,
  });
  if (!personaInstall.ok) {
    throw new Error(
      `Failed to install persona template ${pack.components.personaTemplateId}: ${personaInstall.summary}`
    );
  }

  const workflowInstall = installTemplate({
    userId: payload.userId,
    templateId: pack.components.workflowTemplateId,
    workspaceId: payload.workspaceId,
    workspaceProfileKey: payload.workspaceProfileKey,
    nowIso,
  });
  if (!workflowInstall.ok) {
    throw new Error(
      `Failed to install workflow template ${pack.components.workflowTemplateId}: ${workflowInstall.summary}`
    );
  }

  const knowledgeIngestion = ingestKnowledgeNote({
    userId: payload.userId,
    title: pack.components.knowledgeTemplate.title,
    text: pack.components.knowledgeTemplate.text,
    nowIso,
    tags: ['vertical-pack', pack.id, ...pack.components.knowledgeTemplate.tags],
  });

  const installedTemplateIds = [
    pack.components.personaTemplateId,
    pack.components.workflowTemplateId,
  ];

  if (pack.verticalConfigId) {
    const vertical = verticalRuntime.getConfig(pack.verticalConfigId);
    if (vertical) {
      const workspaceId = payload.workspaceId ?? `workspace-${payload.userId}`;
      verticalRuntime.activate({
        workspaceId,
        userId: payload.userId,
        verticalId: vertical.id,
        nowIso,
      });
    }
  }

  recordMarketplaceInstallEvent({
    userId: payload.userId,
    subjectType: 'pack',
    subjectId: pack.id,
    workspaceId: payload.workspaceId,
    workspaceProfileKey: payload.workspaceProfileKey,
    nowIso,
  });

  return {
    ok: true,
    pack,
    installedTemplateIds,
    installedWorkflowIds: workflowInstall.installedWorkflowId
      ? [workflowInstall.installedWorkflowId]
      : [],
    ingestedKnowledgeSourceIds: [knowledgeIngestion.source.id],
    summary: `${pack.name} installed (${installedTemplateIds.length} templates + knowledge starter).`,
  };
};
