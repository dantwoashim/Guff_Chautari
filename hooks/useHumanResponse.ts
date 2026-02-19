
/**
 * @file hooks/useHumanResponse.ts
 * @description React hook for orchestrating human-like response delivery
 * 
 * Takes an AI response and delivers it as chunked messages
 * with realistic typing indicators and delays.
 */

import { useState, useCallback, useRef } from 'react';
import {
    createHumanResponsePlan,
    streamHumanResponse,
    HumanResponsePlan,
    HumanMessage
} from '../services/humanResponseService';
import { Message } from '../types';
import { v4 as uuidv4 } from 'uuid';

// =====================================================
// TYPES
// =====================================================

interface UseHumanResponseOptions {
    onTypingChange?: (isTyping: boolean, phase: string) => void;
    onChunkDelivered?: (chunk: HumanMessage, index: number, total: number) => void;
    onComplete?: (allMessages: Message[]) => void;
    personaVibe?: 'formal' | 'casual' | 'chaotic';
    mood?: 'excited' | 'normal' | 'tired' | 'upset';
    enableChunking?: boolean;
}

interface HumanResponseState {
    isDelivering: boolean;
    currentChunkIndex: number;
    totalChunks: number;
    deliveredMessages: Message[];
}

// =====================================================
// HOOK
// =====================================================

export function useHumanResponse(options: UseHumanResponseOptions = {}) {
    const {
        onTypingChange,
        onChunkDelivered,
        onComplete,
        personaVibe = 'casual',
        mood = 'normal',
        enableChunking = true
    } = options;

    const [state, setState] = useState<HumanResponseState>({
        isDelivering: false,
        currentChunkIndex: 0,
        totalChunks: 0,
        deliveredMessages: []
    });

    const abortRef = useRef(false);

    /**
     * Deliver an AI response with human-like chunking and timing
     */
    const deliverResponse = useCallback(async (
        aiResponse: string,
        userMessageLength: number,
        baseMessageId: string
    ): Promise<Message[]> => {
        // Reset abort flag
        abortRef.current = false;

        // If chunking disabled, return single message immediately
        if (!enableChunking) {
            const singleMessage: Message = {
                id: baseMessageId,
                role: 'model',
                text: aiResponse,
                timestamp: Date.now()
            };
            onComplete?.([singleMessage]);
            return [singleMessage];
        }

        // Create human response plan
        // Pass defaults for history-dependent parameters since this hook
        // is often used in isolated contexts
        const plan = createHumanResponsePlan(
            aiResponse, 
            userMessageLength, 
            [], // recent messages
            10, // default total count
            Date.now(), // default start time
            {
                personaVibe,
                mood,
                isLongConversation: false,
                enableInterruptions: true,
                enableSelfCorrections: true
            }
        );

        setState({
            isDelivering: true,
            currentChunkIndex: 0,
            totalChunks: plan.messages.length,
            deliveredMessages: []
        });

        const deliveredMessages: Message[] = [];

        // Stream messages with timing
        for await (const humanMsg of streamHumanResponse(plan, onTypingChange)) {
            if (abortRef.current) break;

            // Convert to Message type
            const message: Message = {
                id: plan.messages.length === 1 ? baseMessageId : uuidv4(),
                role: 'model',
                text: humanMsg.text,
                timestamp: Date.now(), // Fixed: HumanMessage doesn't have sentAt, use current time
                isChunked: humanMsg.isChunked,
                chunkIndex: humanMsg.chunkIndex,
                totalChunks: humanMsg.totalChunks
            };

            deliveredMessages.push(message);

            setState(prev => ({
                ...prev,
                currentChunkIndex: humanMsg.chunkIndex + 1,
                deliveredMessages: [...prev.deliveredMessages, message]
            }));

            onChunkDelivered?.(humanMsg, humanMsg.chunkIndex, humanMsg.totalChunks);
        }

        setState(prev => ({
            ...prev,
            isDelivering: false
        }));

        onComplete?.(deliveredMessages);
        return deliveredMessages;

    }, [enableChunking, personaVibe, mood, onTypingChange, onChunkDelivered, onComplete]);

    /**
     * Abort current delivery
     */
    const abort = useCallback(() => {
        abortRef.current = true;
        setState(prev => ({ ...prev, isDelivering: false }));
    }, []);

    /**
     * Deliver a response immediately without chunking (for regeneration, etc.)
     */
    const deliverImmediate = useCallback((
        text: string,
        messageId: string
    ): Message => {
        const message: Message = {
            id: messageId,
            role: 'model',
            text,
            timestamp: Date.now()
        };
        onComplete?.([message]);
        return message;
    }, [onComplete]);

    return {
        // State
        isDelivering: state.isDelivering,
        currentChunkIndex: state.currentChunkIndex,
        totalChunks: state.totalChunks,
        deliveredMessages: state.deliveredMessages,

        // Actions
        deliverResponse,
        deliverImmediate,
        abort
    };
}

export type { HumanResponseState, UseHumanResponseOptions };
