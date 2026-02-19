import type {
  KnowledgeCitation,
  KnowledgeRetrievalResult,
  KnowledgeSynthesisResult,
} from './types';

const unique = <T>(items: ReadonlyArray<T>, keyFn: (item: T) => string): T[] => {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
};

const pickSnippet = (text: string, query: string): string => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 4);

  const lowered = normalized.toLowerCase();
  let pivot = -1;
  for (const term of queryTerms) {
    const index = lowered.indexOf(term);
    if (index >= 0) {
      pivot = index;
      break;
    }
  }

  if (pivot < 0) {
    return normalized.slice(0, 220);
  }

  const start = Math.max(0, pivot - 80);
  const end = Math.min(normalized.length, start + 220);
  return normalized.slice(start, end);
};

const buildCitationMarker = (title: string, chunkIndex: number): string => {
  return `[Source: ${title}, chunk ${chunkIndex + 1}]`;
};

export const synthesizeKnowledgeAnswer = (
  retrieval: KnowledgeRetrievalResult
): KnowledgeSynthesisResult => {
  if (retrieval.hits.length === 0) {
    return {
      answer:
        'No matching knowledge was found yet. Add notes, files, or links to build your knowledge base before querying.',
      citations: [],
      generatedAtIso: retrieval.generatedAtIso,
    };
  }

  const topHits = retrieval.hits.slice(0, 4);
  const citations: KnowledgeCitation[] = unique(
    topHits.map((hit) => {
      const snippet = pickSnippet(hit.node.text, retrieval.query);
      return {
        sourceId: hit.source.id,
        sourceTitle: hit.source.title,
        sourceType: hit.source.type,
        nodeId: hit.node.id,
        chunkIndex: hit.node.chunkIndex,
        snippet,
        marker: buildCitationMarker(hit.source.title, hit.node.chunkIndex),
      };
    }),
    (citation) => citation.nodeId
  );

  const lines: string[] = [];
  lines.push(`Query focus: ${retrieval.query}.`);
  lines.push('Most relevant knowledge indicates the following:');

  for (const citation of citations.slice(0, 3)) {
    lines.push(`- ${citation.snippet} ${citation.marker}`);
  }

  if (citations.length > 3) {
    const overflow = citations.length - 3;
    lines.push(`- Additional supporting context available from ${overflow} more source chunk(s).`);
  }

  lines.push('Use citations to inspect exact source context before acting on recommendations.');

  return {
    answer: lines.join('\n'),
    citations,
    generatedAtIso: retrieval.generatedAtIso,
  };
};
