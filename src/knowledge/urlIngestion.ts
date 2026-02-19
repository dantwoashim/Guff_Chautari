import {
  extractTextFromHtml,
  extractTitleFromHtml,
  ingestKnowledgeUrl,
} from './ingestion';
import { KnowledgeGraphStore, knowledgeGraphStore } from './store';
import type { IngestKnowledgeResult } from './types';

interface FetchLikeResponse {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}

export interface UrlIngestionDependencies {
  fetchHtml: (url: string) => Promise<FetchLikeResponse>;
}

const defaultDependencies: UrlIngestionDependencies = {
  fetchHtml: (url) => fetch(url),
};

export const ingestKnowledgeFromUrl = async (
  payload: {
    userId: string;
    url: string;
    titleOverride?: string;
  },
  store: KnowledgeGraphStore = knowledgeGraphStore,
  dependencies: UrlIngestionDependencies = defaultDependencies
): Promise<IngestKnowledgeResult> => {
  const response = await dependencies.fetchHtml(payload.url);
  if (!response.ok) {
    throw new Error(`Failed to fetch URL content (status ${response.status}).`);
  }

  const html = await response.text();
  const text = extractTextFromHtml(html);
  if (text.length < 120) {
    throw new Error('Fetched URL content is too short after boilerplate removal.');
  }

  const title =
    payload.titleOverride?.trim() || extractTitleFromHtml(html) || new URL(payload.url).hostname;

  return ingestKnowledgeUrl(
    {
      userId: payload.userId,
      title,
      url: payload.url,
      text,
    },
    store
  );
};
