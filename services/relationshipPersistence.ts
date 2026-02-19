
import { supabase } from '../lib/supabase';
import { RelationshipState, initializeRelationshipState } from './relationshipDynamics';

const supabaseDb = supabase;

export async function saveRelationshipState(
    userId: string,
    state: RelationshipState
): Promise<void> {
    // Convert Map to Object for JSON storage if needed, or ensure it's serializable
    // Supabase handles JSONB, but Maps need to be Objects
    let preferencesObj = {};
    if (state.partnerKnowledge?.preferences instanceof Map) {
        preferencesObj = Object.fromEntries(state.partnerKnowledge.preferences);
    } else {
        preferencesObj = state.partnerKnowledge?.preferences || {};
    }
    
    // Ensure we have a valid partner ID (user ID)
    const partnerId = state.partnerId || userId;

    const { error } = await supabaseDb
        .from('relationship_states')
        .upsert({
            user_id: userId,
            persona_id: state.personaId,
            partner_id: partnerId,
            stage: state.stage,
            trust_score: state.trustScore,
            vulnerability_level: state.vulnerabilityLevel,
            conflict_history: state.conflictHistory,
            inside_jokes: state.insideJokes,
            shared_memories: state.sharedMemories,
            partner_knowledge: { ...state.partnerKnowledge, preferences: preferencesObj },
            mood_carryover: state.moodCarryover,
            message_count: state.messageCount,
            days_together: state.daysTogether,
            updated_at: new Date().toISOString()
        }, { onConflict: 'persona_id,partner_id' as any });
    
    if (error) console.error('[Relationship] Save failed:', error);
}

export async function loadRelationshipState(
    userId: string,
    personaId: string
): Promise<RelationshipState | null> {
    if (!personaId || !userId) return null;

    const { data, error } = await supabaseDb
        .from('relationship_states')
        .select('*')
        .eq('persona_id', personaId)
        .eq('partner_id', userId)
        .maybeSingle();
    
    if (error) {
        console.error('[Relationship] Load error:', error);
        return null;
    }
    
    if (!data) return null;
    
    // Convert preferences back to Map
    const prefObj = data.partner_knowledge?.preferences || {};
    const preferences = new Map(Object.entries(prefObj));
    
    return {
        personaId: data.persona_id,
        partnerId: data.partner_id,
        stage: data.stage,
        trustScore: data.trust_score,
        vulnerabilityLevel: data.vulnerability_level,
        conflictHistory: data.conflict_history || [],
        insideJokes: data.inside_jokes || [],
        sharedMemories: data.shared_memories || [],
        partnerKnowledge: {
            ...data.partner_knowledge,
            preferences
        },
        moodCarryover: data.mood_carryover,
        messageCount: data.message_count,
        daysTogether: data.days_together,
        lastInteraction: new Date(data.updated_at)
    };
}
