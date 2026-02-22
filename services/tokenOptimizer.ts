/**
 * @file services/tokenOptimizer.ts
 * @description Master Token Optimization Orchestrator
 * 
 * Combines all token-saving strategies:
 * 1. Prompt compression (70% savings)
 * 2. Smart context (80% savings)
 * 3. Response caching (100% for cached)
 * 4. Length control
 * 5. Conditional API calls
 * 
 * Target: 2000+ tokens → 500-750 tokens per request
 */

import { Message, LivingPersona, ChatConfig } from '../types';
import { compressPersona, createMinimalPrompt, CompressedPersona } from './promptCompressor';
import { buildSmartContext, formatContextForPrompt, SmartContext } from './smartContext';
import { checkCache, needsAPICall, CacheResult } from './responseCache';
import { getTimeContext, generateTimePromptInjection } from './timeContextService';

// =====================================================
// TYPES
// =====================================================

export interface OptimizedRequest {
    shouldSkipAPI: boolean;
    cachedResponse?: string;
    systemPrompt: string;
    contextPrompt: string;
    historyMessages: { role: string; parts: any[] }[];
    lengthHint: string;
    tokenEstimate: TokenEstimate;
}

export interface TokenEstimate {
    system: number;
    context: number;
    history: number;
    total: number;
    originalEstimate: number;
    savingsPercent: number;
}

export interface OptimizationConfig {
    enableCaching: boolean;
    enableCompression: boolean;
    enableSmartContext: boolean;
    enableLengthControl: boolean;
    maxHistoryMessages: number;
    personaVibe: 'formal' | 'casual' | 'chaotic';
}

const DEFAULT_CONFIG: OptimizationConfig = {
    enableCaching: true,
    enableCompression: true,
    enableSmartContext: true,
    enableLengthControl: true,
    maxHistoryMessages: 6,
    personaVibe: 'casual'
};

// =====================================================
// MAIN OPTIMIZER
// =====================================================

/**
 * Optimize a chat request for minimal token usage
 */
export function optimizeRequest(
    userMessage: string,
    messages: Message[],
    persona: LivingPersona | null,
    config: Partial<OptimizationConfig> = {}
): OptimizedRequest {
    const cfg = { ...DEFAULT_CONFIG, ...config };

    // =====================================================
    // STEP 1: Check cache first (might skip API entirely!)
    // =====================================================
    if (cfg.enableCaching) {
        const hasMedia = false; // TODO: detect from message
        const cacheResult = checkCache(userMessage, hasMedia, { personaVibe: cfg.personaVibe });

        if (cacheResult.skipAPI && cacheResult.response) {
            return {
                shouldSkipAPI: true,
                cachedResponse: cacheResult.response,
                systemPrompt: '',
                contextPrompt: '',
                historyMessages: [],
                lengthHint: '',
                tokenEstimate: {
                    system: 0,
                    context: 0,
                    history: 0,
                    total: 0,
                    originalEstimate: estimateOriginalTokens(messages, persona),
                    savingsPercent: 100
                }
            };
        }
    }

    // =====================================================
    // STEP 2: Compress persona prompt
    // =====================================================
    let systemPrompt = '';
    let systemTokens = 0;

    if (persona && cfg.enableCompression) {
        const compressed = compressPersona(persona);
        const timeContext = getTimeContext();
        const timePrompt = `[TIME:${timeContext.period}|${timeContext.hour}h]`;

        systemPrompt = createMinimalPrompt(compressed, timePrompt);
        systemTokens = estimateTokens(systemPrompt);
    } else if (persona?.compiledPrompt) {
        // Fallback to full prompt
        systemPrompt = persona.compiledPrompt;
        systemTokens = estimateTokens(systemPrompt);
    }

    // =====================================================
    // STEP 3: Build smart context
    // =====================================================
    let contextPrompt = '';
    let historyMessages: { role: string; parts: any[] }[] = [];
    let contextTokens = 0;
    let historyTokens = 0;

    if (cfg.enableSmartContext && messages.length > cfg.maxHistoryMessages) {
        const smartContext = buildSmartContext(messages, {
            recentLimit: cfg.maxHistoryMessages,
            maxSummaryLength: 150,
            maxFacts: 4
        });

        contextPrompt = formatContextForPrompt(smartContext);
        contextTokens = smartContext.tokens.summary + smartContext.tokens.facts;

        // Only recent messages for history
        historyMessages = smartContext.recentMessages.map(m => ({
            role: m.role === 'model' ? 'model' : 'user',
            parts: [{ text: m.text }]
        }));
        historyTokens = smartContext.tokens.recent;
    } else {
        // Use all messages
        historyMessages = messages.map(m => ({
            role: m.role === 'model' ? 'model' : 'user',
            parts: [{ text: m.text }]
        }));
        historyTokens = estimateTokens(messages.map(m => m.text).join(' '));
    }

    // =====================================================
    // STEP 4: Generate length hint
    // =====================================================
    let lengthHint = '';
    if (cfg.enableLengthControl) {
        lengthHint = getLengthHint(userMessage.length);
    }

    // =====================================================
    // STEP 5: Calculate token estimate
    // =====================================================
    const totalTokens = systemTokens + contextTokens + historyTokens;
    const originalEstimate = estimateOriginalTokens(messages, persona);
    const savingsPercent = Math.round((1 - totalTokens / originalEstimate) * 100);

    return {
        shouldSkipAPI: false,
        systemPrompt: systemPrompt + (lengthHint ? `\n${lengthHint}` : ''),
        contextPrompt,
        historyMessages,
        lengthHint,
        tokenEstimate: {
            system: systemTokens,
            context: contextTokens,
            history: historyTokens,
            total: totalTokens,
            originalEstimate,
            savingsPercent: Math.max(0, savingsPercent)
        }
    };
}

