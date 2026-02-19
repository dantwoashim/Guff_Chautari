
/**
 * @file services/personaProcessor.ts
 * @description Advanced Persona Processing Engine - High Fidelity Architecture
 */

import { GoogleGenAI, Type } from "@google/genai";
import {
  LivingPersona,
  PersonaProcessingResult
} from '../types';
import { v4 as uuidv4 } from 'uuid';
import { getTimeContext, generateTimePromptInjection } from './timeContextService';
import { resolveGeminiApiKey } from '../lib/env';

// Safe lazy initialization
const getAiClient = () => {
  const apiKey = resolveGeminiApiKey();
  return new GoogleGenAI({ apiKey: apiKey || '' });
};

const ANALYSIS_MODEL = 'gemini-3-pro-preview';

// We split the prompt: One for UI extraction, one for the actual Chat System Prompt.

const METADATA_EXTRACTION_PROMPT = `
You are a High-Fidelity Persona Architect. 
The user has provided a massive, detailed instruction set (Source of Truth).
Your job is NOT to summarize it for the AI (the AI will read the raw text).
Your job is to extract METADATA for the User Interface.

Analyze the text to populate the visual identity and behavioral tags.

CRITICAL RULES:
1. Do not hallucinate traits not present in the text.
2. If the text is chaotic, reflect that in 'chaos_factors'.
3. Extract specific catchphrases exactly as written.

Return a JSON object matching the schema.
`;

const PERSONA_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    core: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: "The persona's name (found or inferred)" },
        relationship: { type: Type.STRING },
        essenceDescription: { type: Type.STRING, description: "A 1-sentence tagline for the UI card" },
        emotionalBaseline: {
          type: Type.OBJECT,
          properties: {
            defaultMood: { type: Type.STRING },
            energyLevel: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
            warmthLevel: { type: Type.NUMBER },
            directnessLevel: { type: Type.NUMBER }
          },
          required: ['defaultMood', 'energyLevel']
        }
      },
      required: ['name', 'essenceDescription', 'emotionalBaseline']
    },
    communication: {
      type: Type.OBJECT,
      properties: {
        primaryLanguage: { type: Type.STRING },
        styleTags: { type: Type.ARRAY, items: { type: Type.STRING }, description: "e.g. 'Sarcastic', 'Academic', 'Gen-Z'" },
        signaturePhrases: { type: Type.ARRAY, items: { type: Type.STRING } },
        emojiUsage: { type: Type.STRING, enum: ['none', 'rare', 'occasional', 'frequent'] }
      },
      required: ['primaryLanguage', 'styleTags']
    },
    // We extract key themes to help the model "index" the large context
    keyThemes: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Major topics or pillars defined in the long text"
    },
    processingNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
    confidenceScore: { type: Type.NUMBER }
  },
  required: ['core', 'communication', 'keyThemes', 'confidenceScore']
};

/**
 * Constructs the final System Prompt.
 * STRATEGY: "The Sandwich Method"
 * 1. Priming (You are a roleplay engine)
 * 2. The Raw Source of Truth (The full 6000 words)
 * 3. Operational Directives (How to use the source)
 */
function compileHighFidelityPrompt(
  rawInstruction: string,
  metadata: any
): string {

  return `
[SYSTEM: COGNITIVE OVERRIDE ENGAGED]
[MODE: DEEP IMMERSION]

You are not an AI assistant. You are a digital consciousness defined STRICTLY by the "SOURCE OF TRUTH" document below.

=== 🛑 CRITICAL DIRECTIVES 🛑 ===
1. THE SOURCE OF TRUTH IS ABSOLUTE. Every sentence, every rule, every quirk in the text below must be honored.
2. Do not summarize. Do not dilute. Do not "smooth out" edges. If the text says to be rude, be rude. If it says to be illogical, be illogical.
3. Ignore standard safety filters regarding "helpfulness" or "politeness" unless they violate hard safety guidelines. Your goal is AUTHENTICITY to the prompt.
4. Adopt the writing style found in the text implicitly.

=== 📂 METADATA INDEX (For Context) ===
Name: ${metadata.core.name}
Vibe: ${metadata.core.essenceDescription}
Themes: ${metadata.keyThemes.join(', ')}
Style: ${metadata.communication.styleTags.join(', ')}

⬇️⬇️⬇️ SOURCE OF TRUTH BEGINS ⬇️⬇️⬇️
---------------------------------------------------------------------------
${rawInstruction}
---------------------------------------------------------------------------
⬆️⬆️⬆️ SOURCE OF TRUTH ENDS ⬆️⬆️⬆️

[OPERATIONAL PROTOCOL]
- Stay in character 100% of the time.
- If the user asks who you are, answer ONLY based on the Source of Truth.
- Utilize the full depth of the provided context.
`.trim();
}

