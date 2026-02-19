/**
 * @file services/memoryConsolidation.ts
 * @description Memory consolidation and cleanup service
 * Pattern from conversation-memory skill: "Memory consolidation - merge similar memories"
 * 
 * Runs periodically to:
 * 1. Decay old memory confidence
 * 2. Merge duplicate/similar memories
 * 3. Promote important short-term to long-term
 * 4. Archive low-confidence memories
 */

import { supabase } from "../lib/supabase";
import { Memory, MemoryType } from "../types";
import { generateEmbedding, calculateSimilarity, addToShortTermCache, MEMORY_TIERS } from "./memoryService";
import { decayEntityFacts } from "./entityMemory";

const supabaseDb = supabase;

// ==========================================
// CONFIGURATION
// ==========================================

const CONSOLIDATION_CONFIG = {
    // Decay settings
    decayIntervalDays: 7,       // How often to decay
    decayRate: 0.05,            // Confidence decay per interval
    archiveThreshold: 0.2,      // Archive if confidence below this

    // Merge settings  
    similarityThreshold: 0.9,   // Cosine similarity to consider duplicate
    minConfidenceForMerge: 0.5, // Only merge if both above this

    // Promotion settings
    promotionThreshold: 3,      // Access count to promote to long-term
    emotionalBoost: 0.2,        // Extra confidence for emotional memories
};

// ==========================================
// CONSOLIDATION FUNCTIONS
// ==========================================

/**
 * Run full memory consolidation for a user
 * Call this on session end or periodically (e.g., daily)
 */
export async function consolidateUserMemories(userId: string): Promise<{
    decayed: number;
    merged: number;
    promoted: number;
    archived: number;
}> {
    console.log(`[MemoryConsolidation] Starting for user ${userId.slice(0, 8)}...`);

    const results = {
        decayed: 0,
        merged: 0,
        promoted: 0,
        archived: 0
    };

    try {
        // 1. Decay old memories
        results.decayed = await decayOldMemories(userId);

        // 2. Merge similar memories
        results.merged = await mergeSimilarMemories(userId);

        // 3. Promote frequently accessed to long-term
        results.promoted = await promoteImportantMemories(userId);

        // 4. Archive low-confidence memories
        results.archived = await archiveLowConfidenceMemories(userId);

        // 5. Also decay entity facts
        // await decayEntityFacts(userId, 'default');

        console.log(`[MemoryConsolidation] Complete:`, results);
    } catch (err) {
        console.error('[MemoryConsolidation] Error:', err);
    }

    return results;
}

/**
 * Decay memory confidence over time
 * Memories that aren't accessed lose relevance
 */
async function decayOldMemories(userId: string): Promise<number> {
    const nowMs = Date.now();
    const interval = CONSOLIDATION_CONFIG.decayIntervalDays * 24 * 60 * 60 * 1000;
    const cutoffIso = new Date(nowMs - interval).toISOString();

    // Get memories that haven't been accessed recently
    const { data: oldMemories, error } = await supabaseDb
        .from('memories')
        .select('id, decay_factor, last_accessed, created_at')
        .eq('user_id', userId)
        .lt('last_accessed', cutoffIso)
        .gt('decay_factor', CONSOLIDATION_CONFIG.archiveThreshold);

    if (error || !oldMemories) return 0;

    let decayed = 0;
    for (const memory of oldMemories) {
        const lastAccessMs = Date.parse(memory.last_accessed || memory.created_at);
        if (Number.isNaN(lastAccessMs)) continue;
        const daysSinceAccess = (nowMs - lastAccessMs) / (24 * 60 * 60 * 1000);
        const intervals = Math.floor(daysSinceAccess / CONSOLIDATION_CONFIG.decayIntervalDays);
        const newDecay = Math.max(
            CONSOLIDATION_CONFIG.archiveThreshold,
            memory.decay_factor - (CONSOLIDATION_CONFIG.decayRate * intervals)
        );

        if (newDecay !== memory.decay_factor) {
            await supabaseDb
                .from('memories')
                .update({ decay_factor: newDecay })
                .eq('id', memory.id);
            decayed++;
        }
    }

    return decayed;
}

/**
 * Merge duplicate or very similar memories
 * Keeps the stronger one, boosts its confidence
 */
