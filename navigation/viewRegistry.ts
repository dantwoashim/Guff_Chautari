import type { AppViewId } from '../types';

export type PrimaryAreaId =
  | 'inbox'
  | 'decision_room'
  | 'builder'
  | 'workflows'
  | 'insights'
  | 'workspace';

export interface ViewRegistryEntry {
  id: AppViewId;
  title: string;
  area: PrimaryAreaId;
  category: string;
  isCore: boolean;
  description: string;
}

export const VIEW_REGISTRY: ViewRegistryEntry[] = [
  {
    id: 'chat',
    title: 'Inbox',
    area: 'inbox',
    category: 'Conversations',
    isCore: true,
    description: 'Primary chat experience and ongoing sessions.',
  },
  {
    id: 'video_call',
    title: 'Video Continuum',
    area: 'inbox',
    category: 'Conversations',
    isCore: false,
    description: 'Real-time voice and video interactions.',
  },
  {
    id: 'voice_lab',
    title: 'Voice Lab',
    area: 'inbox',
    category: 'Conversations',
    isCore: false,
    description: 'Voice cloning, testing, and tuning workflows.',
  },
  {
    id: 'dreams',
    title: 'Dream Gallery',
    area: 'inbox',
    category: 'Conversations',
    isCore: false,
    description: 'Generated concepts and visual memory explorations.',
  },
  {
    id: 'oracle',
    title: 'Oracle Dashboard',
    area: 'insights',
    category: 'Intelligence',
    isCore: true,
    description: 'Predictive insights and recommendation workflows.',
  },
  {
    id: 'branching',
    title: 'Decision Branching',
    area: 'decision_room',
    category: 'Decisioning',
    isCore: true,
    description: 'Compare alternate outcomes and branch paths.',
  },
  {
    id: 'memory_palace',
    title: 'Memory Palace',
    area: 'workflows',
    category: 'Memory',
    isCore: true,
    description: 'Structured memory exploration and recall management.',
  },
  {
    id: 'dna_vault',
    title: 'Cognitive DNA Vault',
    area: 'builder',
    category: 'Persona Engineering',
    isCore: true,
    description: 'Model persona identity and behavior architecture.',
  },
  {
    id: 'verification',
    title: 'System Verification',
    area: 'workspace',
    category: 'Operations',
    isCore: true,
    description: 'Operational checks, validation, and diagnostics.',
  },
  {
    id: 'admin',
    title: 'Admin Dashboard',
    area: 'workspace',
    category: 'Operations',
    isCore: false,
    description: 'Administrative configuration and governance tools.',
  },
];

export const getViewEntry = (viewId: AppViewId): ViewRegistryEntry => {
  const found = VIEW_REGISTRY.find((entry) => entry.id === viewId);
  return found ?? VIEW_REGISTRY[0];
};

export const getViewsByArea = (area: PrimaryAreaId): ViewRegistryEntry[] => {
  return VIEW_REGISTRY.filter((entry) => entry.area === area);
};

export const resolveAreaForView = (viewId: AppViewId): PrimaryAreaId => {
  return getViewEntry(viewId).area;
};

export const APPS_LIBRARY_VIEWS: ViewRegistryEntry[] = VIEW_REGISTRY.filter((entry) => !entry.isCore);
