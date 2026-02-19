
import { GoogleGenAI } from "@google/genai";
import { supabase } from "../lib/supabase";
import { resolveGeminiApiKey } from "../lib/env";
import { Memory, MemoryType, MemoryCluster, Message } from "../types";
import { v4 as uuidv4 } from 'uuid';
import { modelManager } from "./modelManager";

const supabaseDb = supabase;


// Safe lazy initialization
const getAiClient = () => {
    const apiKey = resolveGeminiApiKey();
    return new GoogleGenAI({ apiKey: apiKey || '' });
};

const EMBEDDING_MODEL = 'gemini-embedding-001';

// ==========================================
// TIERED MEMORY ARCHITECTURE
// Pattern from conversation-memory skill: "Memory types differ—short-term, long-term"
// ==========================================

export type MemoryTier = 'short_term' | 'working' | 'long_term' | 'episodic';

export interface TierConfig {
    ttl: number;           // Time-to-live in ms (Infinity = never expires)
    maxItems: number;      // Maximum items in this tier
    retrieval: 'recency' | 'relevance' | 'semantic' | 'temporal+semantic';
    minConfidence: number; // Minimum confidence to include
}

export const MEMORY_TIERS: Record<MemoryTier, TierConfig> = {
    short_term: {
        ttl: 5 * 60 * 1000,         // 5 minutes
        maxItems: 20,
        retrieval: 'recency',
        minConfidence: 0.3
    },
    working: {
        ttl: 60 * 60 * 1000,        // 1 hour (session scope)
        maxItems: 50,
        retrieval: 'relevance',
        minConfidence: 0.5
    },
    long_term: {
        ttl: Infinity,              // Never expires
        maxItems: 500,
        retrieval: 'semantic',
        minConfidence: 0.7
    },
    episodic: {
        ttl: Infinity,              // Never expires (specific events/stories)
        maxItems: 100,
        retrieval: 'temporal+semantic',
        minConfidence: 0.6
    }
};

// In-memory short-term cache (per-session)
const shortTermCache = new Map<string, { memories: Memory[], lastUpdated: number }>();

/**
 * Get memories from a specific tier with appropriate retrieval strategy
 */
export async function getMemoriesByTier(
    userId: string,
    tier: MemoryTier,
    query?: string,
    limit?: number
): Promise<Memory[]> {
    const config = MEMORY_TIERS[tier];
    const maxItems = limit || config.maxItems;
    const now = Date.now();

    // For short-term, use in-memory cache first
    if (tier === 'short_term') {
        const cacheKey = userId;
        const cached = shortTermCache.get(cacheKey);
        if (cached && (now - cached.lastUpdated < config.ttl)) {
            return cached.memories.slice(0, maxItems);
        }
    }

    // Build base query
    let queryBuilder = supabaseDb
        .from('memories')
        .select('*')
        .eq('user_id', userId)
        .gte('decay_factor', config.minConfidence);

    // Apply TTL filter (exclude expired memories)
    if (config.ttl !== Infinity) {
        const cutoffIso = new Date(now - config.ttl).toISOString();
        queryBuilder = queryBuilder.gte('created_at', cutoffIso);
    }

    // Apply tier-specific retrieval
    switch (config.retrieval) {
        case 'recency':
            queryBuilder = queryBuilder.order('created_at', { ascending: false });
            break;
        case 'relevance':
            // Will re-sort by semantic similarity after fetch if query provided
            queryBuilder = queryBuilder.order('decay_factor', { ascending: false });
            break;
        case 'semantic':
            // Semantic retrieval requires embedding comparison
            // Handled separately below
            break;
        case 'temporal+semantic':
            // Combine temporal and semantic - fetch recent first, rerank
            queryBuilder = queryBuilder.order('created_at', { ascending: false });
            break;
    }

    queryBuilder = queryBuilder.limit(maxItems * 2); // Overfetch for reranking

    const { data, error } = await queryBuilder;
    if (error || !data) return [];

    let memories = data as Memory[];

    // If query provided and semantic retrieval, rerank by similarity
    if (query && (config.retrieval === 'semantic' || config.retrieval === 'relevance' || config.retrieval === 'temporal+semantic')) {
        try {
            const queryEmbedding = await generateEmbedding(query);
            memories = memories
                .map(m => ({
                    ...m,
                    _similarity: m.embedding ? calculateSimilarity(m.embedding, queryEmbedding) : 0
                }))
                .sort((a, b) => (b._similarity || 0) - (a._similarity || 0))
                .slice(0, maxItems);
        } catch (e) {
            console.error('[TieredMemory] Semantic reranking failed:', e);
        }
    } else {
        memories = memories.slice(0, maxItems);
    }

    // Cache short-term
    if (tier === 'short_term') {
        shortTermCache.set(userId, { memories, lastUpdated: now });
    }

    return memories;
}

