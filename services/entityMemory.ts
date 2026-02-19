/**
 * @file services/entityMemory.ts
 * @description Track facts about specific entities (people, places, things) mentioned in conversations.
 * Pattern from agent-memory-systems skill: "Entity Memory - Store and update facts about entities"
 * 
 * Key insight from skill: "Memory failures look like intelligence failures. When an agent
 * 'forgets' or gives inconsistent answers, it's almost always a retrieval problem."
 */

import { supabase } from "../lib/supabase";
import { GoogleGenAI } from "@google/genai";
import { resolveGeminiApiKey } from "../lib/env";
import { modelManager } from "./modelManager";
import { Message } from "../types";

const supabaseDb = supabase;

// ==========================================
// TYPES
// ==========================================

export interface EntityFact {
    attribute: string;
    value: string;
    confidence: number;
    source: 'stated' | 'inferred';
    firstMentioned: number;
    lastUpdated: number;
    mentionCount: number;
}

export interface Entity {
    id: string;
    userId: string;
    personaId: string;
    entityName: string;
    entityType: 'person' | 'place' | 'thing' | 'event' | 'concept';
    aliases: string[];
    facts: EntityFact[];
    relationToUser: string;
    lastMentioned: number;
    totalMentions: number;
    createdAt: number;
}

export interface EntityExtractionResult {
    entityName: string;
    entityType: Entity['entityType'];
    relationToUser: string;
    facts: {
        attribute: string;
        value: string;
        source: 'stated' | 'inferred';
    }[];
}

// ==========================================
// LAZY AI CLIENT
// ==========================================

const getAiClient = () => {
    const apiKey = resolveGeminiApiKey();
    return new GoogleGenAI({ apiKey: apiKey || '' });
};

// ==========================================
// ENTITY EXTRACTION (AI-POWERED)
// ==========================================

/**
 * Extract entities and facts from a conversation
 * Uses AI to identify people, places, things mentioned and facts about them
 */
