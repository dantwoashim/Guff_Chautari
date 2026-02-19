/**
 * @file services/personaGraph/contextCompiler.ts
 * @description Dynamic prompt compiler - assembles persona nodes into optimized prompts
 * 
 * This is the heart of CPR: taking the detected context and retrieving
 * exactly the right persona nodes to create a focused, powerful prompt.
 */

import {
    PersonaGraph,
    PersonaNode,
    MessageContext,
    ConversationState,
    CompiledPrompt,
    CompilationOptions,
    NodeCategory,
    NodePriority
} from './nodeTypes';

// =====================================================
// DEFAULT OPTIONS
// =====================================================

const DEFAULT_OPTIONS: CompilationOptions = {
    tokenBudget: 2000,
    includeStateContext: true
};

// =====================================================
// NODE RETRIEVAL
// =====================================================

/**
 * Find nodes triggered by detected topics
 */
function findTriggeredNodes(
    graph: PersonaGraph,
    topics: string[]
): PersonaNode[] {
    const nodeIds = new Set<string>();

    for (const topic of topics) {
        // Check trigger index for this topic
        const triggered = graph.triggerIndex.get(topic.toLowerCase());
        if (triggered) {
            triggered.forEach(id => nodeIds.add(id));
        }

        // Also check if topic matches a category
        if (graph.nodesByCategory.has(topic as NodeCategory)) {
            const categoryNodes = graph.nodesByCategory.get(topic as NodeCategory) || [];
            categoryNodes.forEach(id => nodeIds.add(id));
        }
    }

    // Convert to nodes
    const nodes: PersonaNode[] = [];
    for (const id of nodeIds) {
        const node = graph.nodes.get(id);
        if (node) nodes.push(node);
    }

    return nodes;
}

/**
 * Get nodes by priority level
 */
function getNodesByPriority(
    graph: PersonaGraph,
    priority: NodePriority
): PersonaNode[] {
    const ids = graph.nodesByPriority.get(priority) || [];
    return ids.map(id => graph.nodes.get(id)).filter(Boolean) as PersonaNode[];
}

/**
 * Get nodes by category
 */
function getNodesByCategory(
    graph: PersonaGraph,
    category: NodeCategory
): PersonaNode[] {
    const ids = graph.nodesByCategory.get(category) || [];
    return ids.map(id => graph.nodes.get(id)).filter(Boolean) as PersonaNode[];
}

/**
 * Check if a node should be included based on context triggers
 */
function checkContextTriggers(
    node: PersonaNode,
    context: MessageContext,
    state: ConversationState
): boolean {
    if (!node.contextTriggers) return true;

    const triggers = node.contextTriggers;

    if (triggers.emotionalIntensity !== undefined) {
        if (context.emotionalIntensity < triggers.emotionalIntensity) return false;
    }

    if (triggers.trustLevel !== undefined) {
        if (state.trustLevel < triggers.trustLevel) return false;
    }

    if (triggers.timeOfDay && triggers.timeOfDay.length > 0) {
        if (!triggers.timeOfDay.includes(context.timeOfDay)) return false;
    }

    return true;
}

// =====================================================
// PRIORITY SCORING
// =====================================================

/**
 * Calculate inclusion score for a node
 * Higher score = higher priority for inclusion
 */
function calculateInclusionScore(
    node: PersonaNode,
    context: MessageContext,
    state: ConversationState
): number {
    let score = 0;

    // Base priority scores
    const priorityScores: Record<NodePriority, number> = {
        core: 100,
        important: 50,
        contextual: 25,
        deep: 10
    };
    score += priorityScores[node.priority];

    // Topic relevance boost
    for (const topic of context.topics) {
        if (node.triggers.some(t => t.toLowerCase().includes(topic.toLowerCase()))) {
            score += 30;
        }
        if (node.category === topic) {
            score += 40;
        }
    }

    // Emotional intensity boost for emotional/relationship nodes
    if (context.emotionalIntensity > 0.5) {
        if (node.category === 'emotional' || node.category === 'relationship') {
            score += 25 * context.emotionalIntensity;
        }
    }

    // Trust-based unlocking for deep nodes
    if (node.priority === 'deep' && state.trustLevel > 0.5) {
        score += 20 * state.trustLevel;
    }

    // Time-of-day relevance
    if (context.timeOfDay === 'late_night') {
        if (node.category === 'emotional' || node.category === 'relationship') {
            score += 15;
        }
    }

    // Relationship signal boosts
    if (context.relationshipSignals.includes('vulnerability')) {
        if (node.category === 'relationship' || node.category === 'emotional') {
            score += 30;
        }
    }

    // Token efficiency penalty (prefer smaller nodes if content similar)
    score -= node.tokenCount * 0.01;

    return score;
}

