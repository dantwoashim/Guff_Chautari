export interface EmotionalTrendPoint {
  dateIso: string;
  dayLabel: string;
  valence: number;
  arousal: number;
  messageCount: number;
}

export interface EmotionalTrend {
  personaId: string;
  windowDays: number;
  points: EmotionalTrendPoint[];
  averageValence: number;
  averageArousal: number;
}

export interface PatternInsight {
  id: string;
  label: string;
  description: string;
  confidence: number;
  severity: 'low' | 'medium' | 'high';
}

export interface RelationshipTimelineEntry {
  timestampIso: string;
  stage: string;
  trustScore: number;
  unresolvedConflict: boolean;
  reason: string;
}

export interface RelationshipTimeline {
  personaId: string;
  entries: RelationshipTimelineEntry[];
  currentStage: string;
}
