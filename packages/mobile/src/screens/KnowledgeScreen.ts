export interface KnowledgeEntry {
  id: string;
  title: string;
  type: 'note' | 'file' | 'url' | 'voice_note';
  createdAtIso: string;
  content: string;
}

export interface KnowledgeScreenState {
  entries: KnowledgeEntry[];
  query: string;
  selectedEntryId: string | null;
}

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export const createKnowledgeScreenState = (): KnowledgeScreenState => ({
  entries: [],
  query: '',
  selectedEntryId: null,
});

export const addKnowledgeVoiceNote = (
  state: KnowledgeScreenState,
  payload: {
    id: string;
    title: string;
    transcript: string;
    createdAtIso: string;
  }
): KnowledgeScreenState => ({
  ...state,
  entries: [
    {
      id: payload.id,
      title: payload.title,
      type: 'voice_note',
      createdAtIso: payload.createdAtIso,
      content: payload.transcript,
    },
    ...state.entries,
  ],
});

export const setKnowledgeQuery = (state: KnowledgeScreenState, query: string): KnowledgeScreenState => ({
  ...state,
  query,
});

export const listVisibleKnowledgeEntries = (state: KnowledgeScreenState): KnowledgeEntry[] => {
  const normalizedQuery = normalize(state.query);
  if (!normalizedQuery) return [...state.entries];

  return state.entries.filter((entry) => {
    const haystack = normalize(`${entry.title} ${entry.content}`);
    return haystack.includes(normalizedQuery);
  });
};
