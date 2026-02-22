/**
 * @file services/conversationSummarizer.ts
 * @description Hierarchical Memory System
 * 
 * Problem: At 500+ messages, smart windowing loses 96% of context
 * Solution: Create checkpoints every 50 messages with AI-generated summaries
 */

import { GoogleGenAI } from "@google/genai";
import { supabase } from "../lib/supabase";
import { Message } from "../types";
import { v4 as uuidv4 } from "uuid";
import { modelManager } from "./modelManager";

// ============================================
// TYPES
// ============================================

export interface SessionCheckpoint {
    id: string;
    chatId: string;
    messageRangeStart: number;
    messageRangeEnd: number;
    summary: string;
    keyFacts: string[];
    emotionalArc: string;
    unresolvedThreads: string[];
    createdAt: number;
}

export interface RelationshipState {
    userId: string;
    personaId: string;
    coreFacts: Record<string, any>;
    trustLevel: number;
    relationshipPhase: string;
    sharedExperiences: string[];
    lastUpdated: number;
}

// ============================================
// CONFIGURATION
// ============================================

const CHECKPOINT_INTERVAL = 50; // Create checkpoint every 50 messages
const RECENT_MESSAGES_BUFFER = 15; // Keep last 15 messages verbatim

const getAiClient = () => {
    const apiKey = (typeof process !== 'undefined' && process.env) ? process.env.API_KEY : '';
    return new GoogleGenAI({ apiKey: apiKey || '' });
};

// ============================================
// CHECKPOINT FUNCTIONS
// ============================================

/**
 * Check if a new checkpoint is needed
 */
export function shouldCreateCheckpoint(
    totalMessages: number,
    lastCheckpointEnd: number
): boolean {
    const uncoveredMessages = totalMessages - lastCheckpointEnd - RECENT_MESSAGES_BUFFER;
    return uncoveredMessages >= CHECKPOINT_INTERVAL;
}

/**
 * Get the last checkpoint end index for a chat
 */
export async function getLastCheckpointEnd(chatId: string): Promise<number> {
    const { data } = await supabase
        .from('session_checkpoints')
        .select('message_range_end')
        .eq('chat_id', chatId)
        .order('message_range_end', { ascending: false })
        .limit(1)
        .single();

    return data?.message_range_end || 0;
}

/**
 * Create a checkpoint for a message segment
 */
export async function createCheckpoint(
    chatId: string,
    messages: Message[],
    startIndex: number,
    endIndex: number,
    personaName?: string
): Promise<SessionCheckpoint | null> {
    const ai = getAiClient();
    const segment = messages.slice(startIndex, endIndex);

    if (segment.length === 0) return null;

    // Format messages for summary
    const segmentText = segment.map((m, i) =>
        `[${startIndex + i}] ${m.role === 'user' ? 'User' : personaName || 'Persona'}: ${m.text?.slice(0, 500) || '[media]'}`
    ).join('\n');

    const prompt = `
You are creating a MEMORY CHECKPOINT for a conversation.
This summary will REPLACE the original messages in future context.
It MUST contain everything needed to continue coherently.

Conversation segment (messages ${startIndex}-${endIndex}):
${segmentText}

Create a DENSE, INFORMATION-RICH summary. Extract:

1. KEY FACTS: Names mentioned, preferences revealed, secrets shared, important dates
2. TOPICS: What did they discuss?
3. EMOTIONAL MOMENTS: Any significant emotional exchanges
4. RELATIONSHIP CHANGES: Did trust increase/decrease? Any breakthroughs?
5. UNRESOLVED THREADS: Questions left unanswered, promises made, ongoing topics

Return JSON only:
{
  "summary": "A 2-3 paragraph narrative summary covering all important information",
  "keyFacts": ["Fact 1", "Fact 2", ...],
  "emotionalArc": "How the emotional tone evolved",
  "unresolvedThreads": ["Thread 1", "Thread 2", ...]
}
`;

    try {
        const response = await modelManager.runWithFallback('complex', async (model) => {
            return await ai.models.generateContent({
                model: model,
                contents: [{ parts: [{ text: prompt }] }],
                config: {
                    responseMimeType: 'application/json',
                    temperature: 0.3 // Lower temp for factual extraction
                }
            });
        });

        const data = JSON.parse(response.text || '{}');

        const checkpoint: SessionCheckpoint = {
            id: uuidv4(),
            chatId,
            messageRangeStart: startIndex,
            messageRangeEnd: endIndex,
            summary: data.summary || '',
            keyFacts: data.keyFacts || [],
            emotionalArc: data.emotionalArc || '',
            unresolvedThreads: data.unresolvedThreads || [],
            createdAt: Date.now()
        };

        // Save to database
        await supabase.from('session_checkpoints').insert({
            id: checkpoint.id,
            chat_id: checkpoint.chatId,
            message_range_start: checkpoint.messageRangeStart,
            message_range_end: checkpoint.messageRangeEnd,
            summary: checkpoint.summary,
            key_facts: checkpoint.keyFacts,
            emotional_arc: checkpoint.emotionalArc,
            unresolved_threads: checkpoint.unresolvedThreads,
            created_at: new Date(checkpoint.createdAt).toISOString()
        });

        console.log(`[Memory] Checkpoint created: messages ${startIndex}-${endIndex} summarized (${checkpoint.summary.length} chars)`);

        return checkpoint;

    } catch (e) {
        console.error('[Memory] Checkpoint creation failed:', e);
        return null;
    }
}

