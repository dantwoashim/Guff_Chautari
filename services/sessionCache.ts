/**
 * @file services/sessionCache.ts
 * @description Stateful Chat Session Cache for SOTA Token Optimization
 * 
 * Instead of creating a new chat session (and resending full persona) on every message,
 * we PERSIST the session and reuse it. The persona is sent ONCE per conversation.
 * 
 * Token Savings: ~5K tokens per message after the first
 */

import { Chat } from "@google/genai";

// =====================================================
// TYPES
// =====================================================

interface CachedSession {
    chat: Chat;
    personaId: string;
    conversationId: string;
    createdAt: Date;
    lastUsed: Date;
    messageCount: number;
}

interface SessionCacheConfig {
    ttlMs: number;           // Time-to-live in milliseconds
    maxSessions: number;     // Maximum sessions to cache
    cleanupIntervalMs: number;
}

// =====================================================
// CONFIGURATION
// =====================================================

const DEFAULT_CONFIG: SessionCacheConfig = {
    ttlMs: 30 * 60 * 1000,        // 30 minutes TTL
    maxSessions: 50,              // Max 50 concurrent sessions
    cleanupIntervalMs: 5 * 60 * 1000  // Cleanup every 5 minutes
};

// =====================================================
// SESSION CACHE
// =====================================================

class SessionCache {
    private cache: Map<string, CachedSession> = new Map();
    private config: SessionCacheConfig;
    private cleanupInterval: ReturnType<typeof setInterval> | null = null;

    constructor(config: Partial<SessionCacheConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.startCleanupInterval();
    }

    /**
     * Generate a unique cache key for a conversation + persona combination
     */
    private getCacheKey(conversationId: string, personaId: string): string {
        return `${conversationId}::${personaId}`;
    }

    /**
     * Get an existing session if available and valid
     */
    get(conversationId: string, personaId: string): Chat | null {
        const key = this.getCacheKey(conversationId, personaId);
        const cached = this.cache.get(key);

        if (!cached) {
            console.log(`[SessionCache] MISS for conversation ${conversationId.slice(0, 8)}...`);
            return null;
        }

        // Check if expired
        const age = Date.now() - cached.lastUsed.getTime();
        if (age > this.config.ttlMs) {
            console.log(`[SessionCache] EXPIRED for conversation ${conversationId.slice(0, 8)}... (age: ${Math.round(age / 1000)}s)`);
            this.cache.delete(key);
            return null;
        }

        // Update last used
        cached.lastUsed = new Date();
        cached.messageCount++;

        console.log(`[SessionCache] HIT for conversation ${conversationId.slice(0, 8)}... (messages: ${cached.messageCount}, saved ~5K tokens)`);
        return cached.chat;
    }

    /**
     * Store a new session in the cache
     */
    set(conversationId: string, personaId: string, chat: Chat): void {
        const key = this.getCacheKey(conversationId, personaId);

        // Enforce max sessions limit (LRU eviction)
        if (this.cache.size >= this.config.maxSessions) {
            this.evictOldest();
        }

        this.cache.set(key, {
            chat,
            personaId,
            conversationId,
            createdAt: new Date(),
            lastUsed: new Date(),
            messageCount: 1
        });

        console.log(`[SessionCache] STORED new session for conversation ${conversationId.slice(0, 8)}... (total: ${this.cache.size})`);
    }

    /**
     * Invalidate a session (e.g., when persona changes or user explicitly clears)
     */
    invalidate(conversationId: string, personaId?: string): void {
        if (personaId) {
            const key = this.getCacheKey(conversationId, personaId);
            const deleted = this.cache.delete(key);
            if (deleted) {
                console.log(`[SessionCache] INVALIDATED session for conversation ${conversationId.slice(0, 8)}...`);
            }
        } else {
            // Invalidate ALL sessions for this conversation (any persona)
            let count = 0;
            for (const [key] of this.cache) {
                if (key.startsWith(`${conversationId}::`)) {
                    this.cache.delete(key);
                    count++;
                }
            }
            if (count > 0) {
                console.log(`[SessionCache] INVALIDATED ${count} session(s) for conversation ${conversationId.slice(0, 8)}...`);
            }
        }
    }

    /**
     * Invalidate ALL sessions for a specific persona (e.g., when persona is edited)
     */
    invalidateByPersona(personaId: string): void {
        let count = 0;
        for (const [key, cached] of this.cache) {
            if (cached.personaId === personaId) {
                this.cache.delete(key);
                count++;
            }
        }
        if (count > 0) {
            console.log(`[SessionCache] INVALIDATED ${count} session(s) for persona ${personaId.slice(0, 8)}...`);
        }
    }

    /**
     * Clear all sessions
     */
    clear(): void {
        const count = this.cache.size;
        this.cache.clear();
        console.log(`[SessionCache] CLEARED all ${count} sessions`);
    }

    /**
     * Get cache statistics
     */
    getStats(): { size: number; sessions: Array<{ conversationId: string; messageCount: number; ageMs: number }> } {
        const sessions = [];
        for (const [, cached] of this.cache) {
            sessions.push({
                conversationId: cached.conversationId,
                messageCount: cached.messageCount,
                ageMs: Date.now() - cached.createdAt.getTime()
            });
        }
        return { size: this.cache.size, sessions };
    }

    // =====================================================
    // INTERNAL METHODS
    // =====================================================

    private evictOldest(): void {
        let oldest: { key: string; lastUsed: Date } | null = null;

        for (const [key, cached] of this.cache) {
            if (!oldest || cached.lastUsed < oldest.lastUsed) {
                oldest = { key, lastUsed: cached.lastUsed };
            }
        }

        if (oldest) {
            this.cache.delete(oldest.key);
            console.log(`[SessionCache] EVICTED oldest session (LRU)`);
        }
    }

    private cleanupStale(): void {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, cached] of this.cache) {
            if (now - cached.lastUsed.getTime() > this.config.ttlMs) {
                this.cache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`[SessionCache] Cleaned up ${cleaned} stale session(s)`);
        }
    }

    private startCleanupInterval(): void {
        // Only run in browser environment
        if (typeof window !== 'undefined') {
            this.cleanupInterval = setInterval(() => {
                this.cleanupStale();
            }, this.config.cleanupIntervalMs);
        }
    }

    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.cache.clear();
    }
}

// =====================================================
// SINGLETON EXPORT
// =====================================================

export const sessionCache = new SessionCache();

// Export class for testing
export { SessionCache };
export type { CachedSession, SessionCacheConfig };
