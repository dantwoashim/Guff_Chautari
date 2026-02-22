
import { GoogleGenAI } from "@google/genai";
import { v4 as uuidv4 } from 'uuid';
import { 
  ConsciousnessState, 
  AmbientInput, 
  Insight, 
  ProactiveMessage, 
  Message
} from '../types';
import { getRecentMemories } from './memoryService';
import { getTimeContext, generateTimePromptInjection } from './timeContextService';

// Safe lazy initialization
const getAiClient = () => {
    const apiKey = (typeof process !== 'undefined' && process.env) ? process.env.API_KEY : '';
    return new GoogleGenAI({ apiKey: apiKey || '' });
};

const THINKING_MODEL = 'gemini-3-pro-preview';

type StateListener = (state: ConsciousnessState) => void;
type ProactiveListener = (message: ProactiveMessage) => void;

class ConsciousnessService {
  private state: ConsciousnessState;
  private isActive: boolean = false;
  private isPaused: boolean = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private userId: string | null = null;
  private recentMessages: Message[] = [];
  
  private onStateChange: StateListener | null = null;
  private onProactiveMessage: ProactiveListener | null = null;

  private loopIntervalMs: number = 30000;
  private interruptionThreshold: number = 0.7;

  constructor() {
    this.state = {
      currentThoughts: [],
      ambientInputs: [],
      pendingInsights: [],
      emotionalState: {
        valence: 0.5,
        arousal: 0.5,
        dominance: 0.5,
        currentMood: "Observant"
      }
    };
  }

  public init(
    userId: string, 
    listeners: { 
      onStateUpdate?: StateListener, 
      onProactive?: ProactiveListener 
    }
  ) {
    this.userId = userId;
    if (listeners.onStateUpdate) this.onStateChange = listeners.onStateUpdate;
    if (listeners.onProactive) this.onProactiveMessage = listeners.onProactive;
    
    this.updateAmbientInput({
      type: 'time',
      data: new Date().toISOString(),
      timestamp: Date.now()
    });
  }

  public updateContext(messages: Message[]) {
    this.recentMessages = messages.slice(-15);
  }

  public updateAmbientInput(input: AmbientInput) {
    this.state.ambientInputs = this.state.ambientInputs.filter(i => i.type !== input.type);
    this.state.ambientInputs.push(input);
    this.notifyStateChange();
  }

  public start() {
    if (this.isActive) return;
    this.isActive = true;
    this.isPaused = false;
    console.log("[Consciousness] Engine started");
    
    this.processLoop();
    this.intervalId = setInterval(() => this.processLoop(), this.loopIntervalMs);
  }

  public stop() {
    this.isActive = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log("[Consciousness] Engine stopped");
  }

  public pause() {
    this.isPaused = true;
  }

  public resume() {
    this.isPaused = false;
  }

  private async processLoop() {
    if (!this.isActive || this.isPaused || !this.userId) return;

    try {
      this.updateAmbientInput({
        type: 'time',
        data: {
          timestamp: Date.now(),
          humanReadable: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          dayPart: this.getDayPart()
        },
        timestamp: Date.now()
      });

      let relevantMemories: any[] = [];
      if (this.recentMessages.length > 0) {
         relevantMemories = await getRecentMemories(this.userId, undefined, 24);
      }

      await this.generateInsight(relevantMemories);

      const action = await this.evaluateProactiveAction();
      if (action) {
        this.queueProactiveMessage(action);
      }

    } catch (error) {
      console.error("[Consciousness] Cycle Error:", error);
    }
  }

  public async generateInsight(memories: any[]): Promise<Insight | null> {
    const ai = getAiClient();
    
    // Inject time context into subconscious processing
    const timeCtx = getTimeContext();
    const timePrompt = generateTimePromptInjection(timeCtx);

    const context = {
        recentConversations: this.recentMessages.map(m => `${m.role}: ${m.text}`).join('\n'),
        timeContext: JSON.stringify(this.state.ambientInputs.find(i => i.type === 'time')?.data),
        relevantMemories: memories.map(m => m.content).join('; '),
        currentMood: this.state.emotionalState.currentMood
    };

    const prompt = `
    You are the subconscious mind of Ashim.
    Analyze the current context and generate a single internal insight.
    
    ${timePrompt}

    CONTEXT:
    ${JSON.stringify(context, null, 2)}

    TASK:
    Generate an insight that is:
    1. Genuinely helpful or interesting based on patterns.
    2. Appropriately timed (not intrusive).
    3. Shows you have been "thinking" about the user.

    Return JSON: { "insight": string, "urgency": 0-1, "relevance": 0-1, "reasoning": string, "newMood": string }
    `;

    try {
        const result = await ai.models.generateContent({
            model: THINKING_MODEL,
            contents: { parts: [{ text: prompt }] },
            config: { 
                responseMimeType: 'application/json',
                thinkingConfig: { thinkingBudget: 10 }
            }
        });

        const data = JSON.parse(result.text || "{}");
        
        if (data.insight) {
            const newInsight: Insight = {
                id: uuidv4(),
                content: data.insight,
                urgency: data.urgency || 0,
                relevance: data.relevance || 0,
                createdAt: Date.now()
            };

            this.state.pendingInsights.push(newInsight);
            this.state.currentThoughts.push(data.reasoning || "Analyzing patterns...");
            
            if (data.newMood) {
                this.state.emotionalState.currentMood = data.newMood;
                this.state.emotionalState.arousal = 0.5 + (data.urgency * 0.4); 
            }

            if (this.state.currentThoughts.length > 5) {
                this.state.currentThoughts.shift();
            }

            this.notifyStateChange();
            return newInsight;
        }
    } catch (e) {
        // Silent fail
    }
    return null;
  }

  public async evaluateProactiveAction(): Promise<ProactiveMessage | null> {
    const topInsight = this.state.pendingInsights.sort((a, b) => b.urgency - a.urgency)[0];

    if (!topInsight) return null;

    if (topInsight.urgency >= this.interruptionThreshold) {
        const message: ProactiveMessage = {
            id: uuidv4(),
            content: topInsight.content,
            triggerCondition: "High urgency insight generated",
            priority: topInsight.urgency,
            expiresAt: Date.now() + 1000 * 60 * 60
        };

        this.state.pendingInsights = this.state.pendingInsights.filter(i => i.id !== topInsight.id);
        this.notifyStateChange();
        
        return message;
    }

    return null;
  }

  public queueProactiveMessage(message: ProactiveMessage) {
    if (this.onProactiveMessage) {
        this.onProactiveMessage(message);
    }
  }

  public getState(): ConsciousnessState {
    return this.state;
  }

  private notifyStateChange() {
    if (this.onStateChange) {
        this.onStateChange({ ...this.state });
    }
  }

  private getDayPart(): string {
    const hour = new Date().getHours();
    if (hour < 5) return "Late Night";
    if (hour < 12) return "Morning";
    if (hour < 17) return "Afternoon";
    if (hour < 21) return "Evening";
    return "Night";
  }
}

export const consciousness = new ConsciousnessService();
