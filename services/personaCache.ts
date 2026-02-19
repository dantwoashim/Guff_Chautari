/**
 * @file services/personaCache.ts
 * @description Gemini Explicit Context Caching for Persona Prompts
 * 
 * This service implements Gemini's explicit caching API to:
 * 1. Upload the FULL 42k+ persona prompt ONCE
 * 2. Store it server-side with a TTL
 * 3. Reference it cheaply for all subsequent API calls
 * 
 * ZERO QUALITY LOSS - The full persona is preserved, just cached.
 * COST SAVINGS: ~75% reduction in token costs after first message.
 */

import { GoogleGenAI } from "@google/genai";

// =====================================================
// TYPES
// =====================================================

interface PersonaCacheEntry {
    cacheName: string;      // Gemini cache reference (e.g., "cachedContents/abc123")
    personaId: string;
    promptHash: string;     // Hash of persona prompt to detect changes
    createdAt: number;
    expiresAt: number;      // TTL tracking
    tokenCount: number;     // Estimated tokens cached
}

interface CacheStats {
    hits: number;
    misses: number;
    creations: number;
    invalidations: number;
    tokensSaved: number;
}

// =====================================================
// CONFIGURATION
// =====================================================

const DEFAULT_TTL_SECONDS = 3600;  // 1 hour
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;  // Refresh if expiring in 5 minutes
const MIN_TOKENS_FOR_CACHING = 1000;  // Don't cache small prompts

// =====================================================
// STATE
// =====================================================

// In-memory tracking of active caches (persists across requests in session)
const activeCaches = new Map<string, PersonaCacheEntry>();

// Statistics for monitoring
const stats: CacheStats = {
    hits: 0,
    misses: 0,
    creations: 0,
    invalidations: 0,
    tokensSaved: 0
};

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Simple hash function for detecting prompt changes
 */
