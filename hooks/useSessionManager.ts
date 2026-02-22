/**
 * @file hooks/useSessionManager.ts
 * @description Session manager with persona caching and schema-safe fallbacks.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { processCustomInstruction } from '../services/personaProcessor';
import { ChatConfig, LivingPersona } from '../types';

interface AshimSession {
  id: string;
  title: string;
  persona_id: string | null;
  persona_name?: string;
  session_config: Partial<ChatConfig>;
  processed_persona?: LivingPersona | null;
  is_active: boolean;
  created_at: string;
}

interface SessionManagerState {
  currentSession: AshimSession | null;
  allSessions: AshimSession[];
  personaCache: Map<string, LivingPersona>;
  isLoading: boolean;
  isSwitching: boolean;
}

const CACHE_SIZE_LIMIT = 24;

const hasSchemaMismatch = (error: any): boolean => {
  const message = (error?.message || '').toLowerCase();
  return (
    error?.code === '42703' ||
    error?.code === 'PGRST200' ||
    error?.code === 'PGRST204' ||
    message.includes('schema cache') ||
    message.includes('processed_persona') ||
    message.includes("relationship between 'sessions' and 'persona_id'")
  );
};

const hasMissingTable = (error: any, tableName: string): boolean => {
  const message = (error?.message || '').toLowerCase();
  return error?.code === '42P01' || message.includes(`relation "${tableName}" does not exist`);
};

export function useSessionManager(userId: string | null) {
  const [state, setState] = useState<SessionManagerState>({
    currentSession: null,
    allSessions: [],
    personaCache: new Map(),
    isLoading: true,
    isSwitching: false,
  });

  const personaCacheRef = useRef<Map<string, LivingPersona>>(new Map());

  const cachePersona = useCallback((personaId: string, persona: LivingPersona) => {
    if (personaCacheRef.current.size >= CACHE_SIZE_LIMIT) {
      const oldestKey = personaCacheRef.current.keys().next().value;
      if (oldestKey) {
        personaCacheRef.current.delete(oldestKey);
      }
    }

    personaCacheRef.current.set(personaId, persona);
    setState((prev) => ({ ...prev, personaCache: new Map(personaCacheRef.current) }));
  }, []);

  const processAndCachePersona = useCallback(
    async (personaId: string, forceRefresh: boolean = false): Promise<LivingPersona | null> => {
      if (!forceRefresh) {
        const cached = personaCacheRef.current.get(personaId);
        if (cached) {
          return cached;
        }
      }

      const { data: persona, error } = await supabase
        .from('personas')
        .select('id, name, system_instruction, living_persona, is_processed')
        .eq('id', personaId)
        .maybeSingle();

      if (error || !persona) {
        console.warn('[SessionManager] Persona fetch failed:', error?.message || 'Not found');
        return null;
      }

      if (!forceRefresh && persona.is_processed && persona.living_persona) {
        const existing = persona.living_persona as LivingPersona;
        cachePersona(personaId, existing);
        return existing;
      }

      if (!persona.system_instruction) {
        return null;
      }

      const processed = await processCustomInstruction(persona.system_instruction);
      if (!processed.success || !processed.persona) {
        return null;
      }

      cachePersona(personaId, processed.persona);

      await supabase
        .from('personas')
        .update({
          living_persona: processed.persona,
          is_processed: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', personaId);

      return processed.persona;
    },
    [cachePersona],
  );

  const preloadAllPersonas = useCallback(async () => {
    if (!userId) return;

    const { data, error } = await supabase
      .from('personas')
      .select('id, is_processed, living_persona')
      .eq('user_id', userId);

    if (error || !data) {
      return;
    }

    const pending: Promise<LivingPersona | null>[] = [];

    data.forEach((persona) => {
      if (personaCacheRef.current.has(persona.id)) {
        return;
      }

      if (persona.is_processed && persona.living_persona) {
        cachePersona(persona.id, persona.living_persona as LivingPersona);
        return;
      }

      pending.push(processAndCachePersona(persona.id));
    });

    if (pending.length) {
      await Promise.allSettled(pending);
    }
  }, [cachePersona, processAndCachePersona, userId]);

  const loadSessions = useCallback(async () => {
    if (!userId) return;

    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      let rows: any[] | null = null;
      let activeError: any = null;

      const fullQuery = await supabase
        .from('sessions')
        .select(
          `
          id,
          title,
          persona_id,
          session_config,
          processed_persona,
          is_active,
          created_at,
          personas:persona_id (name)
        `,
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (fullQuery.error && hasSchemaMismatch(fullQuery.error)) {
        const fallbackQuery = await supabase
          .from('sessions')
          .select(
            `
            id,
            title,
            persona_id,
            session_config,
            is_active,
            created_at
          `,
          )
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        rows = fallbackQuery.data;
        activeError = fallbackQuery.error;
      } else {
        rows = fullQuery.data;
        activeError = fullQuery.error;
      }

      if (activeError) {
        if (hasMissingTable(activeError, 'sessions')) {
          setState((prev) => ({
            ...prev,
            currentSession: null,
            allSessions: [],
            isLoading: false,
          }));
          return;
        }

        console.error('[SessionManager] Failed to load sessions:', activeError.message || activeError);
        setState((prev) => ({ ...prev, isLoading: false }));
        return;
      }

      const sessions: AshimSession[] = (rows || []).map((row) => ({
        id: row.id,
        title: row.title,
        persona_id: row.persona_id,
        persona_name: (row.personas as any)?.name,
        session_config: row.session_config || {},
        processed_persona: row.processed_persona,
        is_active: row.is_active,
        created_at: row.created_at,
      }));

      sessions.forEach((session) => {
        if (!session.persona_id) return;

        if (session.processed_persona) {
          cachePersona(session.persona_id, session.processed_persona);
        } else {
          processAndCachePersona(session.persona_id);
        }
      });

      setState((prev) => ({
        ...prev,
        currentSession: sessions.find((session) => session.is_active) || null,
        allSessions: sessions,
        personaCache: new Map(personaCacheRef.current),
        isLoading: false,
      }));
    } catch (error: any) {
      console.error('[SessionManager] Load error:', error?.message || error);
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [cachePersona, processAndCachePersona, userId]);

  const switchSession = useCallback(
    async (sessionId: string): Promise<{ session: AshimSession; persona: LivingPersona | null } | null> => {
      const selected = state.allSessions.find((session) => session.id === sessionId);
      if (!selected || !userId) return null;

      setState((prev) => ({ ...prev, isSwitching: true }));

      try {
        await supabase.from('sessions').update({ is_active: false }).eq('user_id', userId).neq('id', sessionId);
        await supabase.from('sessions').update({ is_active: true }).eq('id', sessionId);

        let persona: LivingPersona | null = null;
        if (selected.persona_id) {
          persona = personaCacheRef.current.get(selected.persona_id) || null;
          if (!persona) {
            persona = await processAndCachePersona(selected.persona_id);
          }
        }

        setState((prev) => ({
          ...prev,
          currentSession: { ...selected, is_active: true },
          isSwitching: false,
        }));

        return { session: selected, persona };
      } catch (error: any) {
        console.error('[SessionManager] Switch error:', error?.message || error);
        setState((prev) => ({ ...prev, isSwitching: false }));
        return null;
      }
    },
    [processAndCachePersona, state.allSessions, userId],
  );

  const createSession = useCallback(
    async (title: string, personaId: string | null = null): Promise<AshimSession | null> => {
      if (!userId) return null;

      try {
        await supabase.from('sessions').update({ is_active: false }).eq('user_id', userId);

        const { data, error } = await supabase
          .from('sessions')
          .insert({
            user_id: userId,
            title,
            persona_id: personaId,
            is_active: true,
            session_config: {},
          })
          .select()
          .single();

        if (error || !data) {
          throw error;
        }

        const nextSession: AshimSession = {
          id: data.id,
          title: data.title,
          persona_id: data.persona_id,
          session_config: data.session_config || {},
          is_active: true,
          created_at: data.created_at,
        };

        if (personaId) {
          processAndCachePersona(personaId);
        }

        setState((prev) => ({
          ...prev,
          currentSession: nextSession,
          allSessions: [nextSession, ...prev.allSessions],
        }));

        return nextSession;
      } catch (error: any) {
        console.error('[SessionManager] Create error:', error?.message || error);
        return null;
      }
    },
    [processAndCachePersona, userId],
  );

  useEffect(() => {
    if (!userId) return;

    loadSessions();
    preloadAllPersonas();

    const channel = supabase
      .channel(`session-manager-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sessions',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          loadSessions();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadSessions, preloadAllPersonas, userId]);

  const getCurrentPersona = useCallback((): LivingPersona | null => {
    if (!state.currentSession?.persona_id) return null;
    return personaCacheRef.current.get(state.currentSession.persona_id) || null;
  }, [state.currentSession]);

  const getPersona = useCallback((personaId: string): LivingPersona | null => {
    return personaCacheRef.current.get(personaId) || null;
  }, []);

  return {
    currentSession: state.currentSession,
    allSessions: state.allSessions,
    isLoading: state.isLoading,
    isSwitching: state.isSwitching,
    switchSession,
    createSession,
    loadSessions,
    processAndCachePersona,
    preloadAllPersonas,
    getCurrentPersona,
    getPersona,
  };
}

export type { AshimSession };