/**
 * Add a memory to the short-term cache
 * This is faster than DB for very recent memories
 */
export function addToShortTermCache(userId: string, memory: Memory) {
    const cacheKey = userId;
    const existing = shortTermCache.get(cacheKey) || { memories: [], lastUpdated: Date.now() };
    existing.memories.unshift(memory);
    existing.memories = existing.memories.slice(0, MEMORY_TIERS.short_term.maxItems);
    existing.lastUpdated = Date.now();
    shortTermCache.set(cacheKey, existing);
}

/**
 * Get optimal memories using tiered retrieval
 * Combines recent + relevant + semantic for best context
 */
export async function getOptimalMemories(
    userId: string,
    query: string,
    totalLimit: number = 10
): Promise<Memory[]> {
    // Allocate budget across tiers (60% relevant, 20% recent, 20% episodic)
    const [recent, relevant, episodic] = await Promise.all([
        getMemoriesByTier(userId, 'short_term', query, Math.ceil(totalLimit * 0.2)),
        getMemoriesByTier(userId, 'long_term', query, Math.ceil(totalLimit * 0.6)),
        getMemoriesByTier(userId, 'episodic', query, Math.ceil(totalLimit * 0.2))
    ]);

    // Deduplicate by ID
    const seen = new Set<string>();
    const combined: Memory[] = [];

    for (const memory of [...recent, ...relevant, ...episodic]) {
        if (!seen.has(memory.id)) {
            seen.add(memory.id);
            combined.push(memory);
        }
    }

    // Sort by combined score (recency + relevance)
    const now = Date.now();
    return combined
        .map(m => ({
            ...m,
            _score:
                (((m as Memory & { _similarity?: number })._similarity) || 0.5) +
                (1 - (now - m.timestamp) / (7 * 24 * 60 * 60 * 1000)) * 0.3
        }))
        .sort((a, b) => (b._score || 0) - (a._score || 0))
        .slice(0, totalLimit);
}

// ==========================================
// 1. MEMORY PROCESSING UTILS
// ==========================================

export const generateEmbedding = async (text: string): Promise<number[]> => {
    try {
        const ai = getAiClient();
        const result = await ai.models.embedContent({
            model: EMBEDDING_MODEL,
            contents: [{ parts: [{ text }] }],
            config: { outputDimensionality: 768 } // Match DB vector column dimension
        });

        const embedding = result.embeddings?.[0]?.values;
        if (!embedding) throw new Error("No embedding returned");
        return embedding;
    } catch (error) {
        console.error("Embedding generation failed:", error);
        throw error;
    }
};

export const calculateSimilarity = (embedding1: number[], embedding2: number[]): number => {
    if (embedding1.length !== embedding2.length) return 0;

    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
        dotProduct += embedding1[i] * embedding2[i];
        magnitude1 += embedding1[i] * embedding1[i];
        magnitude2 += embedding2[i] * embedding2[i];
    }

    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);

    if (magnitude1 === 0 || magnitude2 === 0) return 0;

    return dotProduct / (magnitude1 * magnitude2);
};

// ==========================================
// 2. STORAGE FUNCTIONS
// ==========================================

