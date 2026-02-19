
import { supabase } from '../../lib/supabase';
import { GoogleGenAI } from '@google/genai';
import { resolveGeminiApiKey } from '../../lib/env';

// Simple types if not importing from central types to avoid circular deps if needed
export type MemoryType = 'episodic' | 'semantic' | 'emotional' | 'procedural';

export interface Memory {
  id: string;
  content: string;
  type: MemoryType;
  emotional_valence: number;
  created_at: string;
}

// Safe lazy initialization
const getAiClient = () => {
  const apiKey = resolveGeminiApiKey();
  return new GoogleGenAI({ apiKey: apiKey || '' });
};

const EMBEDDING_MODEL = 'gemini-embedding-001';

async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const ai = getAiClient();
    const result = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: [{ parts: [{ text }] }],
      config: { outputDimensionality: 768 } // Match DB vector column dimension
    });
    const values = result.embeddings?.[0]?.values;
    if (!values) throw new Error("No embedding");
    return values;
  } catch (e) {
    console.error("Embedding error:", e);
    return [];
  }
}

export const MemoryEngine = {
  async store(userId: string, content: string, type: MemoryType = 'episodic'): Promise<void> {
    const embedding = await generateEmbedding(content);
    if (embedding.length === 0) return;

    await supabase.from('memories').insert({
      user_id: userId,
      content,
      type,
      embedding,
      emotional_valence: 0, // Default for now
      decay_factor: 1.0
    });
  },

  async retrieve(userId: string, context: string, limit: number = 5): Promise<Memory[]> {
    const embedding = await generateEmbedding(context);
    if (embedding.length === 0) return [];

    const { data, error } = await supabase.rpc('match_memories', {
      query_embedding: embedding,
      match_threshold: 0.6,
      match_count: limit,
      filter_user_id: userId
    });

    if (error) {
      console.error("Memory retrieval error:", error);
      return [];
    }

    return data.map((m: any) => ({
      id: m.id,
      content: m.content,
      type: m.type,
      emotional_valence: m.emotional_valence,
      created_at: m.created_at
    }));
  },

  injectContext(memories: Memory[]): string {
    if (memories.length === 0) return '';
    return `[RELEVANT MEMORIES]:\n${memories.map(m => `- ${m.content}`).join('\n')}\n`;
  }
};