/**
 * Get all checkpoints for a chat
 */
export async function getCheckpoints(chatId: string): Promise<SessionCheckpoint[]> {
    const { data, error } = await supabase
        .from('session_checkpoints')
        .select('*')
        .eq('chat_id', chatId)
        .order('message_range_start', { ascending: true });

    if (error || !data) return [];

    return data.map(row => ({
        id: row.id,
        chatId: row.chat_id,
        messageRangeStart: row.message_range_start,
        messageRangeEnd: row.message_range_end,
        summary: row.summary,
        keyFacts: row.key_facts || [],
        emotionalArc: row.emotional_arc || '',
        unresolvedThreads: row.unresolved_threads || [],
        createdAt: new Date(row.created_at).getTime()
    }));
}

/**
 * Build hierarchical context for AI
 * Combines: Relationship State + Checkpoint Summaries + Recent Messages
 */
export async function buildHierarchicalContext(
    chatId: string,
    userId: string,
    personaId: string,
    allMessages: Message[],
    personaName?: string
): Promise<{
    contextInjection: string;
    recentMessages: Message[];
    checkpointsUsed: number;
}> {
    const parts: string[] = [];

    // 1. Check if we need to create a new checkpoint
    const lastCheckpointEnd = await getLastCheckpointEnd(chatId);
    const totalMessages = allMessages.length;

    if (shouldCreateCheckpoint(totalMessages, lastCheckpointEnd)) {
        const newStart = lastCheckpointEnd;
        const newEnd = totalMessages - RECENT_MESSAGES_BUFFER;

        if (newEnd > newStart) {
            await createCheckpoint(chatId, allMessages, newStart, newEnd, personaName);
        }
    }

    // 2. Get relationship state
    const relationshipState = await getRelationshipState(userId, personaId);
    if (relationshipState) {
        const facts = Object.entries(relationshipState.coreFacts)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');

        parts.push(`[RELATIONSHIP STATE]
Trust level: ${Math.round(relationshipState.trustLevel * 100)}%
Phase: ${relationshipState.relationshipPhase}
Key facts: ${facts || 'None recorded'}
Shared experiences: ${relationshipState.sharedExperiences.slice(-3).join('; ') || 'None yet'}`);
    }

    // 3. Get checkpoint summaries
    const checkpoints = await getCheckpoints(chatId);
    if (checkpoints.length > 0) {
        const summaryText = checkpoints.map(cp =>
            `[Messages ${cp.messageRangeStart}-${cp.messageRangeEnd}]:\n${cp.summary}`
        ).join('\n\n');

        parts.push(`[CONVERSATION HISTORY - SUMMARIZED]\n${summaryText}`);

        // Also include key unresolved threads from recent checkpoints
        const recentThreads = checkpoints
            .slice(-2)
            .flatMap(cp => cp.unresolvedThreads)
            .filter(Boolean);

        if (recentThreads.length > 0) {
            parts.push(`[UNRESOLVED THREADS]\n${recentThreads.map(t => `- ${t}`).join('\n')}`);
        }
    }

    // 4. Recent messages (verbatim)
    const recentMessages = allMessages.slice(-RECENT_MESSAGES_BUFFER);

    return {
        contextInjection: parts.join('\n\n---\n\n'),
        recentMessages,
        checkpointsUsed: checkpoints.length
    };
}

