
import { GoogleGenAI, Type } from "@google/genai";
import { supabase } from "../lib/supabase";
import { 
  Prediction, 
  PredictionType, 
  PreemptiveAction, 
  Message, 
  Memory 
} from "../types";
import { v4 as uuidv4 } from 'uuid';
import { modelManager } from "./modelManager";

// Safe lazy initialization
const getAiClient = () => {
    const apiKey = (typeof process !== 'undefined' && process.env) ? process.env.API_KEY : '';
    return new GoogleGenAI({ apiKey: apiKey || '' });
};

class OracleEngine {
  public async generatePredictions(userId: string): Promise<Prediction[]> {
    const ai = getAiClient();
    const [chats, memories] = await Promise.all([
      supabase.from('chats').select('messages').eq('user_id', userId).order('created_at', { ascending: false }).limit(10),
      supabase.from('memories').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20)
    ]);

    const conversations = (chats.data || []).flatMap(c => c.messages || []).slice(-50);
    const recentMemories = memories.data || [];

    const convoContext = conversations.map((m: Message) => `${m.role.toUpperCase()}: ${m.text}`).join('\n');
    const memoryContext = recentMemories.map((m: any) => `- (${m.type}) ${m.content}`).join('\n');

    const prompt = `
      You are the Oracle Protocol of Ashim (ASI). Analyze the user's patterns to generate predictions for their needs and behaviors over the next 24-48 hours.

      RECENT CONVERSATIONS:
      ${convoContext}

      ACTIVE MEMORIES:
      ${memoryContext}

      GOAL: Identify what the user will likely need, ask, or feel next. Be specific and insightful.
      
      CATEGORIES:
      - TOPIC: Specific subjects the user is likely to bring up or continue.
      - MOOD: The expected emotional trajectory based on current tensions or successes.
      - NEED: Proactive assistance they might require (research, support, organization).
      - DECISION: Choices the user is contemplating but has not yet resolved.
    `;

    try {
      const response = await modelManager.runWithFallback('complex', async (model) => {
          return await ai.models.generateContent({
            model: model,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
              responseMimeType: "application/json",
              thinkingConfig: { thinkingBudget: 10 },
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  predictions: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        type: { type: Type.STRING, enum: ['topic', 'mood', 'need', 'decision'] },
                        content: { type: Type.STRING },
                        confidence: { type: Type.NUMBER },
                        timeframe: { type: Type.STRING },
                        evidence: { type: Type.ARRAY, items: { type: Type.STRING } },
                        suggestedAction: { type: Type.STRING }
                      },
                      required: ['type', 'content', 'confidence', 'timeframe', 'evidence', 'suggestedAction']
                    }
                  }
                },
                required: ['predictions']
              }
            }
          });
      });

      const data = JSON.parse(response.text || '{"predictions": []}');
      const rawPredictions = data.predictions || [];

      const predictions: Prediction[] = rawPredictions.map((p: any) => ({
        id: uuidv4(),
        ...p
      }));

      const dbEntries = predictions.map(p => ({
        id: p.id,
        user_id: userId,
        type: p.type,
        content: p.content,
        confidence: p.confidence,
        timeframe: p.timeframe,
        evidence: p.evidence,
        suggested_action: p.suggestedAction,
        created_at: new Date().toISOString()
      }));

      await supabase.from('predictions').insert(dbEntries);

      return predictions;
    } catch (error) {
      console.error("[Oracle] Prediction generation failed:", error);
      return [];
    }
  }

  public async getPredictions(userId: string): Promise<Prediction[]> {
    const { data, error } = await supabase
      .from('predictions')
      .select('*')
      .eq('user_id', userId)
      .is('was_accurate', null)
      .order('created_at', { ascending: false });

    if (error) return [];
    
    return data.map(d => ({
      id: d.id,
      type: d.type as PredictionType,
      content: d.content,
      confidence: d.confidence,
      timeframe: d.timeframe,
      evidence: d.evidence,
      suggestedAction: d.suggested_action
    }));
  }

  public async executePreemptiveAction(prediction: Prediction): Promise<PreemptiveAction> {
    const ai = getAiClient();
    const actionId = uuidv4();
    
    await supabase.from('preemptive_actions').insert({
      id: actionId,
      prediction_id: prediction.id,
      description: prediction.suggestedAction || `Preparing context for ${prediction.type}: ${prediction.content}`,
      status: 'pending'
    });

    try {
      let resultData: any = {};

      if (prediction.type === 'topic' || prediction.type === 'need') {
        const researchResponse = await modelManager.runWithFallback('chat', async (model) => {
            return await ai.models.generateContent({
              model: model,
              contents: [{ role: 'user', parts: [{ text: `The user is likely to ask about: "${prediction.content}". Prepare a concise summary of key facts and potential helpful resources to have in your immediate context. Be ready to assist proactively.` }] }],
              config: { thinkingConfig: { thinkingBudget: 10 } }
            });
        });
        resultData = { backgroundContext: researchResponse.text };
      } else if (prediction.type === 'mood') {
        resultData = { toneAdjustment: `Shift toward ${prediction.content} empathy.` };
      }

      await supabase.from('preemptive_actions').update({
        status: 'completed',
        result: resultData,
        completed_at: new Date().toISOString()
      }).eq('id', actionId);

      return {
        id: actionId,
        description: prediction.suggestedAction || "Analysis completed",
        status: 'completed',
        result: JSON.stringify(resultData)
      };
    } catch (e) {
      await supabase.from('preemptive_actions').update({ status: 'failed' }).eq('id', actionId);
      throw e;
    }
  }

  public async validatePrediction(predictionId: string, wasAccurate: boolean): Promise<void> {
    await supabase
      .from('predictions')
      .update({ 
        was_accurate: wasAccurate, 
        validated_at: new Date().toISOString() 
      })
      .eq('id', predictionId);
  }

  public async getAccuracyScore(userId: string): Promise<number> {
    const { data, error } = await supabase
      .from('predictions')
      .select('was_accurate')
      .eq('user_id', userId)
      .not('was_accurate', 'is', null);

    if (error || !data || data.length === 0) return 0;

    const accurateCount = data.filter(d => d.was_accurate === true).length;
    return (accurateCount / data.length) * 100;
  }
}

export const oracleService = new OracleEngine();