export const createMemory = async (
    userId: string,
    content: string,
    type: MemoryType,
    metadata: Record<string, any> = {},
    emotionalValence: number = 0
): Promise<Memory | null> => {
    try {
        const embedding = await generateEmbedding(content);

        const newMemory = {
            user_id: userId,
            type,
            content,
            embedding,
            decay_factor: 1.0,
            emotional_valence: emotionalValence,
            connections: [],
            metadata,
        };

        const { data, error } = await supabaseDb
            .from('memories')
            .insert(newMemory)
            .select()
            .single();

        if (error) throw error;

        return {
            id: data.id,
            type: data.type as MemoryType,
            content: data.content,
            embedding: data.embedding,
            timestamp: new Date(data.created_at).getTime(),
            decayFactor: data.decay_factor,
            connections: data.connections || [],
            emotionalValence: data.emotional_valence,
            metadata: data.metadata
        };
    } catch (e) {
        console.error("Failed to create memory:", e);
        return null;
    }
};

export const storeMemory = async (memory: Memory, userId: string): Promise<void> => {
    const { error } = await supabaseDb.from('memories').upsert({
        id: memory.id,
        user_id: userId,
        content: memory.content,
        type: memory.type,
        embedding: memory.embedding,
        decay_factor: memory.decayFactor,
        emotional_valence: memory.emotionalValence,
        connections: memory.connections,
        metadata: memory.metadata
    });
    if (error) console.error("Store memory error:", error);
};

export const deleteMemory = async (id: string): Promise<void> => {
    await supabaseDb.from('memories').delete().eq('id', id);
};

export const updateMemoryDecay = async (id: string, factor: number): Promise<void> => {
    await supabaseDb.from('memories').update({ decay_factor: factor }).eq('id', id);
};

// ==========================================
// 3. RETRIEVAL FUNCTIONS
// ==========================================

export const searchMemories = async (
    userId: string,
    query: string,
    type?: MemoryType,
    limit: number = 5
): Promise<Memory[]> => {
    try {
        const queryEmbedding = await generateEmbedding(query);

        const { data, error } = await supabase.rpc('match_memories', {
            query_embedding: queryEmbedding,
            match_threshold: 0.5,
            match_count: limit,
            filter_user_id: userId
        });

        if (error) {
            console.warn("Vector search RPC failed, falling back to recent fetch", error);
            return getRecentMemories(userId, type, 24);
        }

        let results = data || [];
        if (type) {
            results = results.filter((m: any) => m.type === type);
        }

        return results.map((m: any) => ({
            id: m.id,
            type: m.type as MemoryType,
            content: m.content,
            embedding: [],
            timestamp: new Date(m.created_at).getTime(),
            decayFactor: m.decay_factor,
            connections: m.connections || [],
            emotionalValence: m.emotional_valence,
            metadata: m.metadata
        }));

    } catch (e) {
        console.error("Search memories failed:", e);
        return [];
    }
};

export const getRelatedMemories = async (memoryId: string): Promise<Memory[]> => {
    const { data: source } = await supabaseDb.from('memories').select('connections').eq('id', memoryId).single();
    if (!source || !source.connections || source.connections.length === 0) return [];

    const { data } = await supabaseDb.from('memories').select('*').in('id', source.connections);

    return (data || []).map((m: any) => ({
        id: m.id,
        type: m.type as MemoryType,
        content: m.content,
        // Preserve embeddings so consolidation similarity scoring can work.
        embedding: m.embedding || [],
        timestamp: new Date(m.created_at).getTime(),
        decayFactor: m.decay_factor,
        connections: m.connections || [],
        emotionalValence: m.emotional_valence,
        metadata: m.metadata
    }));
};

export const getRecentMemories = async (
    userId: string,
    type?: MemoryType,
    hours: number = 24
): Promise<Memory[]> => {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    let query = supabaseDb.from('memories').select('*')
        .eq('user_id', userId)
        .gt('created_at', cutoff)
        .order('created_at', { ascending: false });

    if (type) query = query.eq('type', type);

    const { data } = await query;

    return (data || []).map((m: any) => ({
        id: m.id,
        type: m.type as MemoryType,
        content: m.content,
        // Preserve embeddings so downstream consolidation can compute similarity.
        embedding: m.embedding || [],
        timestamp: new Date(m.created_at).getTime(),
        decayFactor: m.decay_factor,
        connections: m.connections || [],
        emotionalValence: m.emotional_valence,
        metadata: m.metadata
    }));
};

