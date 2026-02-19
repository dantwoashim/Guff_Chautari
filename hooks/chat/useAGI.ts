
import { useState, useEffect, useCallback } from 'react';
import {
    AGIConsciousnessState,
    initializeConsciousness,
    saveConsciousnessState,
    loadConsciousnessState
} from '../../services/agiConsciousness';
import { LivingPersonaInstance, initializeLivingPersona } from '../../services/livingPersona';
import { saveRelationshipState, loadRelationshipState } from '../../services/relationshipPersistence';
import { ChatConfig } from '../../types';
import { personaRepository } from '../../src/data/repositories';

export const useAGI = (
    session: any,
    currentSessionId: string,
    config: ChatConfig
) => {
    const [agiState, setAgiState] = useState<AGIConsciousnessState | null>(null);
    const [livingInstance, setLivingInstance] = useState<LivingPersonaInstance | null>(null);

    // Persist state to DB
    const saveAGIState = useCallback(async () => {
        if (!session?.user?.id || !currentSessionId || !agiState) return;

        const personaId = config.livingPersona?.id || currentSessionId;
        await saveConsciousnessState(session.user.id, personaId, agiState);

        // Also save Relationship State if living instance exists
        if (livingInstance) {
            await saveRelationshipState(session.user.id, livingInstance.relationshipState);
        }
    }, [session, currentSessionId, agiState, livingInstance, config.livingPersona?.id]);

    // Load state from DB
    const loadAGIState = useCallback(async () => {
        if (!session?.user?.id) return false;
        const personaId = config.livingPersona?.id || currentSessionId;

        const loadedState = await loadConsciousnessState(session.user.id, personaId);
        if (loadedState) {
            setAgiState(loadedState);
            return true;
        }
        return false;
    }, [session, currentSessionId, config.livingPersona?.id]);

    // Initialize/Load
    useEffect(() => {
        if (!session?.user?.id) return;

        const initializeAGISystems = async () => {
            const personaId = config.livingPersona?.id || currentSessionId;

            // FIXED: Try to load pre-processed states from personas table first
            let preProcessedData: any = null;
            if (personaId && personaId !== currentSessionId) {
                const personaData = await personaRepository.getPreprocessedAgiData(personaId);
                if (personaData) {
                    preProcessedData = personaData;
                    console.log('[AGI] Found pre-processed data in personas table');
                }
            }

            // 1. Load AGI Consciousness (Internal State)
            if (!agiState) {
                // First try persona_consciousness table (user-specific runtime state)
                const loaded = await loadAGIState();

                if (!loaded) {
                    // Try pre-processed state from personas table
                    if (preProcessedData?.agi_state) {
                        setAgiState(preProcessedData.agi_state as AGIConsciousnessState);
                        console.log('[AGI] Using pre-processed AGI state from personas table');
                    } else {
                        // Fall back to fresh initialization
                        const newState = initializeConsciousness(personaId);
                        setAgiState(newState);
                        console.log('[AGI] Consciousness initialized fresh for:', personaId);
                    }
                } else {
                    console.log('[AGI] Consciousness rehydrated from runtime state');
                }
            }

            // 2. Load Living Persona & Relationship (Social State)
            if (!livingInstance) {
                // FIXED: Build profile from pre-processed data OR config
                let personaProfile: any = undefined;

                // Priority 1: Pre-processed social graph from DB
                if (preProcessedData?.social_graph_data) {
                    const socialData = preProcessedData.social_graph_data;
                    personaProfile = {
                        friends: Array.isArray(socialData) ? socialData.map((p: any) => p.name) : [],
                        familyMembers: ['mama', 'baba'],
                        interests: ['music', 'shows', 'fashion'],
                        subjects: [],
                        places: ['the mall', 'college', 'home']
                    };
                    console.log('[AGI] Using pre-processed social graph');
                }
                // Priority 2: Config living_life (if populated by personaProcessor)
                else {
                    const livingLife = config.livingPersona?.living_life as Record<string, unknown> | undefined;
                    const socialCircle = (livingLife?.social_circle ?? null) as Record<string, unknown> | null;
                    const friendGroup = Array.isArray(socialCircle?.friend_group)
                        ? socialCircle?.friend_group
                        : null;

                    if (friendGroup) {
                    personaProfile = {
                        friends: friendGroup
                            .map((friend) => {
                                if (!friend || typeof friend !== 'object') return '';
                                const name = (friend as { name?: unknown }).name;
                                return typeof name === 'string' ? name : '';
                            })
                            .filter((name) => name.length > 0),
                        familyMembers: ['mama', 'baba'],
                        interests: ['music', 'shows', 'fashion'],
                        subjects: [],
                        places: ['the mall', 'college', 'home']
                    };
                    } else {
                        // Priority 3: Default profile
                    personaProfile = {
                        friends: ['friend1', 'friend2'],
                        familyMembers: ['mama', 'baba'],
                        interests: ['music', 'shows', 'fashion'],
                        subjects: [],
                        places: ['the mall', 'college', 'home']
                    };
                    }
                }

                // Try to load existing relationship state
                const existingRelationship = await loadRelationshipState(session.user.id, personaId);
                if (existingRelationship) {
                    console.log('[Relationship] Rehydrated existing dynamics');
                }

                const instance = initializeLivingPersona(
                    personaId,
                    session.user.id,
                    personaProfile,
                    existingRelationship || undefined
                );
                setLivingInstance(instance);
                console.log('[Living] Persona instance initialized');
            }
        };

        initializeAGISystems();
    }, [session?.user?.id, currentSessionId, config.livingPersona?.id]); // agiState excluded to prevent loops

    // Periodic Save (Auto-save every 10s if changed)
    useEffect(() => {
        if (!agiState && !livingInstance) return;

        const timeout = setTimeout(() => {
            saveAGIState();
        }, 10000);

        return () => clearTimeout(timeout);
    }, [agiState, livingInstance, saveAGIState]);

    return {
        agiState,
        setAgiState,
        livingInstance,
        setLivingInstance,
        saveAGIState
    };
};
