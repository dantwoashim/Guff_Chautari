/**
 * @file services/personaGraph/nodeTypes.ts
 * @description Type definitions for the Contextual Persona Retrieval (CPR) system
 * 
 * This is the foundation of the CPR architecture that enables:
 * - 100% persona detail retention
 * - 90% token reduction
 * - Context-aware retrieval
 */

// =====================================================
// CORE TYPES
// =====================================================

/**
 * Categories of persona information
 * Each category groups related nodes for efficient retrieval
 */
export type NodeCategory =
    | 'identity'      // Core identity, who they are
    | 'language'      // Texting patterns, speech style
    | 'emotional'     // Mood patterns, emotional responses
    | 'family'        // Family members, dynamics
    | 'history'       // Backstory, past events
    | 'spiritual'     // Beliefs, practices, crisis
    | 'physical'      // Appearance, body, physical state
    | 'relationship'  // User-persona dynamics
    | 'daily'         // Routines, schedule
    | 'topics'        // Specific topic knowledge
    | 'meta';         // Response rules, system instructions

/**
 * Priority levels determine inclusion order
 * - core: Always included (identity, language patterns)
 * - important: Included when relevant topics detected
 * - contextual: Included based on conversation context
 * - deep: Only included in deep/intimate conversations
 */
export type NodePriority = 'core' | 'important' | 'contextual' | 'deep';

/**
 * A single node in the persona knowledge graph
 * Contains a chunk of persona information with metadata for retrieval
 */
export interface PersonaNode {
    id: string;
    personaId: string;

    // Classification
    category: NodeCategory;
    priority: NodePriority;

    // Content
    title: string;           // Human-readable title (e.g., "Grandmother Relationship")
    content: string;         // The actual persona text
    tokenCount: number;      // Pre-calculated for budget management

    // Retrieval triggers
    triggers: string[];      // Keywords/phrases that activate this node
    contextTriggers?: {
        emotionalIntensity?: number;  // Min emotional intensity to trigger
        trustLevel?: number;          // Min trust level to trigger
        timeOfDay?: ('morning' | 'day' | 'evening' | 'late_night')[];
    };

    // Graph structure
    connections: string[];   // Related node IDs

    // Optional embeddings for semantic search
    embedding?: number[];

    // Metadata
    createdAt: Date;
    updatedAt: Date;
}

/**
 * The complete persona knowledge graph
 * Contains all nodes and their relationships
 */
export interface PersonaGraph {
    personaId: string;
    personaName: string;

    // All nodes indexed by ID
    nodes: Map<string, PersonaNode>;

    // Quick access to core nodes (always included)
    coreNodeIds: string[];

    // Nodes grouped by category for fast lookup
    nodesByCategory: Map<NodeCategory, string[]>;

    // Nodes grouped by priority
    nodesByPriority: Map<NodePriority, string[]>;

    // Trigger index for fast keyword matching
    triggerIndex: Map<string, string[]>;  // trigger -> nodeIds

    // Graph statistics
    totalTokens: number;
    coreTokens: number;

    // Metadata
    createdAt: Date;
    version: number;
}

// =====================================================
// CONTEXT TYPES
// =====================================================

/**
 * Detected context from a user message
 */
export interface MessageContext {
    // Detected topics
    topics: string[];
    topicScores: Map<string, number>;  // topic -> confidence

    // Emotional analysis
    emotionalIntensity: number;  // 0-1
    sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';

    // Question/conversation type
    messageType: 'casual' | 'question' | 'deep' | 'vulnerable' | 'playful' | 'confrontational';

    // Relationship signals
    relationshipSignals: string[];  // e.g., ['seeking_connection', 'vulnerability', 'flirting']

    // Time context
    timeOfDay: 'morning' | 'day' | 'evening' | 'late_night';

    // Special flags
    isFirstMessage: boolean;
    requiresDeepContext: boolean;
}

/**
 * Conversation state tracks the relationship progression
 */
export interface ConversationState {
    chatId: string;
    personaId: string;

    // Quantitative metrics
    messageCount: number;
    emotionalDepthReached: number;  // 0-1, highest emotional depth achieved
    trustLevel: number;             // 0-1, builds over time

    // Qualitative tracking
    topicsCovered: Set<string>;
    vulnerabilityShared: boolean;   // Has persona shared vulnerable info?
    relationshipAcknowledged: boolean;  // Has relationship been discussed?

    // Unlocked persona layers
    unlockedLayers: Set<'surface' | 'emotional' | 'spiritual' | 'vulnerable' | 'intimate'>;

    // Memory of significant moments
    significantMoments: {
        type: 'vulnerability' | 'conflict' | 'connection' | 'revelation';
        messageIndex: number;
        summary: string;
    }[];

    // Timestamps
    lastInteraction: Date;
    createdAt: Date;
}

// =====================================================
// COMPILATION TYPES
// =====================================================

/**
 * Result of the dynamic prompt compilation
 */