// ==========================================
// 4. HIGH LEVEL LOGIC (AI POWERED)
// ==========================================

export const extractMemoryFromConversation = async (
    userId: string,
    messages: Message[]
): Promise<Memory[]> => {
    const ai = getAiClient();
    const recentContext = messages.slice(-4).map(m => `${m.role}: ${m.text}`).join('\n');

    const prompt = `
    Analyze this conversation snippet. Extract KEY facts, user preferences, or significant events that should be stored in long-term memory.
    Return a JSON array of objects. Each object must have:
    - "content": string (The concise fact)
    - "type": "episodic" | "semantic" | "emotional" | "procedural"
    - "emotionalValence": number (-1 to 1)

    Conversation:
    ${recentContext}
    `;

    try {
        const response = await modelManager.runWithFallback('complex', async (model) => {
            return await ai.models.generateContent({
                model: model,
                contents: [{ parts: [{ text: prompt }] }],
                config: {
                    responseMimeType: 'application/json',
                    thinkingConfig: { thinkingBudget: 10 }
                }
            });
        });

        const jsonText = response.text || "[]";
        const facts = JSON.parse(jsonText);

        if (!Array.isArray(facts)) return [];

        const createdMemories: Memory[] = [];

        for (const fact of facts) {
            const memory = await createMemory(userId, fact.content, fact.type, { source: 'conversation_extraction' }, fact.emotionalValence);
            if (memory) createdMemories.push(memory);
        }

        return createdMemories;
    } catch (e) {
        console.error("Memory extraction failed", e);
        return [];
    }
};

export const connectMemories = async (id1: string, id2: string): Promise<void> => {
    const { data: m1 } = await supabaseDb.from('memories').select('connections').eq('id', id1).single();
    const { data: m2 } = await supabaseDb.from('memories').select('connections').eq('id', id2).single();

    if (m1 && m2) {
        const conn1 = new Set(m1.connections || []);
        conn1.add(id2);
        await supabaseDb.from('memories').update({ connections: Array.from(conn1) }).eq('id', id1);

        const conn2 = new Set(m2.connections || []);
        conn2.add(id1);
        await supabaseDb.from('memories').update({ connections: Array.from(conn2) }).eq('id', id2);
    }
};

export const getRelevantContext = async (userId: string, currentMessage: string, limit: number = 3): Promise<string> => {
    const memories = await searchMemories(userId, currentMessage, undefined, limit);
    if (memories.length === 0) return "";

    return `
    [LONG_TERM_MEMORY_RECALL]:
    ${memories.map(m => `- (${m.type}) ${m.content}`).join('\n')}
    `;
};

export const getMemoryGraph = async (rootId: string, depth: number = 1): Promise<MemoryCluster | null> => {
    const memory = await getRelatedMemories(rootId);
    return {
        id: uuidv4(),
        label: "Memory Cluster",
        centroid: [],
        memoryIds: memory.map(m => m.id),
        lastAccessed: Date.now()
    };
};

