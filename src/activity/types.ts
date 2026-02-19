export type ActivityCategory =
  | 'chat'
  | 'knowledge'
  | 'decision'
  | 'workflow'
  | 'reflection'
  | 'plugin'
  | 'outcome';

export interface ActivityEvent {
  id: string;
  userId: string;
  category: ActivityCategory;
  eventType: string;
  title: string;
  description: string;
  createdAtIso: string;
  threadId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface ActivityEventInput {
  userId: string;
  category: ActivityCategory;
  eventType: string;
  title: string;
  description: string;
  createdAtIso?: string;
  threadId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface TimelineFilter {
  categories?: ActivityCategory[];
  searchTerm?: string;
  dateFromIso?: string;
  dateToIso?: string;
}

export interface ActivityTimelineGroup {
  dateLabel: string;
  events: ActivityEvent[];
}

export interface WeeklyActivitySummary {
  weekStartIso: string;
  weekEndIso: string;
  totalEvents: number;
  countsByCategory: Record<ActivityCategory, number>;
  topEventTypes: Array<{
    eventType: string;
    count: number;
  }>;
}

export interface WeeklyBriefing {
  title: string;
  generatedAtIso: string;
  summary: string;
  highlights: string[];
  followUps: string[];
}

export interface ActivityStoreState {
  events: ActivityEvent[];
  updatedAtIso: string;
}

export interface ActivityStoreAdapter {
  load: (userId: string) => ActivityStoreState;
  save: (userId: string, state: ActivityStoreState) => void;
}