function hashPrompt(prompt: string): string {
    let hash = 0;
    for (let i = 0; i < prompt.length; i++) {
        const char = prompt.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
}

/**
 * Estimate token count from text
 */
function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

/**
 * Create cache key from persona ID
 */
function getCacheKey(personaId: string): string {
    return `persona-${personaId}`;
}

// =====================================================
// MAIN FUNCTIONS
// =====================================================

/**
 * Get or create a cached persona
 * 
 * This uploads the FULL persona to Gemini's cache server-side.
 * Subsequent calls with the same personaId will return the cached version.
 * 
 * @param client - GoogleGenAI client instance
 * @param personaId - Unique identifier for the persona
 * @param fullPersonaPrompt - The COMPLETE persona prompt (42k+ characters)
 * @param model - Model to use for caching
 * @returns Cache name to use in generateContent calls
 */
export async function getOrCreatePersonaCache(
    client: GoogleGenAI,
    personaId: string,
    fullPersonaPrompt: string,
    model: string = 'gemini-2.0-flash'
): Promise<string | null> {
    const cacheKey = getCacheKey(personaId);
    const promptHash = hashPrompt(fullPersonaPrompt);
    const estimatedTokens = estimateTokens(fullPersonaPrompt);

    // Skip caching for small prompts (not cost-effective)
    if (estimatedTokens < MIN_TOKENS_FOR_CACHING) {
        console.log(`[PersonaCache] Prompt too small (${estimatedTokens} tokens), skipping cache`);
        return null;
    }

    // Check if we have a valid, unexpired cache
    const existing = activeCaches.get(cacheKey);
    if (existing) {
        // Check if prompt changed
        if (existing.promptHash !== promptHash) {
            console.log(`[PersonaCache] Prompt changed, invalidating cache`);
            await invalidatePersonaCache(client, personaId);
        } else if (existing.expiresAt > Date.now() + REFRESH_THRESHOLD_MS) {
            // Valid cache exists and not expiring soon
            stats.hits++;
            stats.tokensSaved += estimatedTokens;
            console.log(`[PersonaCache] HIT for ${personaId.slice(0, 8)}... (saved ~${estimatedTokens} tokens)`);
            return existing.cacheName;
        } else if (existing.expiresAt > Date.now()) {
            // Cache exists but expiring soon - refresh it
            console.log(`[PersonaCache] Cache expiring soon, refreshing...`);
            await invalidatePersonaCache(client, personaId);
        }
    }

    stats.misses++;

    // Create new cache
    try {
        console.log(`[PersonaCache] Creating cache for ${personaId.slice(0, 8)}... (${estimatedTokens} tokens)`);

        const cache = await client.caches.create({
            model: model,
            config: {
                displayName: `persona-${personaId.slice(0, 8)}-${Date.now()}`,
                systemInstruction: fullPersonaPrompt,
                ttl: `${DEFAULT_TTL_SECONDS}s`
            }
        });

        // Track locally
        const entry: PersonaCacheEntry = {
            cacheName: cache.name!,
            personaId,
            promptHash,
            createdAt: Date.now(),
            expiresAt: Date.now() + (DEFAULT_TTL_SECONDS * 1000),
            tokenCount: estimatedTokens
        };

        activeCaches.set(cacheKey, entry);
        stats.creations++;

        console.log(`[PersonaCache] Created: ${cache.name} (TTL: ${DEFAULT_TTL_SECONDS}s)`);
        return cache.name!;

    } catch (error: any) {
        console.error(`[PersonaCache] Failed to create cache:`, error.message);

        // Check if it's a "cache already exists" error and try to reuse
        if (error.message?.includes('already exists')) {
            console.log(`[PersonaCache] Attempting to reuse existing cache...`);
            // The cache might exist server-side, return null to fall back to direct call
        }

        return null;  // Fall back to direct call without caching
    }
}

/**
 * Invalidate (delete) a persona cache
 * 
 * Call this when:
 * - User edits the persona
 * - Persona is deleted
 * - Cache refresh is needed
 */
export async function invalidatePersonaCache(
    client: GoogleGenAI,
    personaId: string
): Promise<void> {
    const cacheKey = getCacheKey(personaId);
    const existing = activeCaches.get(cacheKey);

    if (existing) {
        try {
            await client.caches.delete({ name: existing.cacheName });
            console.log(`[PersonaCache] Deleted: ${existing.cacheName}`);
        } catch (error: any) {
            // Cache might already be expired/deleted
            console.warn(`[PersonaCache] Delete failed (may be expired): ${error.message}`);
        }

        activeCaches.delete(cacheKey);
        stats.invalidations++;
    }
}

/**
 * Invalidate ALL persona caches
 * 
 * Useful for:
 * - User logout
 * - Major app updates
 * - Debug/testing
 */
export async function invalidateAllCaches(client: GoogleGenAI): Promise<void> {
    console.log(`[PersonaCache] Invalidating all ${activeCaches.size} caches...`);

    for (const [key, entry] of activeCaches) {
        try {
            await client.caches.delete({ name: entry.cacheName });
        } catch (error) {
            // Ignore errors during bulk delete
        }
    }

    activeCaches.clear();
    console.log(`[PersonaCache] All caches invalidated`);
}

/**
 * Get cache statistics
 */
export function getCacheStats(): CacheStats & { activeCaches: number } {
    return {
        ...stats,
        activeCaches: activeCaches.size
    };
}

/**
 * Check if a persona has an active cache
 */
export function hasActiveCache(personaId: string): boolean {
    const cacheKey = getCacheKey(personaId);
    const existing = activeCaches.get(cacheKey);
    return !!(existing && existing.expiresAt > Date.now());
}

/**
 * Get the cache name for a persona (if exists)
 */
export function getCacheName(personaId: string): string | null {
    const cacheKey = getCacheKey(personaId);
    const existing = activeCaches.get(cacheKey);

    if (existing && existing.expiresAt > Date.now()) {
        return existing.cacheName;
    }

    return null;
}

// =====================================================
// LIFECYCLE HOOKS
// =====================================================

/**
 * Cleanup expired caches from local tracking
 * Call this periodically (e.g., every 10 minutes)
 */
export function cleanupExpiredCaches(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of activeCaches) {
        if (entry.expiresAt <= now) {
            activeCaches.delete(key);
            cleaned++;
        }
    }

    if (cleaned > 0) {
        console.log(`[PersonaCache] Cleaned up ${cleaned} expired cache entries`);
    }

    return cleaned;
}

// Run cleanup every 10 minutes (if in browser/long-running context)
if (typeof setInterval !== 'undefined') {
    setInterval(cleanupExpiredCaches, 10 * 60 * 1000);
}

// =====================================================
// EXPORTS
// =====================================================

export type { PersonaCacheEntry, CacheStats };