// =====================================================
// PROMPT ASSEMBLY
// =====================================================

/**
 * Assemble nodes into a cohesive prompt
 */
function assemblePrompt(
    nodes: PersonaNode[],
    context: MessageContext,
    state: ConversationState,
    options: CompilationOptions
): string {
    const sections: string[] = [];

    // Group nodes by category for organized output
    const byCategory = new Map<string, PersonaNode[]>();
    for (const node of nodes) {
        const existing = byCategory.get(node.category) || [];
        existing.push(node);
        byCategory.set(node.category, existing);
    }

    // 1. Core identity (always first)
    const identityNodes = byCategory.get('identity') || [];
    if (identityNodes.length > 0) {
        sections.push('[CORE IDENTITY]');
        sections.push(identityNodes.map(n => n.content).join('\n'));
    }

    // 2. Language patterns (critical for voice)
    const languageNodes = byCategory.get('language') || [];
    if (languageNodes.length > 0) {
        sections.push('\n[LANGUAGE & TEXTING PATTERNS]');
        sections.push(languageNodes.map(n => n.content).join('\n'));
    }

    // 3. Meta instructions (response rules)
    const metaNodes = byCategory.get('meta') || [];
    if (metaNodes.length > 0) {
        sections.push('\n[RESPONSE RULES]');
        sections.push(metaNodes.map(n => n.content).join('\n'));
    }

    // 4. Contextual content based on detected topics
    const contextualCategories: NodeCategory[] = [
        'emotional', 'family', 'spiritual', 'relationship', 'physical', 'daily', 'history', 'topics'
    ];

    for (const category of contextualCategories) {
        const categoryNodes = byCategory.get(category) || [];
        if (categoryNodes.length > 0) {
            // Only include if relevant to context
            const isRelevant = context.topics.some(t =>
                t.includes(category) ||
                categoryNodes.some(n => n.triggers.some(tr =>
                    context.topics.some(ct => tr.toLowerCase().includes(ct.toLowerCase()))
                ))
            );

            if (isRelevant) {
                const categoryTitle = category.charAt(0).toUpperCase() + category.slice(1);
                sections.push(`\n[${categoryTitle.toUpperCase()} CONTEXT]`);
                sections.push(categoryNodes.map(n => n.content).join('\n'));
            }
        }
    }

    // 5. Add state context if enabled
    if (options.includeStateContext) {
        sections.push('\n[CURRENT STATE]');
        sections.push(`Conversation depth: ${(state.emotionalDepthReached * 100).toFixed(0)}%`);
        sections.push(`Trust level: ${(state.trustLevel * 100).toFixed(0)}%`);
        sections.push(`Time: ${context.timeOfDay}`);

        if (context.timeOfDay === 'late_night') {
            sections.push('(Late night - walls down, more open to vulnerability)');
        }

        if (state.vulnerabilityShared) {
            sections.push('(User has shared vulnerable moments - reciprocate appropriately)');
        }
    }

    return sections.join('\n');
}

// =====================================================
// MAIN COMPILATION FUNCTION
// =====================================================

/**
 * Compile a dynamic, context-aware prompt from persona graph
 * 
 * @param graph The persona knowledge graph
 * @param context Detected message context
 * @param state Current conversation state
 * @param options Compilation options
 * @returns CompiledPrompt with assembled prompt and metadata
 */
