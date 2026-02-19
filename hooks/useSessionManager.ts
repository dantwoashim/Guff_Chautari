
/**
 * @file hooks/useSessionManager.ts
 * @description Session Management with Pre-cached Persona Processing
 * 
 * Enables instant session switching by:
 * 1. Pre-processing personas when sessions are created
 * 2. Caching processed LivingPersona objects
 * 3. Syncing with external site session changes
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { processCustomInstruction } from '../services/personaProcessor';
import { LivingPersona, ChatConfig } from '../types';
import { personaRepository, sessionRepository } from '../src/data/repositories';

// =====================================================
// TYPES
// =====================================================

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

// =====================================================
// HOOK
// =====================================================

export function useSessionManager(userId: string | null) {
    const [state, setState] = useState<SessionManagerState>({
        currentSession: null,
        allSessions: [],
        personaCache: new Map(),
        isLoading: true,
        isSwitching: false
    });

    const personaCacheRef = useRef<Map<string, LivingPersona>>(new Map());
    const MAX_CACHE_SIZE = 20;

    // =====================================================
    // PERSONA PROCESSING
    // =====================================================

    /**
     * Process and cache a persona by ID
     * FIXED: Now checks personas table for pre-processed state first to prevent token waste
     */
    const processAndCachePersona = useCallback(async (
        personaId: string,
        forceRefresh: boolean = false
    ): Promise<LivingPersona | null> => {
        // Check in-memory cache first (fastest)
        if (!forceRefresh && personaCacheRef.current.has(personaId)) {
            console.log('[SessionManager] Persona found in memory cache:', personaId);
            return personaCacheRef.current.get(personaId)!;
        }

        try {
            const persona = await personaRepository.getForProcessing(personaId);

            if (!persona) {
                console.warn('[SessionManager] Persona not found:', personaId);
                return null;
            }

            // FIXED: Check if already processed in DB - use that instead of reprocessing!
            if (!forceRefresh && persona.is_processed && persona.living_persona) {
                console.log('[SessionManager] Using pre-processed persona from DB:', persona.name);
                const cachedPersona = persona.living_persona as LivingPersona;
                personaCacheRef.current.set(personaId, cachedPersona);
                setState(prev => ({ ...prev, personaCache: new Map(personaCacheRef.current) }));
                return cachedPersona;
            }

            // No cached version - need to process
            if (!persona.system_instruction) {
                console.warn('[SessionManager] Persona has no system instruction:', persona.name);
                return null;
            }

            console.log('[SessionManager] Processing persona (not cached):', persona.name);

            // Process using personaProcessor
            const result = await processCustomInstruction(persona.system_instruction);

            if (result.success && result.persona) {
                // Cache Eviction Policy
                if (personaCacheRef.current.size >= MAX_CACHE_SIZE) {
                    const firstKey = personaCacheRef.current.keys().next().value;
                    if (firstKey) {
                        personaCacheRef.current.delete(firstKey);
                    }
                }

                // Update in-memory cache
                personaCacheRef.current.set(personaId, result.persona);
                setState(prev => ({ ...prev, personaCache: new Map(personaCacheRef.current) }));

                // FIXED: Save to PERSONAS table (not sessions) for persistence across reloads
                try {
                    await personaRepository.updateProcessedPersona(personaId, result.persona);
                    console.log('[SessionManager] Saved processed persona to DB:', persona.name);
                } catch (e) {
                    console.warn('[SessionManager] Failed to save persona to DB:', e);
                }

                return result.persona;
            }

            return null;
        } catch (error: any) {
            console.error('[SessionManager] Persona processing error:', error?.message || error);
            return null;
        }
    }, []);

    /**
     * [AI QUALITY FIX] Preload ALL personas on authentication
     * This eliminates switching delay by loading all personas upfront
     */
    const preloadAllPersonas = useCallback(async () => {
        if (!userId) return;

        console.log('[SessionManager] Preloading all personas...');
        const startTime = Date.now();

        try {
            const personas = await personaRepository.listProcessingCandidates(userId);

            if (!personas || personas.length === 0) {
                console.log('[SessionManager] No personas to preload');
                return;
            }

            let cachedCount = 0;
            let processCount = 0;

            // Preload each persona - processed ones are instant, others run in background
            const preloadPromises = personas.map(async (persona) => {
                if (personaCacheRef.current.has(persona.id)) {
                    // Already in memory
                    return;
                }

                if (persona.is_processed && persona.living_persona) {
                    // Pre-processed in DB - instant cache
                    personaCacheRef.current.set(persona.id, persona.living_persona as LivingPersona);
                    cachedCount++;
                } else {
                    // Needs processing - do in background
                    processAndCachePersona(persona.id);
                    processCount++;
                }
            });

            await Promise.all(preloadPromises);

            // Update state with new cache
            setState(prev => ({ ...prev, personaCache: new Map(personaCacheRef.current) }));

            const elapsed = Date.now() - startTime;
            console.log(`[SessionManager] Preloaded ${cachedCount} personas (${processCount} processing) in ${elapsed}ms`);

        } catch (error: any) {
            console.error('[SessionManager] Preload error:', error?.message || error);
        }
    }, [userId, processAndCachePersona]);

    // =====================================================
    // SESSION LOADING
    // =====================================================

    /**
     * Load all sessions and pre-cache their personas
     */
    const loadSessions = useCallback(async () => {
        if (!userId) return;

        setState(prev => ({ ...prev, isLoading: true }));

        try {
            // Load all sessions with their persona info
            let sessions: any[] | null = null;
            try {
                sessions = await sessionRepository.listByUserWithPersona(userId);
            } catch (error: any) {
                if (error?.message?.includes('processed_persona') || error?.code === '42703') {
                    console.warn('[SessionManager] processed_persona column not found, using fallback query');
                    sessions = await sessionRepository.listByUserWithPersonaFallback(userId);
                } else {
                    throw error;
                }
            }

            const formattedSessions: AshimSession[] = (sessions || []).map(s => ({
                id: s.id,
                title: s.title,
                persona_id: s.persona_id,
                persona_name: (s.personas as any)?.name,
                session_config: s.session_config || {},
                processed_persona: s.processed_persona,
                is_active: s.is_active,
                created_at: s.created_at
            }));

            const activeSession = formattedSessions.find(s => s.is_active) || null;

            // Pre-cache all personas in background
            for (const session of formattedSessions) {
                if (session.persona_id) {
                    if (session.processed_persona) {
                        personaCacheRef.current.set(session.persona_id, session.processed_persona);
                    } else {
                        processAndCachePersona(session.persona_id);
                    }
                }
            }

            setState(prev => ({
                ...prev,
                currentSession: activeSession,
                allSessions: formattedSessions,
                personaCache: new Map(personaCacheRef.current),
                isLoading: false
            }));

        } catch (error: any) {
            console.error('[SessionManager] Load error:', error?.message || error);
            setState(prev => ({ ...prev, isLoading: false }));
        }
    }, [userId, processAndCachePersona]);

    // =====================================================
    // SESSION SWITCHING
    // =====================================================

    const switchSession = useCallback(async (sessionId: string): Promise<{
        session: AshimSession;
        persona: LivingPersona | null;
    } | null> => {
        const session = state.allSessions.find(s => s.id === sessionId);
        if (!session) return null;

        setState(prev => ({ ...prev, isSwitching: true }));

        try {
            await sessionRepository.deactivateOthers(userId, sessionId);
            await sessionRepository.activate(sessionId);

            let persona: LivingPersona | null = null;
            if (session.persona_id) {
                persona = personaCacheRef.current.get(session.persona_id) || null;
                if (!persona) {
                    console.log('[SessionManager] Cache miss, processing persona...');
                    persona = await processAndCachePersona(session.persona_id);
                }
            }

            setState(prev => ({
                ...prev,
                currentSession: { ...session, is_active: true },
                isSwitching: false
            }));

            console.log('[SessionManager] Switched to session:', session.title);
            return { session, persona };

        } catch (error: any) {
            console.error('[SessionManager] Switch error:', error?.message || error);
            setState(prev => ({ ...prev, isSwitching: false }));
            return null;
        }
    }, [userId, state.allSessions, processAndCachePersona]);

    const createSession = useCallback(async (
        title: string,
        personaId: string | null = null
    ): Promise<AshimSession | null> => {
        if (!userId) return null;

        try {
            await sessionRepository.deactivateByUser(userId);
            const data = await sessionRepository.createSession({
                userId,
                title,
                personaId,
                sessionConfig: {},
            });

            const newSession: AshimSession = {
                id: data.id,
                title: data.title,
                persona_id: data.persona_id,
                session_config: {},
                is_active: true,
                created_at: data.created_at
            };

            if (personaId) {
                processAndCachePersona(personaId);
            }

            setState(prev => ({
                ...prev,
                currentSession: newSession,
                allSessions: [newSession, ...prev.allSessions]
            }));

            return newSession;

        } catch (error: any) {
            console.error('[SessionManager] Create error:', error?.message || error);
            return null;
        }
    }, [userId, processAndCachePersona]);

    // =====================================================
    // REALTIME SYNC
    // =====================================================

    useEffect(() => {
        if (!userId) return;

        loadSessions();

        // [AI QUALITY FIX] Preload ALL personas on auth for instant switching
        preloadAllPersonas();

        const channel = supabase
            .channel(`session-manager-${userId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'sessions',
                filter: `user_id=eq.${userId}`
            }, async (payload) => {
                const data = payload.new as any;

                if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                    if (data.is_active) {
                        const session: AshimSession = {
                            id: data.id,
                            title: data.title,
                            persona_id: data.persona_id,
                            session_config: data.session_config || {},
                            processed_persona: data.processed_persona,
                            is_active: true,
                            created_at: data.created_at
                        };

                        if (data.persona_id) {
                            if (data.processed_persona) {
                                personaCacheRef.current.set(data.persona_id, data.processed_persona);
                            } else {
                                await processAndCachePersona(data.persona_id);
                            }
                        }

                        setState(prev => ({
                            ...prev,
                            currentSession: session,
                            personaCache: new Map(personaCacheRef.current)
                        }));
                    }
                }

                if (payload.eventType === 'DELETE') {
                    setState(prev => ({
                        ...prev,
                        allSessions: prev.allSessions.filter(s => s.id !== data.id),
                        currentSession: prev.currentSession?.id === data.id ? null : prev.currentSession
                    }));
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId, loadSessions, processAndCachePersona]);

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
        preloadAllPersonas, // [AI QUALITY FIX] Exposed for manual preload
        getCurrentPersona,
        getPersona
    };
}

export type { AshimSession };
