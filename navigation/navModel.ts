import type { ComponentType } from 'react';
import {
  Activity,
  Briefcase,
  Compass,
  Layers,
  MessageSquare,
  Sparkles,
} from '../components/Icons';
import type { PrimaryAreaId } from './viewRegistry';

export interface PrimaryAreaNavItem {
  id: PrimaryAreaId;
  title: string;
  subtitle: string;
  icon: ComponentType<any>;
}

export const PRIMARY_NAV_ITEMS: PrimaryAreaNavItem[] = [
  {
    id: 'inbox',
    title: 'Inbox',
    subtitle: 'Conversations and active sessions',
    icon: MessageSquare,
  },
  {
    id: 'decision_room',
    title: 'Decision Room',
    subtitle: 'Branch analysis and scenario paths',
    icon: Compass,
  },
  {
    id: 'builder',
    title: 'Builder',
    subtitle: 'Persona design and cognitive modeling',
    icon: Sparkles,
  },
  {
    id: 'workflows',
    title: 'Workflows',
    subtitle: 'Operational memory and execution tools',
    icon: Layers,
  },
  {
    id: 'insights',
    title: 'Insights',
    subtitle: 'Forecasting and intelligence dashboards',
    icon: Activity,
  },
  {
    id: 'workspace',
    title: 'Workspace',
    subtitle: 'Verification, operations, and governance',
    icon: Briefcase,
  },
];
