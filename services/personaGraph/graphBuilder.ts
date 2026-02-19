/**
 * @file services/personaGraph/graphBuilder.ts
 * @description Decomposes 10,000+ word personas into semantic knowledge graphs
 * 
 * This is the core of CPR Phase 1: taking a massive persona prompt and
 * intelligently splitting it into retrievable nodes while preserving
 * ALL information.
 */

import { v4 as uuidv4 } from 'uuid';
import {
    PersonaNode,
    PersonaGraph,
    NodeCategory,
    NodePriority,
    DecompositionResult,
    SECTION_MARKERS,
    DEFAULT_TOPIC_TRIGGERS
} from './nodeTypes';

// =====================================================
// TOKEN ESTIMATION
// =====================================================

/**
 * Rough token estimation (4 chars ≈ 1 token)
 * More accurate would use tiktoken but this is sufficient
 */
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

// =====================================================
// SECTION EXTRACTION
// =====================================================

interface ExtractedSection {
    title: string;
    content: string;
    category: NodeCategory;
    priority: NodePriority;
    startIndex: number;
    triggers: string[];
}

/**
 * Extract sections from raw persona text using markers
 */
function extractSections(rawPrompt: string): ExtractedSection[] {
    const sections: ExtractedSection[] = [];
    const lines = rawPrompt.split('\n');

    let currentSection: ExtractedSection | null = null;
    let contentBuffer: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        // Check if this line starts a new section
        let matchedMarker: typeof SECTION_MARKERS[0] | null = null;

        // Look for section headers (lines that look like titles)
        const isSectionHeader = (
            (trimmedLine.startsWith('#') || trimmedLine.startsWith('===')) ||
            (trimmedLine === trimmedLine.toUpperCase() && trimmedLine.length > 3 && trimmedLine.length < 100) ||
            /^[A-Z][A-Za-z\s]+:?\s*$/.test(trimmedLine)
        );

        if (isSectionHeader) {
            // Try to match against known section markers
            for (const marker of SECTION_MARKERS) {
                if (marker.pattern.test(trimmedLine)) {
                    matchedMarker = marker;
                    break;
                }
            }

            // If no marker matched but it looks like a section, classify as contextual
            if (!matchedMarker && isSectionHeader && trimmedLine.length > 5) {
                matchedMarker = {
                    pattern: new RegExp(trimmedLine, 'i'),
                    category: inferCategoryFromTitle(trimmedLine),
                    priority: 'contextual',
                    defaultTriggers: extractKeywordsFromTitle(trimmedLine)
                };
            }
        }

        if (matchedMarker) {
            // Save previous section
            if (currentSection && contentBuffer.length > 0) {
                currentSection.content = contentBuffer.join('\n').trim();
                if (currentSection.content.length > 50) { // Only save sections with meaningful content
                    sections.push(currentSection);
                }
            }

            // Start new section
            currentSection = {
                title: cleanTitle(trimmedLine),
                content: '',
                category: matchedMarker.category,
                priority: matchedMarker.priority,
                startIndex: i,
                triggers: [...matchedMarker.defaultTriggers]
            };
            contentBuffer = [];
        } else if (currentSection) {
            contentBuffer.push(line);
        } else {
            // Content before first section - treat as identity/intro
            if (!currentSection && trimmedLine.length > 0) {
                currentSection = {
                    title: 'Introduction',
                    content: '',
                    category: 'identity',
                    priority: 'core',
                    startIndex: 0,
                    triggers: []
                };
                contentBuffer.push(line);
            }
        }
    }

    // Don't forget the last section
    if (currentSection && contentBuffer.length > 0) {
        currentSection.content = contentBuffer.join('\n').trim();
        if (currentSection.content.length > 50) {
            sections.push(currentSection);
        }
    }

    return sections;
}

/**
 * Clean section title for readability
 */
