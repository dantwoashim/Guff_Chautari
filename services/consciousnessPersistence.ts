
import { supabase } from '../lib/supabase';

const supabaseDb = supabase;

export const saveConsciousnessState = async (
  userId: string,
  sessionId: string,
  states: {
    quantum?: any;
    meta?: any;
    temporal?: any;
    social?: any;
    currentDay?: any;
  }
) => {
  const { error } = await supabaseDb
    .from('persona_consciousness')
    .upsert({
      user_id: userId,
      session_id: sessionId,
      quantum_state: states.quantum || {},
      meta_state: states.meta || {},
      temporal_state: states.temporal || {},
      social_state: states.social || {},
      current_day: states.currentDay || {},
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,session_id' });
    
  if (error) console.error('[Consciousness] Save failed:', error);
};

export const loadConsciousnessState = async (userId: string, sessionId: string) => {
  const { data } = await supabaseDb
    .from('persona_consciousness')
    .select('*')
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .single();
    
  return data;
};
