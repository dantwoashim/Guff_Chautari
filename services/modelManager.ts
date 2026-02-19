
/**
 * @file services/modelManager.ts
 * @description Manages model selection, quota tracking, and automatic fallback strategies.
 */

export type ModelTier = 'chat' | 'complex' | 'vision' | 'speech';

interface TierConfig {
    primary: string;
    fallbackChain: string[];  // Multiple fallbacks in order
    currentIndex: number;     // Which model in chain we're using (0 = primary)
    lastFailure: number;
    label: string;
}

// 30 Seconds cooldown: The app will retry the Primary model 30s after a quota limit is hit.
const COOLDOWN_MS = 30000;

const TIER_CONFIGS: Record<ModelTier, TierConfig> = {
    chat: {
        label: 'Chat',
        // Fallback chain: 3-pro → 3-flash → 2.5-pro (seamless, no notifications)
        primary: 'gemini-3-pro-preview',
        fallbackChain: ['gemini-3-flash-preview', 'gemini-2.5-pro-preview'],
        currentIndex: 0,
        lastFailure: 0
    },
    complex: {
        label: 'Cognitive',
        // Same chain for complex reasoning
        primary: 'gemini-3-pro-preview',
        fallbackChain: ['gemini-3-flash-preview', 'gemini-2.5-pro-preview'],
        currentIndex: 0,
        lastFailure: 0
    },
    vision: {
        label: 'Vision',
        // Updated: Use gemini-2.5-flash-image as primary (more stable)
        primary: 'gemini-2.5-flash-preview-image',
        fallbackChain: ['gemini-2.0-flash-preview-image'],
        currentIndex: 0,
        lastFailure: 0
    },
    speech: {
        label: 'Speech',
        primary: 'gemini-2.5-flash-preview-tts',
        fallbackChain: [], // No fallback
        currentIndex: 0,
        lastFailure: 0
    }
};


export const modelManager = {
    /**
     * Returns the appropriate model name based on current quota status.
     * Uses fallback chain: tries each model in order until one works.
     * Seamlessly switches without notifications.
     */
    getModel(tier: ModelTier): string {
        const config = TIER_CONFIGS[tier];
        const now = Date.now();

        // If cooldown passed, reset to primary
        if (config.lastFailure > 0 && (now - config.lastFailure >= COOLDOWN_MS)) {
            config.currentIndex = 0;
            config.lastFailure = 0;
        }

        // Return current model in chain
        if (config.currentIndex === 0) {
            return config.primary;
        }

        // Return fallback at currentIndex - 1 (since 0 = primary)
        const fallbackIndex = config.currentIndex - 1;
        if (fallbackIndex < config.fallbackChain.length) {
            return config.fallbackChain[fallbackIndex];
        }

        // If we've exhausted fallbacks, return last available
        return config.fallbackChain[config.fallbackChain.length - 1] || config.primary;
    },

    /**
     * Returns all models in the chain for a tier.
     */
    getAllModels(tier: ModelTier): string[] {
        const config = TIER_CONFIGS[tier];
        return [config.primary, ...config.fallbackChain];
    },

    /**
     * Returns metadata about the current model (silent - no UI notifications).
     */
    getModelInfo(tier: ModelTier) {
        const config = TIER_CONFIGS[tier];
        const currentModel = this.getModel(tier);

        return {
            name: currentModel,
            isFallback: config.currentIndex > 0,
            tier: config.label,
            chainPosition: config.currentIndex,
            chainLength: config.fallbackChain.length + 1
        };
    },

    /**
     * Advances to next model in fallback chain (silent - no notifications).
     */
    advanceToNextModel(tier: ModelTier): string | null {
        const config = TIER_CONFIGS[tier];
        const maxIndex = config.fallbackChain.length; // 0 = primary, 1...n = fallbacks

        if (config.currentIndex < maxIndex) {
            config.currentIndex++;
            config.lastFailure = Date.now();
            // Silent switch - no console output for seamless experience
            return this.getModel(tier);
        }

        // No more fallbacks available
        return null;
    },

    /**
     * Reports a failure - advances to next model seamlessly.
     */
    reportFailure(tier: ModelTier) {
        this.advanceToNextModel(tier);
    },

    /**
     * Checks if an error object is likely a quota or overload error.
     * Handles nested Google API error structures.
     */
    isQuotaError(error: any): boolean {
        if (!error) return false;

        // Helper to check a specific object level
        const checkObj = (obj: any) => {
            const str = JSON.stringify(obj || {}).toLowerCase();
            const msg = (obj.message || '').toLowerCase();
            const status = obj.status;
            const code = obj.code;

            return (
                status === 429 ||
                status === 503 ||
                status === 500 ||
                code === 429 ||
                code === 503 ||
                code === 500 ||
                msg.includes('429') ||
                msg.includes('quota') ||
                msg.includes('resource') ||
                msg.includes('exhausted') ||
                msg.includes('too many requests') ||
                msg.includes('overloaded') ||
                msg.includes('busy') ||
                status === 404 ||
                code === 404 ||
                msg.includes('not found') ||
                str.includes('quota') ||
                str.includes('429') ||
                str.includes('overloaded')
            );
        };

        if (checkObj(error)) return true;
        if (error.error && checkObj(error.error)) return true;
        if (error.response && checkObj(error.response)) return true;

        return false;
    },

    /**
     * Executes an AI operation with automatic fallback chain retry.
     * Seamlessly tries each model in the chain until one works.
     */
    async runWithFallback<T>(
        tier: ModelTier,
        operation: (model: string) => Promise<T>
    ): Promise<T> {
        const config = TIER_CONFIGS[tier];
        const allModels = this.getAllModels(tier);
        let lastError: any = null;

        // Try each model in the chain
        for (let i = config.currentIndex; i <= config.fallbackChain.length; i++) {
            const model = i === 0 ? config.primary : config.fallbackChain[i - 1];

            try {
                const result = await operation(model);
                // Success - update current index if we moved
                if (i !== config.currentIndex) {
                    config.currentIndex = i;
                    config.lastFailure = Date.now();
                }
                return result;
            } catch (error: any) {
                lastError = error;

                if (this.isQuotaError(error)) {
                    // Seamlessly try next model (no logging for smooth UX)
                    continue;
                }
                // Non-quota error - don't try other models
                throw error;
            }
        }

        // All models exhausted
        throw lastError || new Error(`All models exhausted for tier: ${tier}`);
    }
};

