
import { useEffect, useRef } from 'react';
import {
    initializePersonaState,
    generateSpontaneousMessage,
    generateFirstMessage,
    generateShortTermFollowUp,
    shouldTriggerShortTermFollowUp,
    getMessageDelay,
    PersonaState
} from '../services/spontaneousMessaging';
import { supabase } from '../lib/supabase';
import { getTimeContext } from '../services/timeContextService';

export const useSpontaneousMessaging = (
    userId: string | undefined,
    currentSessionId: string,
    isActive: boolean,
    personaName: string = 'Ashim'
) => {
    const stateRef = useRef<PersonaState | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastCheckRef = useRef<number>(0);
    const isGeneratingRef = useRef<boolean>(false);

    useEffect(() => {
        // Reset state when session changes to ensure fresh context
        stateRef.current = null;
        lastCheckRef.current = 0;
        if (timerRef.current) clearTimeout(timerRef.current);
    }, [currentSessionId]);

    useEffect(() => {
        if (!userId || !isActive || !currentSessionId) return;

        const checkRoutine = async () => {
            const now = Date.now();
            // Prevent rapid re-checks (min 30s)
            if (now - lastCheckRef.current < 30000 || isGeneratingRef.current) return;

            lastCheckRef.current = now;
            isGeneratingRef.current = true;

            try {
                // 1. FETCH ACTUAL DB STATE (Single Source of Truth)
                const { data: chat, error } = await supabase
                    .from('chats')
                    .select('messages, created_at')
                    .eq('id', currentSessionId)
                    .maybeSingle(); // Changed from single() to avoid PGRST116

                if (error) throw error;
                if (!chat) return; // Silent exit if chat doesn't exist yet

                const messages = chat.messages || [];
                const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

                // =================================================
                // SCENARIO A: COLD START (New Chat)
                // =================================================
                if (!lastMessage) {
                    const createdTime = new Date(chat.created_at).getTime();
                    // If chat is < 10 mins old and empty, send greeting
                    if (now - createdTime < 10 * 60 * 1000) {
                        const timeCtx = getTimeContext();
                        const greeting = generateFirstMessage(personaName, { period: timeCtx.period, hour: timeCtx.hour });
                        console.log(`[Spontaneous] Triggering First Message`);
                        await sendMessage(currentSessionId, greeting.content.join('\n'), 'greeting', messages);
                    }
                    isGeneratingRef.current = false;
                    return;
                }

                // =================================================
                // SCENARIO B: SMART RE-ENGAGEMENT
                // =================================================
                const lastTime = new Date(lastMessage.timestamp).getTime();
                const minutesIdle = (now - lastTime) / (1000 * 60);

                // Check for spam risk (last 2 messages are AI)
                const recentAiCount = messages.slice(-2).filter((m: any) => m.role === 'model').length;
                const spamRisk = recentAiCount >= 2;

                let messageToSend = null;
                let type = '';

                // TIER 1: SHORT TERM (Double Texting) - 2 to 25 minutes
                // Condition: AI sent last, User hasn't replied, NO spam risk
                if (lastMessage.role === 'model' && !spamRisk && minutesIdle > 2 && minutesIdle < 25) {
                    if (shouldTriggerShortTermFollowUp(lastMessage.text)) {
                        // Increased probability to 50% for responsiveness
                        if (Math.random() < 0.50) {
                            if (!stateRef.current) {
                                stateRef.current = initializePersonaState(currentSessionId, lastTime);
                            }
                            // Pass recent messages for context-aware follow-up
                            const recentMsgs = messages.slice(-5).map((m: any) => ({ role: m.role, text: m.text }));
                            const followUp = generateShortTermFollowUp(stateRef.current, recentMsgs);
                            messageToSend = followUp;
                            type = 'double_text';
                        }
                    }
                }

                // TIER 2: LONG TERM (Re-engagement) - 6+ hours
                // Condition: User sent last OR AI sent last (if long silence)
                else if (minutesIdle > 360) { // 6 hours
                    // Initialize or update persona state with REAL last interaction time
                    if (!stateRef.current) {
                        stateRef.current = initializePersonaState(currentSessionId, lastTime);
                    } else {
                        stateRef.current.lastChatTimestamp = new Date(lastTime);
                    }

                    const currentHour = new Date().getHours();
                    // Pass recent messages for context-aware re-engagement
                    const recentMsgs = messages.slice(-5).map((m: any) => ({ role: m.role, text: m.text }));
                    const spontaneous = generateSpontaneousMessage(stateRef.current, currentHour, recentMsgs);

                    if (spontaneous) {
                        messageToSend = spontaneous;
                        type = spontaneous.type;
                    }
                }

                // EXECUTE SEND
                if (messageToSend) {
                    const delay = getMessageDelay(messageToSend); // Natural typing delay
                    console.log(`[Spontaneous] Scheduling ${type} in ${delay}ms`);

                    if (timerRef.current) clearTimeout(timerRef.current);

                    timerRef.current = setTimeout(async () => {
                        // Double check state before sending in case user replied during delay
                        const { data: freshChat } = await supabase.from('chats').select('messages').eq('id', currentSessionId).maybeSingle();

                        if (!freshChat) return;

                        const freshLast = freshChat?.messages?.[freshChat.messages.length - 1];

                        // If the last message ID changed, it means someone (user or AI) sent a message. Abort.
                        if (freshLast && freshLast.id !== lastMessage.id) {
                            console.log("[Spontaneous] Aborted - state changed.");
                            return;
                        }

                        await sendMessage(currentSessionId, messageToSend.content.join('\n'), type, messages);
                    }, delay);
                }

            } catch (e) {
                console.error("[Spontaneous] Error:", e);
            } finally {
                isGeneratingRef.current = false;
            }
        };

        // Run immediately on mount, then interval
        checkRoutine();
        const interval = setInterval(checkRoutine, 60000); // Check every minute

        return () => {
            clearInterval(interval);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [userId, currentSessionId, isActive, personaName]);

    // Helper to send message to DB
    const sendMessage = async (sessionId: string, text: string, type: string, currentMessages: any[]) => {
        const newMsg = {
            id: `spont_${Date.now()}`,
            role: 'model',
            text: text,
            timestamp: Date.now(),
            isSpontaneous: true,
            generationLogs: [`Spontaneous: ${type}`]
        };

        const { error } = await supabase
            .from('chats')
            .update({
                messages: [...currentMessages, newMsg],
                updated_at: new Date().toISOString()
            })
            .eq('id', sessionId);

        if (!error) console.log(`[Spontaneous] Sent ${type} message.`);
    };
};