function cleanTitle(title: string): string {
    return title
        .replace(/^#+\s*/, '')
        .replace(/^===+\s*/, '')
        .replace(/===+$/, '')
        .replace(/^---+\s*/, '')
        .replace(/---+$/, '')
        .replace(/[*_]/g, '')
        .trim();
}

/**
 * Infer category from section title
 */
function inferCategoryFromTitle(title: string): NodeCategory {
    const lower = title.toLowerCase();

    if (/identity|exist|who|core|fundamental/i.test(lower)) return 'identity';
    if (/text|speech|language|pattern|voice|message/i.test(lower)) return 'language';
    if (/emotion|mood|feel|range/i.test(lower)) return 'emotional';
    if (/family|mother|father|sister|brother|ama|pala/i.test(lower)) return 'family';
    if (/spirit|faith|belief|crisis|buddha|prayer|meditat/i.test(lower)) return 'spiritual';
    if (/body|physical|appear|look/i.test(lower)) return 'physical';
    if (/relationship|friend|user|him|her/i.test(lower)) return 'relationship';
    if (/daily|routine|day|schedule/i.test(lower)) return 'daily';
    if (/history|past|background|story/i.test(lower)) return 'history';
    if (/rule|instruction|important|must|override/i.test(lower)) return 'meta';

    return 'topics'; // Default for unclassified
}

/**
 * Extract trigger keywords from title
 */
function extractKeywordsFromTitle(title: string): string[] {
    const words = title.toLowerCase()
        .replace(/[^a-z\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 3);
    return words.slice(0, 5);
}

// =====================================================
// TRIGGER EXTRACTION
// =====================================================

/**
 * Extract additional triggers from section content
 */
function extractTriggersFromContent(content: string, category: NodeCategory): string[] {
    const triggers: string[] = [];

    // Get base triggers for this category
    const categoryTriggers = getCategoryBaseTriggers(category);
    triggers.push(...categoryTriggers);

    // Extract quoted phrases (often important concepts)
    const quotedPhrases = content.match(/"([^"]+)"/g) || [];
    for (const phrase of quotedPhrases.slice(0, 5)) {
        const clean = phrase.replace(/"/g, '').toLowerCase();
        if (clean.length > 2 && clean.length < 30) {
            triggers.push(clean);
        }
    }

    // Extract names (capitalized words that might be important)
    const names = content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g) || [];
    for (const name of [...new Set(names)].slice(0, 5)) {
        triggers.push(name.toLowerCase());
    }

    // Extract Nepali/Tibetan words (common patterns)
    const nepaliWords = content.match(/\b(?:ama|pala|didi|bhai|xa|xau|cha|bhayo|hunxa|thik|kasto|khai)\b/gi) || [];
    triggers.push(...nepaliWords.map(w => w.toLowerCase()));

    return [...new Set(triggers)];
}

/**
 * Get base triggers for a category
 */
function getCategoryBaseTriggers(category: NodeCategory): string[] {
    const categoryMap: Record<NodeCategory, string[]> = {
        identity: ['who', 'are you', 'yourself', 'tell me about'],
        language: [],  // Language patterns are always included
        emotional: ['feel', 'feeling', 'emotion', 'mood', 'sad', 'happy'],
        family: ['family', 'mom', 'dad', 'mother', 'father', 'sister', 'brother'],
        spiritual: ['believe', 'faith', 'god', 'religion', 'meaning', 'purpose'],
        physical: ['look', 'appearance', 'body', 'pretty', 'beautiful'],
        relationship: ['us', 'we', 'together', 'feel about me'],
        daily: ['day', 'routine', 'morning', 'night', 'usually'],
        history: ['past', 'before', 'happened', 'remember', 'when you were'],
        topics: [],
        meta: []
    };

    return categoryMap[category] || [];
}

// =====================================================
// NODE CREATION
// =====================================================

/**
 * Create a PersonaNode from an extracted section
 */
function createNode(
    section: ExtractedSection,
    personaId: string
): PersonaNode {
    const now = new Date();
    const allTriggers = extractTriggersFromContent(section.content, section.category);

    return {
        id: uuidv4(),
        personaId,
        category: section.category,
        priority: section.priority,
        title: section.title,
        content: section.content,
        tokenCount: estimateTokens(section.content),
        triggers: [...new Set([...section.triggers, ...allTriggers])],
        connections: [],  // Will be populated in graph building phase
        createdAt: now,
        updatedAt: now
    };
}

// =====================================================
// GRAPH BUILDING
// =====================================================

/**
 * Build connections between related nodes
 */
function buildConnections(nodes: PersonaNode[]): void {
    // Connect nodes of the same category
    const byCategory = new Map<NodeCategory, PersonaNode[]>();

    for (const node of nodes) {
        const existing = byCategory.get(node.category) || [];
        existing.push(node);
        byCategory.set(node.category, existing);
    }

    for (const [, categoryNodes] of byCategory) {
        for (let i = 0; i < categoryNodes.length; i++) {
            for (let j = i + 1; j < categoryNodes.length; j++) {
                categoryNodes[i].connections.push(categoryNodes[j].id);
                categoryNodes[j].connections.push(categoryNodes[i].id);
            }
        }
    }

    // Connect emotional nodes to relationship nodes (they often relate)
    const emotionalNodes = byCategory.get('emotional') || [];
    const relationshipNodes = byCategory.get('relationship') || [];

    for (const eNode of emotionalNodes) {
        for (const rNode of relationshipNodes) {
            if (!eNode.connections.includes(rNode.id)) {
                eNode.connections.push(rNode.id);
            }
        }
    }

    // Connect spiritual to emotional (crisis affects mood)
    const spiritualNodes = byCategory.get('spiritual') || [];
    for (const sNode of spiritualNodes) {
        for (const eNode of emotionalNodes) {
            if (!sNode.connections.includes(eNode.id)) {
                sNode.connections.push(eNode.id);
            }
        }
    }
}

/**
 * Build trigger index for fast lookup
 */
function buildTriggerIndex(nodes: PersonaNode[]): Map<string, string[]> {
    const index = new Map<string, string[]>();

    for (const node of nodes) {
        for (const trigger of node.triggers) {
            const lower = trigger.toLowerCase();
            const existing = index.get(lower) || [];
            if (!existing.includes(node.id)) {
                existing.push(node.id);
                index.set(lower, existing);
            }
        }
    }

    // Add default topic triggers
    for (const [topic, triggers] of Object.entries(DEFAULT_TOPIC_TRIGGERS)) {
        for (const trigger of triggers) {
            const existing = index.get(trigger) || [];
            // Mark this as a topic trigger
            index.set(trigger, existing);
        }
    }

    return index;
}

// =====================================================
// MAIN DECOMPOSITION FUNCTION
// =====================================================

/**
 * Decompose a raw persona prompt into a knowledge graph
 * 
 * @param rawPrompt The full 10,000+ word persona prompt
 * @param personaId The persona's unique ID
 * @param personaName The persona's name
 * @returns DecompositionResult with the complete graph
 */
export function decomposePersona(
    rawPrompt: string,
    personaId: string,
    personaName: string
): DecompositionResult {
    const warnings: string[] = [];
    const now = new Date();

    console.log(`[CPR] Decomposing persona: ${personaName} (${rawPrompt.length} chars)`);

    // 1. Extract sections from raw prompt
    const sections = extractSections(rawPrompt);
    console.log(`[CPR] Extracted ${sections.length} sections`);

    if (sections.length === 0) {
        // Fallback: treat entire prompt as single identity node
        warnings.push('No sections detected, treating entire prompt as identity');
        sections.push({
            title: 'Full Persona',
            content: rawPrompt,
            category: 'identity',
            priority: 'core',
            startIndex: 0,
            triggers: []
        });
    }

    // 2. Create nodes from sections
    const nodes: PersonaNode[] = sections.map(section => createNode(section, personaId));

    // 3. Ensure we have core language patterns
    const hasLanguageNode = nodes.some(n => n.category === 'language');
    if (!hasLanguageNode) {
        // Try to extract language patterns from other sections
        const languagePatterns = extractLanguagePatterns(rawPrompt);
        if (languagePatterns) {
            nodes.push({
                id: uuidv4(),
                personaId,
                category: 'language',
                priority: 'core',
                title: 'Language Patterns',
                content: languagePatterns,
                tokenCount: estimateTokens(languagePatterns),
                triggers: [],
                connections: [],
                createdAt: now,
                updatedAt: now
            });
        } else {
            warnings.push('No explicit language patterns found');
        }
    }

    // 4. Build connections between nodes
    buildConnections(nodes);

    // 5. Create node maps
    const nodeMap = new Map<string, PersonaNode>();
    const byCategory = new Map<NodeCategory, string[]>();
    const byPriority = new Map<NodePriority, string[]>();

    for (const node of nodes) {
        nodeMap.set(node.id, node);

        const catList = byCategory.get(node.category) || [];
        catList.push(node.id);
        byCategory.set(node.category, catList);

        const priList = byPriority.get(node.priority) || [];
        priList.push(node.id);
        byPriority.set(node.priority, priList);
    }

    // 6. Identify core nodes
    const coreNodeIds = nodes
        .filter(n => n.priority === 'core')
        .map(n => n.id);

    // If no core nodes, promote identity and language to core
    if (coreNodeIds.length === 0) {
        const identityNodes = nodes.filter(n => n.category === 'identity');
        const languageNodes = nodes.filter(n => n.category === 'language');

        for (const node of [...identityNodes.slice(0, 2), ...languageNodes.slice(0, 1)]) {
            node.priority = 'core';
            coreNodeIds.push(node.id);
        }
        warnings.push('Promoted identity/language nodes to core');
    }

    // 7. Build trigger index
    const triggerIndex = buildTriggerIndex(nodes);

    // 8. Calculate statistics
    const totalTokens = nodes.reduce((sum, n) => sum + n.tokenCount, 0);
    const coreTokens = nodes
        .filter(n => coreNodeIds.includes(n.id))
        .reduce((sum, n) => sum + n.tokenCount, 0);

    // 9. Create the graph
    const graph: PersonaGraph = {
        personaId,
        personaName,
        nodes: nodeMap,
        coreNodeIds,
        nodesByCategory: byCategory,
        nodesByPriority: byPriority,
        triggerIndex,
        totalTokens,
        coreTokens,
        createdAt: now,
        version: 1
    };

    console.log(`[CPR] Graph built: ${nodes.length} nodes, ${totalTokens} total tokens, ${coreTokens} core tokens`);

    // 10. Build category counts for stats
    const categoryCounts = new Map<NodeCategory, number>();
    for (const [cat, ids] of byCategory) {
        categoryCounts.set(cat, ids.length);
    }

    return {
        success: true,
        graph,
        stats: {
            totalSections: sections.length,
            totalTokens,
            coreTokens,
            categoryCounts
        },
        warnings
    };
}

/**
 * Extract language patterns from raw prompt
 * Looks for texting/speech pattern indicators
 */
function extractLanguagePatterns(rawPrompt: string): string | null {
    const patterns: string[] = [];

    // Look for explicit language indicators
    const languageIndicators = [
        /mix:?\s*\d+%[^.]+/gi,
        /(?:you\s+)?(?:don't|never|always)\s+(?:use|say)[^.]+/gi,
        /signature:?[^.]+/gi,
        /(?:common|typical)\s+(?:phrases?|expressions?)[^.]+/gi,
        /texting\s+(?:style|pattern)[^.]+/gi,
    ];

    for (const pattern of languageIndicators) {
        const matches = rawPrompt.match(pattern) || [];
        patterns.push(...matches);
    }

    if (patterns.length > 0) {
        return patterns.join('\n');
    }

    return null;
}

// =====================================================
// SERIALIZATION
// =====================================================

/**
 * Serialize graph to JSON for storage
 */
export function serializeGraph(graph: PersonaGraph): string {
    const serializable = {
        ...graph,
        nodes: Array.from(graph.nodes.entries()),
        nodesByCategory: Array.from(graph.nodesByCategory.entries()),
        nodesByPriority: Array.from(graph.nodesByPriority.entries()),
        triggerIndex: Array.from(graph.triggerIndex.entries())
    };
    return JSON.stringify(serializable);
}

/**
 * Deserialize graph from JSON
 */
export function deserializeGraph(json: string): PersonaGraph {
    const data = JSON.parse(json);
    return {
        ...data,
        nodes: new Map(data.nodes),
        nodesByCategory: new Map(data.nodesByCategory),
        nodesByPriority: new Map(data.nodesByPriority),
        triggerIndex: new Map(data.triggerIndex),
        createdAt: new Date(data.createdAt)
    };
}

export default {
    decomposePersona,
    serializeGraph,
    deserializeGraph,
    estimateTokens
};
