/**
 * @file services/personaPreprocessor.ts
 * @description Runs full AI analysis pipeline on personas and stores results
 */
import { supabase } from '../lib/supabase';
import { processCustomInstruction } from './personaProcessor';
import { initializeConsciousness, AGIConsciousnessState } from './agiConsciousness';
import { initializeQuantumState, QuantumEmotionalState } from './quantumEmotions';
import { initializeMetaSentience, MetaSentienceState } from './metaSentience';
import { initializeTemporalState, TemporalExistenceState } from './temporalExistence';
import { generateDay, DayTimeline, PersonaProfile } from './lifeEngine';
import { createDefaultSocialCircle, Person } from './socialCircle';
import { generateGossip, Gossip } from './gossipGenerator';
import { LivingPersona, Persona } from '../types';

export interface ProcessingProgress {
  step: string;
  current: number;
  total: number;
  status: 'pending' | 'processing' | 'complete' | 'error';
  error?: string;
}

export interface PreprocessedPersona {
  living_persona: LivingPersona | null;
  agi_state: AGIConsciousnessState | null;
  quantum_state: QuantumEmotionalState | null;
  meta_state: MetaSentienceState | null;
  temporal_state: TemporalExistenceState | null;
  life_context: DayTimeline | null;
  social_graph_data: Person[] | null;
  gossip_seeds: Gossip[] | null;
  voice_dna: any | null;
  processing_version: string;
}

const PROCESSING_STEPS = [
  'Living Persona Analysis',
  'AGI Consciousness',
  'Quantum Emotions',
  'Meta-Sentience',
  'Temporal Existence',
  'Life Engine',
  'Social Circle',
  'Gossip Seeds',
  'Voice DNA',
  'Saving to Database'
];

/**
 * Process a persona through the full AI analysis pipeline
 */
export async function preprocessPersona(
  personaId: string,
  onProgress?: (progress: ProcessingProgress) => void
): Promise<{ success: boolean; error?: string }> {

  const updateProgress = (stepIndex: number, status: ProcessingProgress['status'], error?: string) => {
    if (onProgress) {
      onProgress({
        step: PROCESSING_STEPS[stepIndex],
        current: stepIndex + 1,
        total: PROCESSING_STEPS.length,
        status,
        error
      });
    }
  };

  try {
    // Fetch the persona
    const { data: persona, error: fetchError } = await supabase
      .from('personas')
      .select('*')
      .eq('id', personaId)
      .single();

    if (fetchError || !persona) {
      throw new Error('Persona not found');
    }

    const results: PreprocessedPersona = {
      living_persona: null,
      agi_state: null,
      quantum_state: null,
      meta_state: null,
      temporal_state: null,
      life_context: null,
      social_graph_data: null,
      gossip_seeds: null,
      voice_dna: null,
      processing_version: '2.0'
    };

    // Step 1: Living Persona Analysis
    updateProgress(0, 'processing');
    try {
      if (persona.system_instruction) {
        const processed = await processCustomInstruction(persona.system_instruction);
        results.living_persona = processed.persona || null;
      }
      updateProgress(0, 'complete');
    } catch (e: any) {
      console.error('Living Persona failed:', e);
      updateProgress(0, 'error', e.message);
    }

    // Step 2: AGI Consciousness
    updateProgress(1, 'processing');
    try {
      results.agi_state = initializeConsciousness(personaId);
      updateProgress(1, 'complete');
    } catch (e: any) {
      console.error('AGI failed:', e);
      updateProgress(1, 'error', e.message);
    }

    // Step 3: Quantum Emotions
    updateProgress(2, 'processing');
    try {
      results.quantum_state = initializeQuantumState();
      updateProgress(2, 'complete');
    } catch (e: any) {
      console.error('Quantum failed:', e);
      updateProgress(2, 'error', e.message);
    }

    // Step 4: Meta-Sentience
    updateProgress(3, 'processing');
    try {
      results.meta_state = initializeMetaSentience();
      updateProgress(3, 'complete');
    } catch (e: any) {
      console.error('Meta failed:', e);
      updateProgress(3, 'error', e.message);
    }

    // Step 5: Temporal Existence
    updateProgress(4, 'processing');
    try {
      results.temporal_state = initializeTemporalState();
      updateProgress(4, 'complete');
    } catch (e: any) {
      console.error('Temporal failed:', e);
      updateProgress(4, 'error', e.message);
    }

    // Step 6: Life Engine
    updateProgress(5, 'processing');
    try {
      const profile: PersonaProfile = {
        friends: ['friend1', 'friend2'],
        familyMembers: ['mom', 'dad'],
        interests: ['music', 'movies'],
        subjects: ['english', 'math'],
        places: ['cafe', 'library']
      };
      results.life_context = generateDay(personaId, new Date(), profile);
      updateProgress(5, 'complete');
    } catch (e: any) {
      console.error('Life Engine failed:', e);
      updateProgress(5, 'error', e.message);
    }

    // Step 7: Social Circle
    updateProgress(6, 'processing');
    try {
      results.social_graph_data = createDefaultSocialCircle(persona.name || 'Persona');
      updateProgress(6, 'complete');
    } catch (e: any) {
      console.error('Social failed:', e);
      updateProgress(6, 'error', e.message);
    }

    // Step 8: Gossip Seeds
    updateProgress(7, 'processing');
    try {
      if (results.social_graph_data) {
        const gossipSeeds: Gossip[] = [];
        gossipSeeds.push(generateGossip(results.social_graph_data, 'drama'));
        gossipSeeds.push(generateGossip(results.social_graph_data, 'tea'));
        gossipSeeds.push(generateGossip(results.social_graph_data, 'cute'));
        results.gossip_seeds = gossipSeeds;
      }
      updateProgress(7, 'complete');
    } catch (e: any) {
      console.error('Gossip failed:', e);
      updateProgress(7, 'error', e.message);
    }

    // Step 9: Voice DNA (placeholder for now)
    updateProgress(8, 'processing');
    try {
      results.voice_dna = {
        pitch: 'medium',
        speed: 'moderate',
        warmth: 0.7,
        formality: 0.5,
        extracted_at: new Date().toISOString()
      };
      updateProgress(8, 'complete');
    } catch (e: any) {
      console.error('Voice DNA failed:', e);
      updateProgress(8, 'error', e.message);
    }

    // Step 10: Save to Database
    updateProgress(9, 'processing');
    const { error: updateError } = await supabase
      .from('personas')
      .update({
        living_persona: results.living_persona,
        agi_state: results.agi_state,
        quantum_state: results.quantum_state,
        meta_state: results.meta_state,
        temporal_state: results.temporal_state,
        life_context: results.life_context,
        social_graph_data: results.social_graph_data,
        gossip_seeds: results.gossip_seeds,
        voice_dna: results.voice_dna,
        processing_version: results.processing_version,
        is_processed: true,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', personaId);

    if (updateError) {
      throw updateError;
    }

    updateProgress(9, 'complete');
    return { success: true };

  } catch (error: any) {
    console.error('Persona preprocessing failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check if a persona needs reprocessing
 */
export function needsReprocessing(persona: Persona & { processing_version?: string }): boolean {
  const currentVersion = '2.0';
  return !persona.processing_version || persona.processing_version !== currentVersion;
}

/**
 * Get all global personas with their processing status
 */
export async function getGlobalPersonasWithStatus(): Promise<any[]> {
  const { data, error } = await supabase
    .from('personas')
    .select('*')
    .eq('is_global', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch personas:', error);
    return [];
  }

  return data || [];
}