export const inferConnections = async (memoryId: string): Promise<string[]> => {
    const ai = getAiClient();

    // 1. Fetch source memory
    const { data: sourceMemory, error } = await supabaseDb
        .from('memories')
        .select('*')
        .eq('id', memoryId)
        .single();

    if (error || !sourceMemory) return [];

    // 2. Find semantic candidates
    const candidates = await searchMemories(
        sourceMemory.user_id,
        sourceMemory.content,
        undefined,
        5
    );

    const connectedIds: string[] = [];

    // 3. Evaluate connections
    for (const candidate of candidates) {
        if (candidate.id === memoryId) continue;
        if (sourceMemory.connections?.includes(candidate.id)) continue;

        const prompt = `
        Memory A: "${sourceMemory.content}"
        Memory B: "${candidate.content}"
        
        Are these memories explicitly related (same entity, event, or causal link)? 
        Reply YES or NO.
        `;

        // Optimizing: only check top 3 candidates
        if (connectedIds.length >= 3) break;

        try {
            const response = await modelManager.runWithFallback('complex', async (model) => {
                return await ai.models.generateContent({
                    model: model,
                    contents: [{ parts: [{ text: prompt }] }],
                    config: { thinkingConfig: { thinkingBudget: 10 } }
                });
            });

            if (response.text?.toLowerCase().includes('yes')) {
                connectedIds.push(candidate.id);
                // Create graph edge
                await connectMemories(memoryId, candidate.id);
                await supabaseDb.from('memory_connections').insert({
                    memory_a: memoryId,
                    memory_b: candidate.id,
                    strength: 1.0
                }).then(); // Fire and forget
            }
        } catch (e) {
            continue;
        }
    }

    return connectedIds;
};

export const consolidateMemories = async (userId: string): Promise<void> => {
    // 1. Fetch recent memories
    const memories = await getRecentMemories(userId, undefined, 48); // Last 2 days
    if (memories.length < 2) return;

    const processed = new Set<string>();

    for (let i = 0; i < memories.length; i++) {
        const memA = memories[i];
        if (processed.has(memA.id)) continue;

        for (let j = i + 1; j < memories.length; j++) {
            const memB = memories[j];
            if (processed.has(memB.id)) continue;

            const similarity = calculateSimilarity(memA.embedding || [], memB.embedding || []);

            if (similarity > 0.92) {
                // Merge B into A
                const mergedCount = Number(memA.metadata?.merged_count ?? 0);
                const combinedMetadata = {
                    ...memA.metadata,
                    ...memB.metadata,
                    merged_count: mergedCount + 1,
                };

                await supabaseDb.from('memories').update({
                    metadata: combinedMetadata,
                    decay_factor: 1.0, // Reset decay on merge
                    last_accessed: new Date().toISOString()
                }).eq('id', memA.id);

                await deleteMemory(memB.id);
                processed.add(memB.id);
            }
        }
    }
};

export const getMemoriesByEmotion = async (userId: string, valence: number, threshold: number = 0.2): Promise<Memory[]> => {
    const minValence = valence - threshold;
    const maxValence = valence + threshold;

    const { data, error } = await supabaseDb
        .from('memories')
        .select('*')
        .eq('user_id', userId)
        .gte('emotional_valence', minValence)
        .lte('emotional_valence', maxValence)
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error("Failed to fetch emotional memories", error);
        return [];
    }

    return (data || []).map((m: any) => ({
        id: m.id,
        type: m.type as MemoryType,
        content: m.content,
        embedding: [],
        timestamp: new Date(m.created_at).getTime(),
        decayFactor: m.decay_factor,
        connections: m.connections || [],
        emotionalValence: m.emotional_valence,
        metadata: m.metadata
    }));
};

export const buildTemporalContext = async (userId: string, sessionId: string): Promise<string> => {
    const ai = getAiClient();

    // 1. Fetch relevant memories/events
    const { data: memories } = await supabaseDb
        .from('memories')
        .select('content, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(20);

    if (!memories || memories.length === 0) return "";

    // 2. Format timeline
    const timeline = memories.map(m => {
        const date = new Date(m.created_at).toLocaleDateString();
        return `[${date}] ${m.content}`;
    }).join('\n');

    // 3. Generate Narrative
    const prompt = `
    Analyze this timeline of user memories/events:
    ${timeline}

    Create a concise narrative summary of the user's recent journey. 
    Identify:
    1. Recurring themes
    2. Emotional trajectory (improving/worsening?)
    3. Key unresolved threads

    Format: "Over the last few days, [Summary]. The key theme is [Theme]."
    `;

    try {
        const response = await modelManager.runWithFallback('complex', async (model) => {
            return await ai.models.generateContent({
                model: model,
                contents: [{ parts: [{ text: prompt }] }],
                config: { thinkingConfig: { thinkingBudget: 10 } }
            });
        });
        return response.text || "";
    } catch (e) {
        return "";
    }
};
