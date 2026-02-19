
import { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { Message, Memory, MemoryType } from '../types';
import { createMemory } from '../services/memoryService';
import { modelManager } from '../services/modelManager';
import { resolveGeminiApiKey } from '../lib/env';

// Safe lazy initialization
const getAiClient = () => {
    const apiKey = resolveGeminiApiKey();
    return new GoogleGenAI({ apiKey: apiKey || '' });
};

interface ExtractedMemoryItem {
  content: string;
  type: MemoryType;
  emotionalValence: number;
  confidence: number;
}

interface UseMemoryExtractionResult {
  isExtracting: boolean;
  lastExtracted: Memory[];
  extractFromMessages: (messages: Message[]) => Promise<Memory[]>;
  manualExtract: (content: string, type: MemoryType) => Promise<Memory | null>;
}

export const useMemoryExtraction = (
    userId: string, 
    sessionId: string,
    messagesWatch?: Message[] 
): UseMemoryExtractionResult => {
  const [isExtracting, setIsExtracting] = useState(false);
  const [lastExtracted, setLastExtracted] = useState<Memory[]>([]);
  
  const lastProcessedMessageIdRef = useRef<string | null>(null);

  const extractFromMessages = useCallback(async (messages: Message[]): Promise<Memory[]> => {
    if (messages.length === 0) return [];
    
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== 'model') return [];

    if (lastProcessedMessageIdRef.current === lastMsg.id) return [];

    setIsExtracting(true);
    lastProcessedMessageIdRef.current = lastMsg.id;

    const ai = getAiClient();

    try {
        const recentContext = messages.slice(-6).map(m => 
            `${m.role.toUpperCase()}: ${m.text}`
        ).join('\n\n');

        const prompt = `
        You are the Memory Cortex of an advanced AI. 
        Analyze the following conversation snippet. Identify ANY new information that should be committed to long-term memory.
        
        CATEGORIES:
        - EPISODIC: Specific events, stories, or experiences the user shared (e.g., "Went to Japan in 2019").
        - SEMANTIC: Facts about the user, their beliefs, job, or identity (e.g., "User is a python developer").
        - PROCEDURAL: User preferences on HOW you should behave (e.g., "User likes short answers").
        - EMOTIONAL: Significant emotional states or triggers (e.g., "User feels anxious about deadlines").

        RULES:
        1. Ignore trivial small talk (greetings, acknowledgments).
        2. Be concise. Store facts, not transcripts.
        3. 'emotionalValence' should be between -1.0 (Negative) and 1.0 (Positive).
        4. If nothing worth remembering happened, return an empty array [].

        CONVERSATION:
        ${recentContext}
        `;

        const response = await modelManager.runWithFallback('complex', async (model) => {
            return await ai.models.generateContent({
                model: model,
                contents: [{ parts: [{ text: prompt }] }],
                config: { 
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                content: { type: Type.STRING },
                                type: { type: Type.STRING, enum: ['episodic', 'semantic', 'procedural', 'emotional'] },
                                emotionalValence: { type: Type.NUMBER },
                                confidence: { type: Type.NUMBER }
                            },
                            required: ['content', 'type', 'emotionalValence', 'confidence']
                        }
                    }
                }
            });
        });

        const rawJson = response.text;
        if (!rawJson) return [];

        const extractedItems: ExtractedMemoryItem[] = JSON.parse(rawJson);
        const newMemories: Memory[] = [];

        for (const item of extractedItems) {
            if (item.confidence > 0.6) {
                const memory = await createMemory(
                    userId,
                    item.content,
                    item.type,
                    { 
                        sessionId, 
                        sourceMessageId: lastMsg.id, 
                        confidence: item.confidence 
                    },
                    item.emotionalValence
                );
                
                if (memory) {
                    newMemories.push(memory);
                }
            }
        }

        if (newMemories.length > 0) {
            setLastExtracted(newMemories);
        }

        return newMemories;

    } catch (error) {
        console.error("Memory extraction error:", error);
        return [];
    } finally {
        setIsExtracting(false);
    }
  }, [userId, sessionId]);

  const manualExtract = useCallback(async (content: string, type: MemoryType): Promise<Memory | null> => {
      setIsExtracting(true);
      try {
          const memory = await createMemory(userId, content, type, { sessionId, source: 'manual' });
          if (memory) {
              setLastExtracted(prev => [...prev, memory]);
          }
          return memory;
      } catch (e) {
          console.error("Manual extraction failed", e);
          return null;
      } finally {
          setIsExtracting(false);
      }
  }, [userId, sessionId]);

  useEffect(() => {
    if (messagesWatch && messagesWatch.length > 0) {
        const lastMsg = messagesWatch[messagesWatch.length - 1];
        if (lastMsg.role === 'model' && lastMsg.text && !lastMsg.isError) {
          const timer = setTimeout(() => {
              extractFromMessages(messagesWatch);
          }, 3000); 
          return () => clearTimeout(timer);
        }
    }
  }, [messagesWatch, extractFromMessages]);

  return {
    isExtracting,
    lastExtracted,
    extractFromMessages,
    manualExtract
  };
};
