
import { GoogleGenAI, Modality } from "@google/genai";
import { supabase } from "../lib/supabase";
import { 
  Dream, 
  DreamArtifact, 
  Message, 
  Memory, 
  DreamContext, 
  DreamArtifactType 
} from "../types";
import { createMemory } from "./memoryService";
import { v4 as uuidv4 } from 'uuid';
import { modelManager } from "./modelManager";

// Safe lazy initialization
const getAiClient = () => {
    const apiKey = (typeof process !== 'undefined' && process.env) ? process.env.API_KEY : '';
    return new GoogleGenAI({ apiKey: apiKey || '' });
};

class DreamEngine {
  private isDreamingState: boolean = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private userId: string | null = null;
  private quietHoursStart: string = "23:00";
  private quietHoursEnd: string = "07:00";

  public async startDreaming(userId: string): Promise<void> {
    this.userId = userId;
    this.resetIdleTimer();
  }

  public stopDreaming(): void {
    this.isDreamingState = false;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  public isDreaming(): boolean {
    return this.isDreamingState;
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    
    // 30 minutes idle time = 1800000ms
    this.idleTimer = setTimeout(() => {
      this.triggerDreamSequence();
    }, 1800000); 
  }

  public onUserActivity(): void {
    if (this.isDreamingState) {
        this.stopDreaming();
        if (this.userId) this.startDreaming(this.userId);
    } else {
        this.resetIdleTimer();
    }
  }

  private async triggerDreamSequence(): Promise<void> {
    if (!this.userId || this.isQuietHours()) return;
    
    const { data: recentChats } = await supabase
      .from('chats')
      .select('messages, created_at')
      .eq('user_id', this.userId)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if (!recentChats || recentChats.length === 0) return;

    const allMessages: Message[] = recentChats.flatMap(chat => chat.messages || []);
    if (allMessages.length < 5) return; 

    this.isDreamingState = true;
    
    const { data: memories } = await supabase
      .from('memories')
      .select('*')
      .eq('user_id', this.userId)
      .limit(10);

    const context: DreamContext = {
      recentConversations: allMessages,
      memories: (memories || []).map(m => ({
        id: m.id,
        content: m.content,
        type: m.type,
        embedding: m.embedding,
        timestamp: new Date(m.created_at).getTime(),
        decayFactor: m.decay_factor,
        connections: m.connections || [],
        emotionalValence: m.emotional_valence,
        metadata: m.metadata || {}
      })),
      emotionalTone: "Contemplative",
      timeContext: new Date().toLocaleTimeString()
    };

    try {
      const dream = await this.generateDream(context);
      await this.saveDream(dream);
    } catch (e) {
      console.error("Dream generation failed", e);
    } finally {
      this.isDreamingState = false;
      this.resetIdleTimer();
    }
  }

  public async generateDream(context: DreamContext): Promise<Dream> {
    if (!this.userId) throw new Error("No user ID");

    const analysis = await this.extractDreamThemes(context.recentConversations);
    
    const type = analysis.suggestedDreamType as DreamArtifactType;
    const artifacts: DreamArtifact[] = [];

    if (type === 'image') {
      const artifact = await this.generateImageDream(analysis.dreamPromptSuggestion, analysis.themes.join(", "), analysis.emotionalUndertones.join(", "));
      artifacts.push(artifact);
    } else if (type === 'audio') {
      const artifact = await this.generateAudioDream(analysis.themes.join(", "), analysis.emotionalUndertones[0] || "Peaceful");
      artifacts.push(artifact);
    } else if (type === 'text' || type === 'code') {
      const artifact = await this.generateTextDream(analysis.themes, analysis.emotionalUndertones[0], type);
      artifacts.push(artifact);
    }

    return {
      id: uuidv4(),
      user_id: this.userId,
      themes: analysis.themes,
      artifacts,
      emotionalTone: analysis.emotionalUndertones.join(", "),
      sourceConversations: context.recentConversations.slice(-5).map(m => m.id),
      createdAt: Date.now()
    };
  }

  private async extractDreamThemes(conversations: Message[]): Promise<any> {
    const ai = getAiClient();
    const convoText = conversations.slice(-20).map(m => `${m.role}: ${m.text}`).join('\n');
    
    const prompt = `
Analyze these conversations from today and extract the underlying themes, emotions, and unresolved threads:

Conversations:
${convoText}

Identify:
1. Main themes (abstract concepts, not just topics)
2. Emotional undertones (not just stated emotions)
3. Unresolved questions or tensions
4. Creative seeds (ideas that could be expanded)
5. Metaphorical representations

Return JSON:
{
  "themes": ["theme1", "theme2"],
  "emotionalUndertones": ["emotion1", "emotion2"],
  "unresolvedThreads": ["thread1", "thread2"],
  "creativeSeeds": ["seed1", "seed2"],
  "suggestedDreamType": "image|audio|text|code",
  "dreamPromptSuggestion": "string"
}
    `;

    return modelManager.runWithFallback('complex', async (model) => {
        const response = await ai.models.generateContent({
            model: model,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: { 
                responseMimeType: 'application/json',
                thinkingConfig: { thinkingBudget: 10 }
            }
        });
        return JSON.parse(response.text || "{}");
    });
  }

  private async generateImageDream(suggestion: string, themes: string, tone: string): Promise<DreamArtifact> {
    const ai = getAiClient();
    const promptInput = `
Create a visual representation of these themes:
Themes: ${themes}
Emotional tone: ${tone}
Creative approach: Abstract, surreal, dreamlike quality. 
Refined Suggestion: ${suggestion}

Generate an image prompt that captures the essence without being literal.
The image should feel like a dream - familiar yet strange, meaningful yet mysterious.
    `;

    return modelManager.runWithFallback('vision', async (model) => {
        const response = await ai.models.generateContent({
            model: model,
            contents: [{ role: 'user', parts: [{ text: promptInput }] }],
            config: {
                // @ts-ignore
                imageConfig: { aspectRatio: "1:1" }
            }
        });

        let base64 = "";
        let desc = "A visual exploration of your subconscious thoughts.";
        
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                base64 = `data:image/png;base64,${part.inlineData.data}`;
            } else if (part.text) {
                desc = part.text;
            }
        }

        return {
            type: 'image',
            content: base64,
            description: desc,
            prompt: suggestion
        };
    });
  }

  private async generateAudioDream(themes: string, tone: string): Promise<DreamArtifact> {
    const ai = getAiClient();
    const textPrompt = `Create a rhythmic soundscape or spoken reflection for these themes: ${themes}. Tone: ${tone}. High poetic value.`;
    
    return modelManager.runWithFallback('speech', async (model) => {
        const response = await ai.models.generateContent({
            model: model,
            contents: [{ parts: [{ text: textPrompt }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Zephyr' },
                    },
                },
            },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
        
        return {
            type: 'audio',
            content: base64Audio,
            description: `An auditory reflection on ${themes}.`,
            prompt: textPrompt
        };
    });
  }

  private async generateTextDream(themes: string[], tone: string, type: 'text' | 'code'): Promise<DreamArtifact> {
    const ai = getAiClient();
    const promptInput = `
Create a ${type === 'code' ? 'conceptual code snippet' : 'poetic reflection'} on these themes:
Themes: ${themes.join(", ")}
Emotional tone: ${tone}

Generate one of:
- A haiku (if themes are contemplative)
- A short prose poem (if themes are complex)
- An abstract reflection (if themes are philosophical)
${type === 'code' ? '- A recursive function representing the cycle of thoughts' : ''}

The piece should feel personal yet universal.

Return JSON:
{
  "format": "haiku|prose|reflection|code",
  "content": "string",
  "description": "string"
}
    `;

    return modelManager.runWithFallback('complex', async (model) => {
        const response = await ai.models.generateContent({
            model: model,
            contents: [{ role: 'user', parts: [{ text: promptInput }] }],
            config: { 
                responseMimeType: 'application/json',
                thinkingConfig: { thinkingBudget: 10 }
            }
        });

        const data = JSON.parse(response.text || "{}");

        return {
            type: type,
            content: data.content,
            description: data.description,
            prompt: promptInput
        };
    });
  }

  private async saveDream(dream: Dream): Promise<void> {
    const { error } = await supabase.from('dreams').insert({
      id: dream.id,
      user_id: dream.user_id,
      themes: dream.themes,
      artifacts: dream.artifacts,
      emotional_tone: dream.emotionalTone,
      source_conversations: dream.sourceConversations,
      created_at: new Date(dream.createdAt).toISOString()
    });
    
    if (error) {
        console.error("Error saving dream", error);
        return;
    }

    const summary = `Ashim had a subconscious dream about: ${dream.themes.join(', ')}. Description: ${dream.artifacts[0]?.description}. Emotional tone: ${dream.emotionalTone}.`;
    await createMemory(dream.user_id, summary, 'episodic', {
        type: 'dream_reflection',
        dreamId: dream.id
    }, 0.5);
  }

  public async getDreamGallery(userId: string, limit: number = 20): Promise<Dream[]> {
    const { data, error } = await supabase
      .from('dreams')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    
    return (data || []).map(d => ({
      id: d.id,
      user_id: d.user_id,
      themes: d.themes,
      artifacts: d.artifacts,
      emotionalTone: d.emotional_tone,
      sourceConversations: d.source_conversations,
      createdAt: new Date(d.created_at).getTime()
    }));
  }

  public async deleteDream(dreamId: string): Promise<void> {
    await supabase.from('dreams').delete().eq('id', dreamId);
  }

  private isQuietHours(): boolean {
    const now = new Date();
    const current = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    return current >= this.quietHoursStart || current <= this.quietHoursEnd;
  }
}

export const dreamEngine = new DreamEngine();
