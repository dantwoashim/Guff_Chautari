import type { PersonaAspect } from '../pipeline/types';
import type {
  PersonaGraphEdge,
  PersonaGraphNode,
  PersonaRetrievalResult,
} from './types';

const DEFAULT_TOKEN_BUDGET = 200;
const DEFAULT_RETRIEVAL_LIMIT = 3;

const toTokens = (value: string): string[] => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3);
};

const toTokenSet = (value: string): Set<string> => {
  return new Set(toTokens(value));
};

const overlapScore = (left: Set<string>, right: Set<string>): number => {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) {
    if (right.has(token)) shared += 1;
  }
  return shared / Math.max(left.size, right.size);
};

const nodeFromAspect = (aspect: PersonaAspect): PersonaGraphNode => {
  return {
    id: aspect.id,
    title: aspect.title,
    content: aspect.content,
    keywords: aspect.keywords,
    estimatedTokens: aspect.estimatedTokens,
  };
};

export class PersonaGraphStore {
  private readonly nodes: PersonaGraphNode[];
  private readonly edges: PersonaGraphEdge[];

  constructor(nodes: PersonaGraphNode[], edges: PersonaGraphEdge[]) {
    this.nodes = nodes;
    this.edges = edges;
  }

  static fromAspects(aspects: ReadonlyArray<PersonaAspect>): PersonaGraphStore {
    const nodes = aspects.map(nodeFromAspect);
    const edges: PersonaGraphEdge[] = [];

    for (let source = 0; source < nodes.length; source += 1) {
      for (let target = source + 1; target < nodes.length; target += 1) {
        const left = nodes[source];
        const right = nodes[target];

        const leftTokens = new Set([...left.keywords, ...toTokens(left.title), ...toTokens(left.content)]);
        const rightTokens = new Set([...right.keywords, ...toTokens(right.title), ...toTokens(right.content)]);

        const weight = overlapScore(leftTokens, rightTokens);
        if (weight > 0) {
          edges.push({ from: left.id, to: right.id, weight });
          edges.push({ from: right.id, to: left.id, weight });
        }
      }
    }

    return new PersonaGraphStore(nodes, edges);
  }

  getNodes(): PersonaGraphNode[] {
    return [...this.nodes];
  }

  getEdges(): PersonaGraphEdge[] {
    return [...this.edges];
  }

  retrieveRelevant(
    query: string,
    options: { tokenBudget?: number; limit?: number } = {}
  ): PersonaRetrievalResult {
    const tokenBudget = options.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
    const limit = options.limit ?? DEFAULT_RETRIEVAL_LIMIT;
    const queryTokens = toTokenSet(query);

    const scored = this.nodes
      .map((node) => {
        const sourceTokens = new Set([...node.keywords, ...toTokens(node.title), ...toTokens(node.content)]);
        const directScore = overlapScore(queryTokens, sourceTokens);

        const relationalBoost = this.edges
          .filter((edge) => edge.from === node.id)
          .reduce((sum, edge) => sum + edge.weight, 0);

        return {
          node,
          score: directScore + relationalBoost * 0.05,
        };
      })
      .sort((left, right) => right.score - left.score)
      .filter((entry) => entry.score > 0);

    const selected: PersonaGraphNode[] = [];
    let usedTokens = 0;

    for (const entry of scored) {
      if (selected.length >= limit) break;
      const predicted = usedTokens + entry.node.estimatedTokens;
      if (predicted > tokenBudget) continue;
      selected.push(entry.node);
      usedTokens = predicted;
    }

    if (selected.length === 0 && this.nodes.length > 0) {
      const fallback = this.nodes
        .slice()
        .sort((left, right) => left.estimatedTokens - right.estimatedTokens)
        .slice(0, Math.min(limit, this.nodes.length));

      const fallbackTokens = fallback.reduce((sum, node) => sum + node.estimatedTokens, 0);
      return {
        nodes: fallback,
        totalEstimatedTokens: fallbackTokens,
      };
    }

    return {
      nodes: selected,
      totalEstimatedTokens: usedTokens,
    };
  }
}
