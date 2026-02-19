import { Persona } from '../../../types';
import { defaultSupabaseClient, SupabaseLike } from './base';

export interface PersonaProcessingRow {
  id: string;
  name: string;
  system_instruction: string | null;
  living_persona: unknown;
  is_processed: boolean | null;
}

export interface PersonaProcessingCandidateRow {
  id: string;
  name: string;
  living_persona: unknown;
  is_processed: boolean | null;
}

export interface PersonaPreprocessedAgiRow {
  agi_state: unknown;
  quantum_state: unknown;
  meta_state: unknown;
  temporal_state: unknown;
  life_context: unknown;
  social_graph_data: unknown;
  gossip_seeds: unknown;
}

export class PersonaRepository {
  constructor(private readonly client: SupabaseLike = defaultSupabaseClient) {}

  async listByUser(userId: string): Promise<Array<Pick<Persona, 'id' | 'name' | 'avatar_url'>>> {
    const { data, error } = await this.client
      .from('personas')
      .select('id, name, avatar_url')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as Array<Pick<Persona, 'id' | 'name' | 'avatar_url'>>;
  }

  async listByUserOrGlobal(userId: string): Promise<Persona[]> {
    const { data, error } = await this.client
      .from('personas')
      .select('*')
      .or(`is_global.eq.true,user_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const personas = (data || []) as Array<Persona & { is_global?: boolean; is_active?: boolean }>;
    return personas.filter(
      (persona) => persona.user_id === userId || (persona.is_global && persona.is_active !== false)
    );
  }

  async getById(personaId: string): Promise<Persona | null> {
    const { data, error } = await this.client
      .from('personas')
      .select('*')
      .eq('id', personaId)
      .maybeSingle();

    if (error) throw error;
    return (data as Persona) || null;
  }

  async getForProcessing(personaId: string): Promise<PersonaProcessingRow | null> {
    const { data, error } = await this.client
      .from('personas')
      .select('id, name, system_instruction, living_persona, is_processed')
      .eq('id', personaId)
      .maybeSingle();

    if (error) throw error;
    return (data as PersonaProcessingRow) || null;
  }

  async listProcessingCandidates(userId: string): Promise<PersonaProcessingCandidateRow[]> {
    const { data, error } = await this.client
      .from('personas')
      .select('id, name, living_persona, is_processed')
      .eq('user_id', userId);

    if (error) throw error;
    return (data || []) as PersonaProcessingCandidateRow[];
  }

  async updateProcessedPersona(personaId: string, livingPersona: unknown): Promise<void> {
    const { error } = await this.client
      .from('personas')
      .update({
        living_persona: livingPersona,
        is_processed: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', personaId);

    if (error) throw error;
  }

  async getPreprocessedAgiData(personaId: string): Promise<PersonaPreprocessedAgiRow | null> {
    const { data, error } = await this.client
      .from('personas')
      .select('agi_state, quantum_state, meta_state, temporal_state, life_context, social_graph_data, gossip_seeds')
      .eq('id', personaId)
      .maybeSingle();

    if (error) throw error;
    return (data as PersonaPreprocessedAgiRow) || null;
  }
}

export const personaRepository = new PersonaRepository();