export interface CompiledPrompt {
    // The assembled prompt
    prompt: string;

    // Breakdown
    sections: {
        name: string;
        content: string;
        tokens: number;
        nodeIds: string[];
    }[];

    // Statistics
    totalTokens: number;
    nodesIncluded: number;
    nodesAvailable: number;

    // Debug info
    retrievalReason: Map<string, string>;  // nodeId -> why it was included
}

/**
 * Options for prompt compilation
 */
export interface CompilationOptions {
    tokenBudget: number;           // Max tokens (default: 2000)
    includeStateContext: boolean;  // Include conversation state info
    forceIncludeNodes?: string[];  // Node IDs to always include
    excludeCategories?: NodeCategory[];  // Categories to skip
}

// =====================================================
// DECOMPOSITION TYPES
// =====================================================

/**
 * Section markers used to identify chunks in raw persona text
 */
export interface SectionMarker {
    pattern: RegExp;
    category: NodeCategory;
    priority: NodePriority;
    defaultTriggers: string[];
}

/**
 * Result of persona decomposition
 */
export interface DecompositionResult {
    success: boolean;
    graph: PersonaGraph;
    stats: {
        totalSections: number;
        totalTokens: number;
        coreTokens: number;
        categoryCounts: Map<NodeCategory, number>;
    };
    warnings: string[];
}

// =====================================================
// DEFAULT TRIGGERS
// =====================================================

/**
 * Default trigger keywords for common topics
 * These are merged with persona-specific triggers
 */
export const DEFAULT_TOPIC_TRIGGERS: Record<string, string[]> = {
    casual_greeting: ['hey', 'hi', 'hello', 'sup', 'kasto', 'k cha', 'what\'s up'],
    family: ['mom', 'dad', 'mother', 'father', 'sister', 'brother', 'family', 'ama', 'pala', 'ama-la'],
    spiritual: ['believe', 'faith', 'god', 'religion', 'prayer', 'meditation', 'meaning', 'purpose', 'buddhism', 'dharma'],
    emotional: ['feel', 'feeling', 'sad', 'happy', 'scared', 'worried', 'anxious', 'lonely'],
    relationship: ['us', 'we', 'what are we', 'how do you feel about', 'like me', 'miss you', 'think about you'],
    physical: ['look like', 'appearance', 'beautiful', 'pretty', 'photo', 'selfie', 'body'],
    past: ['happened', 'remember', 'before', 'when you were', 'childhood', 'grew up'],
    future: ['will', 'going to', 'plan', 'want to', 'dream', 'hope'],
    vulnerable: ['tell you something', 'never told', 'secret', 'scared to say', 'trust you'],
    conflict: ['why', 'don\'t understand', 'wrong', 'hurt', 'mad', 'angry', 'upset'],
};

/**
 * Section markers for parsing raw persona prompts
 */
export const SECTION_MARKERS: SectionMarker[] = [
    // Identity sections
    { pattern: /(?:FUNDAMENTAL|CORE)\s*(?:EXISTENCE|IDENTITY)/i, category: 'identity', priority: 'core', defaultTriggers: [] },
    { pattern: /THE\s*BODY|PHYSICAL\s*(?:FORM|STATE)/i, category: 'physical', priority: 'contextual', defaultTriggers: ['body', 'look', 'appearance'] },

    // Family sections
    { pattern: /FAMILY|(?:AMA|PALA|MOTHER|FATHER|SISTER)/i, category: 'family', priority: 'important', defaultTriggers: ['family', 'home'] },

    // Spiritual sections
    { pattern: /SPIRITUAL|FAITH|CRISIS|BUDDHIS/i, category: 'spiritual', priority: 'important', defaultTriggers: ['believe', 'faith', 'prayer'] },

    // Language sections
    { pattern: /TEXTING|SPEECH|LANGUAGE|MESSAGING/i, category: 'language', priority: 'core', defaultTriggers: [] },

    // Emotional sections
    { pattern: /EMOTIONAL|MOOD|FEELING/i, category: 'emotional', priority: 'important', defaultTriggers: ['feel', 'emotion'] },

    // Relationship sections
    { pattern: /FRIENDSHIP|RELATIONSHIP|(?:THE\s*)?USER|(?:WHAT\s*)?(?:YOU|HE|HIM)/i, category: 'relationship', priority: 'contextual', defaultTriggers: ['us', 'we'] },

    // Daily sections
    { pattern: /DAILY|ROUTINE|SCHEDULE|TYPICAL/i, category: 'daily', priority: 'deep', defaultTriggers: ['day', 'morning', 'routine'] },

    // Meta sections
    { pattern: /RULES|INSTRUCTION|IMPORTANT|OVERRIDE|PRIORITY/i, category: 'meta', priority: 'core', defaultTriggers: [] },
];

export default {
    DEFAULT_TOPIC_TRIGGERS,
    SECTION_MARKERS
};