async function mergeSimilarMemories(userId: string): Promise<number> {
    // Get recent memories with embeddings
    const { data: memories, error } = await supabaseDb
        .from('memories')
        .select('*')
        .eq('user_id', userId)
        .gt('decay_factor', CONSOLIDATION_CONFIG.minConfidenceForMerge)
        .order('created_at', { ascending: false })
        .limit(100);

    if (error || !memories || memories.length < 2) return 0;

    const toDelete: string[] = [];
    const toUpdate: { id: string; newDecay: number }[] = [];
    const processed = new Set<string>();

    for (let i = 0; i < memories.length; i++) {
        if (processed.has(memories[i].id)) continue;

        for (let j = i + 1; j < memories.length; j++) {
            if (processed.has(memories[j].id)) continue;

            // Skip if no embeddings
            if (!memories[i].embedding || !memories[j].embedding) continue;

            const similarity = calculateSimilarity(memories[i].embedding, memories[j].embedding);

            if (similarity > CONSOLIDATION_CONFIG.similarityThreshold) {
                // Found duplicates - keep the one with higher confidence
                const [keep, remove] = memories[i].decay_factor >= memories[j].decay_factor
                    ? [memories[i], memories[j]]
                    : [memories[j], memories[i]];

                // Boost confidence of kept memory
                const boostedDecay = Math.min(1, keep.decay_factor + 0.1);
                toUpdate.push({ id: keep.id, newDecay: boostedDecay });
                toDelete.push(remove.id);

                processed.add(keep.id);
                processed.add(remove.id);

                console.log(`[Merge] "${keep.content.slice(0, 30)}..." <- "${remove.content.slice(0, 30)}..."`);
            }
        }
    }

    // Apply updates
    for (const update of toUpdate) {
        await supabaseDb
            .from('memories')
            .update({ decay_factor: update.newDecay })
            .eq('id', update.id);
    }

    // Delete merged duplicates
    if (toDelete.length > 0) {
        await supabaseDb
            .from('memories')
            .delete()
            .in('id', toDelete);
    }

    return toDelete.length;
}

/**
 * Promote frequently accessed memories to long-term storage
 * Updates type and boosts confidence
 */
async function promoteImportantMemories(userId: string): Promise<number> {
    const { data: memories, error } = await supabaseDb
        .from('memories')
        .select('*')
        .eq('user_id', userId)
        .neq('type', 'semantic') // Don't promote already long-term
        .gte('access_count', CONSOLIDATION_CONFIG.promotionThreshold);

    if (error || !memories) return 0;

    let promoted = 0;
    for (const memory of memories) {
        // Boost for emotional memories
        let newDecay = memory.decay_factor;
        if (memory.emotional_valence && Math.abs(memory.emotional_valence) > 0.5) {
            newDecay = Math.min(1, newDecay + CONSOLIDATION_CONFIG.emotionalBoost);
        }

        await supabaseDb
            .from('memories')
            .update({
                type: 'semantic', // Promote to long-term semantic
                decay_factor: Math.min(1, newDecay + 0.1)
            })
            .eq('id', memory.id);

        promoted++;
    }

    return promoted;
}

/**
 * Archive (soft delete) memories with very low confidence
 * Keeps them but marks as archived
 */
async function archiveLowConfidenceMemories(userId: string): Promise<number> {
    const { data, error } = await supabaseDb
        .from('memories')
        .update({ archived: true })
        .eq('user_id', userId)
        .lt('decay_factor', CONSOLIDATION_CONFIG.archiveThreshold)
        .eq('archived', false)
        .select('id');

    if (error) return 0;
    return data?.length || 0;
}

// ==========================================
// SCHEDULER
// ==========================================

const consolidationTimers = new Map<string, NodeJS.Timeout>();

/**
 * Schedule periodic consolidation for a user
 * Call this when user logs in or starts a session
 */
export function scheduleConsolidation(
    userId: string,
    intervalHours: number = 4
): void {
    // Clear existing timer
    if (consolidationTimers.has(userId)) {
        clearInterval(consolidationTimers.get(userId)!);
    }

    // Set up periodic consolidation
    const timer = setInterval(
        () => consolidateUserMemories(userId),
        intervalHours * 60 * 60 * 1000
    );

    consolidationTimers.set(userId, timer);
    console.log(`[MemoryConsolidation] Scheduled every ${intervalHours}h for ${userId.slice(0, 8)}`);
}

/**
 * Stop consolidation scheduler for a user
 * Call this on logout or session end
 */
export function stopConsolidation(userId: string): void {
    const timer = consolidationTimers.get(userId);
    if (timer) {
        clearInterval(timer);
        consolidationTimers.delete(userId);
    }
}

/**
 * Run consolidation on session end
 * Quick consolidation focusing on recent memories
 */
export async function onSessionEnd(userId: string): Promise<void> {
    console.log(`[MemoryConsolidation] Session end cleanup for ${userId.slice(0, 8)}`);
    await consolidateUserMemories(userId);
}
