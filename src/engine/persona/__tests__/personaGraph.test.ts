import { describe, expect, it } from 'vitest';
import { PersonaGraphStore } from '../personaGraph';

const buildAspect = (index: number, topic: string) => ({
  id: `aspect-${index}`,
  title: `${topic} aspect ${index}`,
  content: `Detailed guidance about ${topic} strategy, behavior, and decisions for consistent responses.`,
  keywords: [topic, 'strategy', 'consistency'],
  estimatedTokens: 35,
});

describe('PersonaGraphStore', () => {
  it('returns 2-3 relevant aspects for large persona graphs (50+ aspects)', () => {
    const aspects = [
      ...Array.from({ length: 20 }, (_, index) => buildAspect(index, 'fitness')),
      ...Array.from({ length: 20 }, (_, index) => buildAspect(index + 20, 'finance')),
      ...Array.from({ length: 20 }, (_, index) => buildAspect(index + 40, 'coding')),
    ];

    const graph = PersonaGraphStore.fromAspects(aspects);

    const result = graph.retrieveRelevant('I need a fitness routine and workout consistency plan', {
      limit: 3,
      tokenBudget: 200,
    });

    expect(graph.getNodes().length).toBe(60);
    expect(result.nodes.length).toBeGreaterThanOrEqual(2);
    expect(result.nodes.length).toBeLessThanOrEqual(3);
    expect(result.nodes.every((node) => node.title.toLowerCase().includes('fitness'))).toBe(true);
  });
});