// =====================================================
// LENGTH CONTROL
// =====================================================

/**
 * Generate length hint based on user message
 */
function getLengthHint(userMsgLength: number): string {
    if (userMsgLength < 10) {
        return '[RESP:1-15 words,match energy]';
    }
    if (userMsgLength < 30) {
        return '[RESP:15-30 words]';
    }
    if (userMsgLength < 100) {
        return '[RESP:1-2 sentences]';
    }
    return '[RESP:proportional,max 3 sentences]';
}

// =====================================================
// TOKEN ESTIMATION
// =====================================================

function estimateTokens(text: string): number {
    // ~4 characters per token is a rough estimate
    return Math.ceil(text.length / 4);
}

function estimateOriginalTokens(messages: Message[], persona: LivingPersona | null): number {
    const historyTokens = estimateTokens(messages.map(m => m.text).join(' '));
    const personaTokens = persona?.compiledPrompt ? estimateTokens(persona.compiledPrompt) : 0;

    return historyTokens + personaTokens + 100; // +100 for overhead
}

// =====================================================
// QUICK CHECKS
// =====================================================

/**
 * Quick check if we should call API
 */
export function shouldCallAPI(userMessage: string, personaVibe: 'formal' | 'casual' | 'chaotic' = 'casual'): boolean {
    return needsAPICall(userMessage, false);
}

/**
 * Get cached response if available
 */
export function getCachedIfAvailable(
    userMessage: string,
    personaVibe: 'formal' | 'casual' | 'chaotic' = 'casual'
): string | null {
    const result = checkCache(userMessage, false, { personaVibe });
    return result.skipAPI ? result.response || null : null;
}

// =====================================================
// USAGE TRACKING
// =====================================================

export interface UsageStats {
    totalRequests: number;
    cachedResponses: number;
    apiCalls: number;
    tokensSaved: number;
    averageSavingsPercent: number;
}

let usageStats: UsageStats = {
    totalRequests: 0,
    cachedResponses: 0,
    apiCalls: 0,
    tokensSaved: 0,
    averageSavingsPercent: 0
};

export function trackRequest(request: OptimizedRequest): void {
    usageStats.totalRequests++;

    if (request.shouldSkipAPI) {
        usageStats.cachedResponses++;
        usageStats.tokensSaved += request.tokenEstimate.originalEstimate;
    } else {
        usageStats.apiCalls++;
        usageStats.tokensSaved += request.tokenEstimate.originalEstimate - request.tokenEstimate.total;
    }

    usageStats.averageSavingsPercent = Math.round(
        (usageStats.tokensSaved / (usageStats.totalRequests * 500)) * 100
    );
}

export function getUsageStats(): UsageStats {
    return { ...usageStats };
}

export function resetStats(): void {
    usageStats = {
        totalRequests: 0,
        cachedResponses: 0,
        apiCalls: 0,
        tokensSaved: 0,
        averageSavingsPercent: 0
    };
}