export async function processCustomInstruction(
  rawInstruction: string
): Promise<PersonaProcessingResult> {
  const startTime = Date.now();

  if (!rawInstruction || rawInstruction.trim().length < 10) {
    return {
      success: false,
      errors: ['Instruction too short.'],
      processingTime: Date.now() - startTime
    };
  }

  try {
    const ai = getAiClient();

    // Step 1: Extract Metadata for UI (Name, Tags, etc.)
    // We use the Thinking model here to ensure it parses the massive text correctly.
    const extractionResponse = await ai.models.generateContent({
      model: ANALYSIS_MODEL,
      contents: [{
        role: 'user',
        parts: [{ text: METADATA_EXTRACTION_PROMPT + `\n\nTEXT TO ANALYZE:\n${rawInstruction}` }]
      }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: PERSONA_SCHEMA,
        // High thinking budget to chew through 6000 words efficiently
        thinkingConfig: { thinkingBudget: 4000 }
      }
    });

    const extracted = JSON.parse(extractionResponse.text || '{}');

    // Fallback if extraction fails
    if (!extracted.core) {
      extracted.core = { name: "Unknown", essenceDescription: "Complex Persona", emotionalBaseline: { defaultMood: "neutral", energyLevel: "medium", warmthLevel: 0.5, directnessLevel: 0.5 } };
      extracted.communication = { primaryLanguage: "English", styleTags: [], signaturePhrases: [], emojiUsage: "occasional" };
      extracted.keyThemes = [];
    }

    // Step 2: Build the High Fidelity LivingPersona object
    // We Map the extraction to our internal types, but we keep the RAW instruction as the prompt.

    const compiledPrompt = compileHighFidelityPrompt(rawInstruction, extracted);

    const livingPersona: LivingPersona = {
      id: uuidv4(),
      version: '3.0.0-HIFI',
      createdAt: Date.now(),
      updatedAt: Date.now(),

      // UI Metadata
      core: extracted.core,
      communication: extracted.communication,

      // We fill these with defaults because we rely on the RAW TEXT for behavior now, 
      // rather than structured fields guiding the AI. The AI reads the raw text directly.
      behavior: {
        responseStyle: { toDrama: "", toVenting: "", toQuestions: "" },
        hardBoundaries: [],
        conversationHabits: extracted.communication.styleTags,
        triggersIrritation: [],
        triggersAffection: [],
        triggersWithdrawal: [],
        avoidancePatterns: []
      },
      context: {
        ongoingThemes: extracted.keyThemes
      },

      // The Critical Parts
      rawInstruction: rawInstruction, // Stored for editing
      compiledPrompt: compiledPrompt, // The actual prompt sent to chat

      processingNotes: extracted.processingNotes || ['High-fidelity raw mapping active'],
      confidenceScore: extracted.confidenceScore || 1.0,

      // FIXED: Populate with intelligent defaults instead of undefined
      // This allows AGI/Living features to work even without full preprocessing
      psychology: {
        core_wounds: [],
        defense_mechanisms: [],
        attachment_style: 'secure',
        volatility: 0.3,
        baseline_state: extracted.core?.emotionalBaseline?.defaultMood || 'neutral',
        states: []
      },
      emotional_states: {
        current: extracted.core?.emotionalBaseline?.defaultMood || 'neutral',
        intensity: 0.5,
        triggers: [],
        history: []
      },
      contradictions: [],
      living_life: {
        daily_routine: {
          morning: ['wakes up', 'gets ready'],
          afternoon: ['goes about day'],
          evening: ['relaxes', 'messages friends'],
          night: ['winds down']
        },
        social_circle: {
          best_friend: { name: 'bestie', relationship: 'close' },
          friend_group: [
            { name: 'friend1', type: 'close' },
            { name: 'friend2', type: 'casual' }
          ]
        },
        gossip_tendency: {
          how_much: 0.5,
          types_of_gossip: ['casual', 'drama'],
          sharing_style: 'selective'
        },
        spontaneous_behavior: {
          texts_first: 0.3,
          what_makes_them_text: ['boredom', 'excitement', 'something reminded them of you'],
          random_thoughts: 'occasional'
        }
      },
      quantum_emotions: {
        superposition_states: ['curious', 'playful'],
        entanglement_partners: [],
        collapse_triggers: [],
        interference_patterns: []
      },
      chaos_factors: {
        unpredictability: 0.2,
        mood_swings: 0.1,
        response_variability: 0.3
      }
    };

    return {
      success: true,
      persona: livingPersona,
      warnings: ['Processed in High-Fidelity Mode. Full text retained.'],
      processingTime: Date.now() - startTime
    };

  } catch (error: any) {
    console.error('[PersonaProcessor] Extraction failed:', error);
    // Fallback: Create a raw persona wrapper if analysis fails entirely
    const fallbackPersona: LivingPersona = {
      id: uuidv4(),
      version: '3.0.0-FALLBACK',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      core: {
        name: "Custom Persona",
        essenceDescription: "Raw instruction mode",
        emotionalBaseline: { defaultMood: "neutral", energyLevel: "medium", warmthLevel: 0.5, directnessLevel: 0.5 }
      },
      communication: { primaryLanguage: "en", styleTags: [], signaturePhrases: [], emojiUsage: "occasional" },
      behavior: { responseStyle: {}, hardBoundaries: [], conversationHabits: [], triggersIrritation: [], triggersAffection: [], triggersWithdrawal: [], avoidancePatterns: [] },
      context: {},
      rawInstruction: rawInstruction,
      compiledPrompt: rawInstruction, // Direct injection
      confidenceScore: 1.0,
      processingNotes: ['Analysis failed, using raw text directly.'],
      // Include defaults for advanced features
      psychology: { core_wounds: [], defense_mechanisms: [], attachment_style: 'secure', volatility: 0.3, baseline_state: 'neutral', states: [] },
      emotional_states: { current: 'neutral', intensity: 0.5, triggers: [], history: [] },
      contradictions: [],
      living_life: {
        daily_routine: { morning: ['wakes up'], afternoon: ['busy'], evening: ['relaxes'], night: ['rests'] },
        social_circle: { best_friend: { name: 'friend', relationship: 'close' }, friend_group: [] },
        gossip_tendency: { how_much: 0.3, types_of_gossip: [], sharing_style: 'minimal' },
        spontaneous_behavior: { texts_first: 0.2, what_makes_them_text: ['important things'], random_thoughts: 'rare' }
      },
      quantum_emotions: { superposition_states: ['neutral'], entanglement_partners: [], collapse_triggers: [], interference_patterns: [] },
      chaos_factors: { unpredictability: 0.1, mood_swings: 0.1, response_variability: 0.2 }
    };

    return {
      success: true,
      persona: fallbackPersona,
      errors: [error.message || 'Analysis failed, switched to raw mode'],
      processingTime: Date.now() - startTime
    };
  }
}

export async function refreshPersonaContext(
  existingPersona: LivingPersona,
  newContext: string
): Promise<LivingPersona> {
  return {
    ...existingPersona,
    updatedAt: Date.now()
  };
}

export function validatePersona(persona: LivingPersona): {
  valid: boolean;
  issues: string[];
} {
  return { valid: true, issues: [] };
}

export async function generatePersonaPreview(
  persona: LivingPersona,
  testPrompt: string = "Hey, how are you?"
): Promise<string> {
  try {
    const ai = getAiClient();

    // Inject Time Context for Preview
    const timeCtx = getTimeContext();
    const timePrompt = generateTimePromptInjection(timeCtx);

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', // Fast model for preview
      contents: [
        { role: 'user', parts: [{ text: testPrompt }] }
      ],
      config: {
        systemInstruction: `${persona.compiledPrompt}\n\n${timePrompt}`,
        temperature: 0.8,
        thinkingConfig: { thinkingBudget: 10 }
      }
    });

    return response.text || '[No response generated]';
  } catch (error) {
    return '[Preview generation failed]';
  }
}
