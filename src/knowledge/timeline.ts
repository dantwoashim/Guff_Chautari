import { KnowledgeGraphStore, knowledgeGraphStore } from './store';
import type { KnowledgeTimelineItem } from './types';

const toMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const previewText = (text: string, maxLength = 180): string => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
};

export const listKnowledgeTimeline = (
  payload: {
    userId: string;
    term?: string;
    type?: 'all' | 'note' | 'file' | 'url';
  },
  store: KnowledgeGraphStore = knowledgeGraphStore
): KnowledgeTimelineItem[] => {
  const state = store.load(payload.userId);
  const term = payload.term?.toLowerCase().trim() || '';
  const type = payload.type && payload.type !== 'all' ? payload.type : null;

  return state.sources
    .filter((source) => (type ? source.type === type : true))
    .filter((source) => {
      if (!term) return true;
      return (
        source.title.toLowerCase().includes(term) ||
        source.text.toLowerCase().includes(term) ||
        source.uri?.toLowerCase().includes(term)
      );
    })
    .map((source) => ({
      sourceId: source.id,
      title: source.title,
      type: source.type,
      createdAtIso: source.createdAtIso,
      preview: previewText(source.text),
      nodeCount: state.nodes.filter((node) => node.sourceId === source.id).length,
    }))
    .sort((left, right) => toMs(right.createdAtIso) - toMs(left.createdAtIso));
};

export const getKnowledgeSourceContext = (
  payload: {
    userId: string;
    sourceId: string;
    nodeId?: string;
  },
  store: KnowledgeGraphStore = knowledgeGraphStore
): { title: string; text: string; chunkText?: string } | null => {
  const state = store.load(payload.userId);
  const source = state.sources.find((candidate) => candidate.id === payload.sourceId);
  if (!source) return null;
  const chunk = payload.nodeId
    ? state.nodes.find((node) => node.id === payload.nodeId && node.sourceId === source.id)
    : undefined;

  return {
    title: source.title,
    text: source.text,
    chunkText: chunk?.text,
  };
};