export async function extractEntitiesFromConversation(
    messages: Message[],
    existingEntities: string[] = []
): Promise<EntityExtractionResult[]> {
    if (messages.length === 0) return [];

    const ai = getAiClient();
    const model = modelManager.getModel('chat');

    // Build conversation context (last 20 messages for efficiency)
    const recentMessages = messages.slice(-20);
    const conversationText = recentMessages
        .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`)
        .join('\n');

    const existingContext = existingEntities.length > 0
        ? `\nAlready known entities: ${existingEntities.join(', ')}`
        : '';

    const prompt = `Analyze this conversation and extract entities (people, places, things) and facts about them.

CONVERSATION:
${conversationText}
${existingContext}

Return JSON array of entities found:
[
  {
    "entityName": "sarah",
    "entityType": "person",
    "relationToUser": "user's sister",
    "facts": [
      {"attribute": "location", "value": "lives in NYC", "source": "stated"},
      {"attribute": "job", "value": "works in marketing", "source": "stated"},
      {"attribute": "birthday", "value": "in March", "source": "stated"}
    ]
  }
]

Rules:
- Only extract entities with at least one concrete fact
- "source" is "stated" if user directly said it, "inferred" if logical deduction
- entityType: person, place, thing, event, concept
- relationToUser: how entity relates to the user (mom, friend, workplace, etc.)
- Normalize names to lowercase
- Return [] if no significant entities found

JSON only, no explanation:`;

    try {
        const response = await ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                temperature: 0.3,
                maxOutputTokens: 1024
            }
        });

        const text = response.text?.trim() || '[]';
        // Extract JSON from response
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return [];

        const entities: EntityExtractionResult[] = JSON.parse(jsonMatch[0]);
        return entities.filter(e => e.entityName && e.facts.length > 0);
    } catch (err) {
        console.error('[EntityMemory] Extraction failed:', err);
        return [];
    }
}

// ==========================================
// STORAGE FUNCTIONS
// ==========================================

/**
 * Store or update an entity in the database
 * Merges new facts with existing ones
 */
export async function upsertEntity(
    userId: string,
    personaId: string,
    extraction: EntityExtractionResult
): Promise<Entity | null> {
    try {
        const now = Date.now();
        const normalizedName = extraction.entityName.toLowerCase().trim();

        // Check if entity exists
        const { data: existing } = await supabaseDb
            .from('entity_memories')
            .select('*')
            .eq('user_id', userId)
            .eq('persona_id', personaId)
            .eq('entity_name', normalizedName)
            .single();

        if (existing) {
            // Merge facts
            const existingFacts: EntityFact[] = existing.facts || [];
            const newFacts: EntityFact[] = [];

            for (const newFact of extraction.facts) {
                const existingIndex = existingFacts.findIndex(
                    f => f.attribute.toLowerCase() === newFact.attribute.toLowerCase()
                );

                if (existingIndex >= 0) {
                    // Update existing fact
                    existingFacts[existingIndex] = {
                        ...existingFacts[existingIndex],
                        value: newFact.value,
                        lastUpdated: now,
                        mentionCount: existingFacts[existingIndex].mentionCount + 1,
                        confidence: Math.min(1, existingFacts[existingIndex].confidence + 0.1)
                    };
                } else {
                    // New fact
                    newFacts.push({
                        attribute: newFact.attribute,
                        value: newFact.value,
                        confidence: newFact.source === 'stated' ? 0.9 : 0.6,
                        source: newFact.source,
                        firstMentioned: now,
                        lastUpdated: now,
                        mentionCount: 1
                    });
                }
            }

            const mergedFacts = [...existingFacts, ...newFacts];

            const { data: updated, error } = await supabaseDb
                .from('entity_memories')
                .update({
                    facts: mergedFacts,
                    total_mentions: existing.total_mentions + 1,
                    last_mentioned: now,
                    relation_to_user: extraction.relationToUser || existing.relation_to_user
                })
                .eq('id', existing.id)
                .select()
                .single();

            if (error) throw error;
            return mapDbToEntity(updated);
        } else {
            // Create new entity
            const facts: EntityFact[] = extraction.facts.map(f => ({
                attribute: f.attribute,
                value: f.value,
                confidence: f.source === 'stated' ? 0.9 : 0.6,
                source: f.source,
                firstMentioned: now,
                lastUpdated: now,
                mentionCount: 1
            }));

            const { data: created, error } = await supabaseDb
                .from('entity_memories')
                .insert({
                    user_id: userId,
                    persona_id: personaId,
                    entity_name: normalizedName,
                    entity_type: extraction.entityType,
                    aliases: [],
                    facts,
                    relation_to_user: extraction.relationToUser,
                    last_mentioned: now,
                    total_mentions: 1,
                    created_at: now
                })
                .select()
                .single();

            if (error) throw error;
            return mapDbToEntity(created);
        }
    } catch (err) {
        console.error('[EntityMemory] Upsert failed:', err);
        return null;
    }
}

/**
 * Get all entities for a user/persona pair
 */
export async function getEntities(
    userId: string,
    personaId: string,
    limit: number = 50
): Promise<Entity[]> {
    try {
        const { data, error } = await supabaseDb
            .from('entity_memories')
            .select('*')
            .eq('user_id', userId)
            .eq('persona_id', personaId)
            .order('total_mentions', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return (data || []).map(mapDbToEntity);
    } catch (err) {
        console.error('[EntityMemory] Get entities failed:', err);
        return [];
    }
}

/**
 * Get specific entity by name
 */
export async function getEntity(
    userId: string,
    personaId: string,
    entityName: string
): Promise<Entity | null> {
    try {
        const { data, error } = await supabaseDb
            .from('entity_memories')
            .select('*')
            .eq('user_id', userId)
            .eq('persona_id', personaId)
            .eq('entity_name', entityName.toLowerCase().trim())
            .single();

        if (error || !data) return null;
        return mapDbToEntity(data);
    } catch (err) {
        return null;
    }
}

/**
 * Search entities by query
 */
export async function searchEntities(
    userId: string,
    personaId: string,
    query: string,
    limit: number = 10
): Promise<Entity[]> {
    try {
        const { data, error } = await supabaseDb
            .from('entity_memories')
            .select('*')
            .eq('user_id', userId)
            .eq('persona_id', personaId)
            .or(`entity_name.ilike.%${query}%,relation_to_user.ilike.%${query}%`)
            .order('total_mentions', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return (data || []).map(mapDbToEntity);
    } catch (err) {
        console.error('[EntityMemory] Search failed:', err);
        return [];
    }
}

// ==========================================
// CONTEXT GENERATION
// ==========================================

/**
 * Build entity context injection for AI prompt
 * Creates a concise summary of known entities and facts
 */
export async function buildEntityContext(
    userId: string,
    personaId: string,
    maxEntities: number = 10
): Promise<string> {
    const entities = await getEntities(userId, personaId, maxEntities);

    if (entities.length === 0) return '';

    const lines = entities.map(entity => {
        const factSummary = entity.facts
            .filter(f => f.confidence >= 0.6)
            .slice(0, 5) // Max 5 facts per entity
            .map(f => f.value)
            .join(', ');

        return `- ${entity.relationToUser || entity.entityName}: ${factSummary}`;
    });

    return `[KNOWN ENTITIES]\n${lines.join('\n')}`;
}

/**
 * Process a conversation and update entity memories
 * Call this periodically (e.g., every 10 messages) to keep entities fresh
 */
export async function processConversationEntities(
    userId: string,
    personaId: string,
    messages: Message[]
): Promise<number> {
    // Get existing entity names to provide context
    const existing = await getEntities(userId, personaId);
    const existingNames = existing.map(e => e.entityName);

    // Extract entities from conversation
    const extractions = await extractEntitiesFromConversation(messages, existingNames);

    if (extractions.length === 0) return 0;

    // Upsert each entity
    let count = 0;
    for (const extraction of extractions) {
        const result = await upsertEntity(userId, personaId, extraction);
        if (result) count++;
    }

    console.log(`[EntityMemory] Processed ${count} entities from conversation`);
    return count;
}

// ==========================================
// UTILITIES
// ==========================================

function mapDbToEntity(row: any): Entity {
    return {
        id: row.id,
        userId: row.user_id,
        personaId: row.persona_id,
        entityName: row.entity_name,
        entityType: row.entity_type,
        aliases: row.aliases || [],
        facts: row.facts || [],
        relationToUser: row.relation_to_user,
        lastMentioned: row.last_mentioned,
        totalMentions: row.total_mentions,
        createdAt: row.created_at
    };
}

/**
 * Decay old entity facts (reduce confidence over time)
 * Call this periodically (e.g., daily)
 */
export async function decayEntityFacts(
    userId: string,
    personaId: string,
    decayRate: number = 0.05
): Promise<void> {
    const entities = await getEntities(userId, personaId, 100);
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    for (const entity of entities) {
        let needsUpdate = false;
        const updatedFacts = entity.facts.map(fact => {
            const daysSinceUpdate = (now - fact.lastUpdated) / DAY_MS;

            if (daysSinceUpdate > 7) { // Only decay facts older than 7 days
                needsUpdate = true;
                return {
                    ...fact,
                    confidence: Math.max(0.1, fact.confidence - (decayRate * Math.floor(daysSinceUpdate / 7)))
                };
            }
            return fact;
        });

        if (needsUpdate) {
            await supabaseDb
                .from('entity_memories')
                .update({ facts: updatedFacts })
                .eq('id', entity.id);
        }
    }
}
