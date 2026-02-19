import { defaultSupabaseClient, SupabaseLike } from './base';

interface CreateSessionInput {
  userId: string;
  title: string;
  personaId?: string | null;
  sessionConfig?: Record<string, unknown>;
}

interface PersonaNameJoin {
  name: string | null;
}

export interface SessionWithPersonaRow {
  id: string;
  title: string;
  persona_id: string | null;
  session_config: Record<string, unknown> | null;
  processed_persona: unknown;
  is_active: boolean;
  created_at: string;
  personas: PersonaNameJoin | null;
}

export interface SessionWithPersonaFallbackRow {
  id: string;
  title: string;
  persona_id: string | null;
  session_config: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  personas: PersonaNameJoin | null;
}

export interface SessionRecord {
  id: string;
  user_id: string;
  title: string;
  persona_id: string | null;
  is_active: boolean;
  session_config: Record<string, unknown> | null;
  created_at: string;
}

export class SessionRepository {
  constructor(private readonly client: SupabaseLike = defaultSupabaseClient) {}

  async deactivateByUser(userId: string): Promise<void> {
    const { error } = await this.client
      .from('sessions')
      .update({ is_active: false })
      .eq('user_id', userId);
    if (error) throw error;
  }

  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    const { data, error } = await this.client
      .from('sessions')
      .insert({
        user_id: input.userId,
        title: input.title,
        persona_id: input.personaId ?? null,
        is_active: true,
        session_config: input.sessionConfig ?? {},
      })
      .select('id, user_id, title, persona_id, is_active, session_config, created_at')
      .single();

    if (error) throw error;
    return data as SessionRecord;
  }

  async listByUserWithPersona(userId: string): Promise<SessionWithPersonaRow[]> {
    const { data, error } = await this.client
      .from('sessions')
      .select(`
        id,
        title,
        persona_id,
        session_config,
        processed_persona,
        is_active,
        created_at,
        personas:persona_id (name)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as SessionWithPersonaRow[];
  }

  async listByUserWithPersonaFallback(userId: string): Promise<SessionWithPersonaFallbackRow[]> {
    const { data, error } = await this.client
      .from('sessions')
      .select(`
        id,
        title,
        persona_id,
        session_config,
        is_active,
        created_at,
        personas:persona_id (name)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as SessionWithPersonaFallbackRow[];
  }

  async deactivateOthers(userId: string, _sessionId: string): Promise<void> {
    const { error } = await this.client
      .from('sessions')
      .update({ is_active: false })
      .eq('user_id', userId);

    if (error) throw error;
  }

  async activate(sessionId: string): Promise<void> {
    const { error } = await this.client
      .from('sessions')
      .update({ is_active: true })
      .eq('id', sessionId);

    if (error) throw error;
  }
}

export const sessionRepository = new SessionRepository();