// ============================================
// RELATIONSHIP STATE FUNCTIONS
// ============================================

/**
 * Get relationship state for a user-persona pair
 */
export async function getRelationshipState(
    userId: string,
    personaId: string
): Promise<RelationshipState | null> {
    const { data, error } = await supabase
        .from('relationship_states')
        .select('*')
        .eq('user_id', userId)
        .eq('persona_id', personaId)
        .single();

    if (error || !data) return null;

    return {
        userId: data.user_id,
        personaId: data.persona_id,
        coreFacts: data.core_facts || {},
        trustLevel: data.trust_level || 0.5,
        relationshipPhase: data.relationship_phase || 'acquaintance',
        sharedExperiences: data.shared_experiences || [],
        lastUpdated: new Date(data.last_updated).getTime()
    };
}

/**
 * Update relationship state with new information
 */
export async function updateRelationshipState(
    userId: string,
    personaId: string,
    updates: Partial<RelationshipState>
): Promise<void> {
    const existing = await getRelationshipState(userId, personaId);

    const newState = {
        user_id: userId,
        persona_id: personaId,
        core_facts: { ...existing?.coreFacts, ...updates.coreFacts },
        trust_level: updates.trustLevel ?? existing?.trustLevel ?? 0.5,
        relationship_phase: updates.relationshipPhase ?? existing?.relationshipPhase ?? 'acquaintance',
        shared_experiences: [
            ...(existing?.sharedExperiences || []),
            ...(updates.sharedExperiences || [])
        ].slice(-20), // Keep last 20
        last_updated: new Date().toISOString()
    };

    await supabase.from('relationship_states').upsert(newState, {
        onConflict: 'user_id,persona_id'
    });
}

/**
 * Extract and update relationship from a conversation segment
 */
export async function extractRelationshipUpdates(
    userId: string,
    personaId: string,
    messages: Message[]
): Promise<void> {
    const ai = getAiClient();

    const recentText = messages.slice(-10).map(m =>
        `${m.role}: ${m.text?.slice(0, 300) || '[media]'}`
    ).join('\n');

    const prompt = `
Analyze this conversation and extract relationship updates:
${recentText}

Return JSON:
{
  "newFacts": {"key": "value"},  // New facts learned (name, preferences, etc)
  "trustChange": 0.0,  // -0.1 to +0.1 change
  "significantMoment": "description or null"
}
`;

    try {
        const response = await modelManager.runWithFallback('chat', async (model) => {
            return await ai.models.generateContent({
                model: model,
                contents: [{ parts: [{ text: prompt }] }],
                config: { responseMimeType: 'application/json' }
            });
        });

        const data = JSON.parse(response.text || '{}');

        const updates: Partial<RelationshipState> = {};

        if (data.newFacts && Object.keys(data.newFacts).length > 0) {
            updates.coreFacts = data.newFacts;
        }

        if (data.trustChange && Math.abs(data.trustChange) > 0.01) {
            const current = (await getRelationshipState(userId, personaId))?.trustLevel || 0.5;
            updates.trustLevel = Math.max(0, Math.min(1, current + data.trustChange));
        }

        if (data.significantMoment) {
            updates.sharedExperiences = [data.significantMoment];
        }

        if (Object.keys(updates).length > 0) {
            await updateRelationshipState(userId, personaId, updates);
            console.log('[Memory] Relationship updated:', updates);
        }
    } catch (e) {
        console.error('[Memory] Relationship extraction failed:', e);
    }
}