export function compileContextualPrompt(
    graph: PersonaGraph,
    context: MessageContext,
    state: ConversationState,
    options: Partial<CompilationOptions> = {}
): CompiledPrompt {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const selectedNodes: PersonaNode[] = [];
    const retrievalReason = new Map<string, string>();
    let currentTokens = 0;

    console.log(`[CPR] Compiling prompt with budget: ${opts.tokenBudget} tokens`);

    // 1. ALWAYS include core nodes (identity + language patterns)
    for (const coreId of graph.coreNodeIds) {
        const node = graph.nodes.get(coreId);
        if (node) {
            selectedNodes.push(node);
            currentTokens += node.tokenCount;
            retrievalReason.set(node.id, 'Core node - always included');
        }
    }

    console.log(`[CPR] Core nodes: ${selectedNodes.length} (${currentTokens} tokens)`);

    // 2. Add force-included nodes if specified
    if (opts.forceIncludeNodes) {
        for (const nodeId of opts.forceIncludeNodes) {
            const node = graph.nodes.get(nodeId);
            if (node && !selectedNodes.includes(node)) {
                if (currentTokens + node.tokenCount <= opts.tokenBudget) {
                    selectedNodes.push(node);
                    currentTokens += node.tokenCount;
                    retrievalReason.set(node.id, 'Force included');
                }
            }
        }
    }

    // 3. Find nodes triggered by message topics
    const triggeredNodes = findTriggeredNodes(graph, context.topics);

    // 4. Score all potential nodes
    const allPotentialNodes = new Set<PersonaNode>();
    triggeredNodes.forEach(n => allPotentialNodes.add(n));

    // Add important nodes if emotional intensity is high
    if (context.emotionalIntensity > 0.5) {
        getNodesByPriority(graph, 'important').forEach(n => allPotentialNodes.add(n));
    }

    // Add contextual nodes for specific topics
    if (context.requiresDeepContext) {
        getNodesByPriority(graph, 'contextual').forEach(n => allPotentialNodes.add(n));
    }

    // Add deep nodes if trust is high enough
    if (state.trustLevel > 0.6 || context.messageType === 'vulnerable') {
        getNodesByPriority(graph, 'deep').forEach(n => allPotentialNodes.add(n));
    }

    // Score and sort potential nodes
    const scoredNodes = Array.from(allPotentialNodes)
        .filter(node => !selectedNodes.includes(node))
        .filter(node => !opts.excludeCategories?.includes(node.category))
        .filter(node => checkContextTriggers(node, context, state))
        .map(node => ({
            node,
            score: calculateInclusionScore(node, context, state)
        }))
        .sort((a, b) => b.score - a.score);

    // 5. Add nodes up to token budget
    for (const { node, score } of scoredNodes) {
        if (currentTokens + node.tokenCount <= opts.tokenBudget) {
            selectedNodes.push(node);
            currentTokens += node.tokenCount;
            retrievalReason.set(node.id, `Score: ${score.toFixed(1)} - triggered by: ${context.topics.join(', ')}`);
        }
    }

    console.log(`[CPR] Total nodes selected: ${selectedNodes.length} (${currentTokens} tokens)`);

    // 6. Assemble the prompt
    const prompt = assemblePrompt(selectedNodes, context, state, opts);

    // 7. Build section breakdown
    const sections = buildSectionBreakdown(selectedNodes);

    return {
        prompt,
        sections,
        totalTokens: currentTokens,
        nodesIncluded: selectedNodes.length,
        nodesAvailable: graph.nodes.size,
        retrievalReason
    };
}

/**
 * Build section breakdown for debugging/logging
 */
function buildSectionBreakdown(nodes: PersonaNode[]): CompiledPrompt['sections'] {
    const byCategory = new Map<string, PersonaNode[]>();

    for (const node of nodes) {
        const existing = byCategory.get(node.category) || [];
        existing.push(node);
        byCategory.set(node.category, existing);
    }

    return Array.from(byCategory.entries()).map(([category, categoryNodes]) => ({
        name: category,
        content: categoryNodes.map(n => n.content).join('\n'),
        tokens: categoryNodes.reduce((sum, n) => sum + n.tokenCount, 0),
        nodeIds: categoryNodes.map(n => n.id)
    }));
}

// =====================================================
// FIRST MESSAGE COMPILATION
// =====================================================

/**
 * Compile a comprehensive prompt for the first message
 * Includes more context since relationship is being established
 */
export function compileFirstMessagePrompt(
    graph: PersonaGraph,
    context: MessageContext,
    state: ConversationState
): CompiledPrompt {
    // For first message, increase token budget and include more context
    return compileContextualPrompt(graph, context, state, {
        tokenBudget: 3000,  // More generous for first message
        includeStateContext: false  // No state to include yet
    });
}

export default {
    compileContextualPrompt,
    compileFirstMessagePrompt
};
