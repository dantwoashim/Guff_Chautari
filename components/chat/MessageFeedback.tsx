/**
 * @file components/chat/MessageFeedback.tsx
 * @description User feedback component for AI responses
 * Pattern from langfuse skill: "Track user feedback for response quality"
 * 
 * Allows users to rate responses with 👍/👎 and optional comments
 * Data can be used for:
 * - Response quality monitoring
 * - Prompt improvement
 * - Model performance tracking
 */

import React, { useState } from 'react';

interface MessageFeedbackProps {
    messageId: string;
    personaId: string;
    onFeedback?: (feedback: FeedbackData) => void;
    compact?: boolean;
}

export interface FeedbackData {
    messageId: string;
    personaId: string;
    rating: 'positive' | 'negative';
    reason?: string;
    timestamp: number;
}

// Feedback reasons for negative ratings
const NEGATIVE_REASONS = [
    'Off character',
    'Too robotic',
    'Didn\'t understand',
    'Too long/short',
    'Inappropriate',
    'Other'
];

export const MessageFeedback: React.FC<MessageFeedbackProps> = ({
    messageId,
    personaId,
    onFeedback,
    compact = true
}) => {
    const [rating, setRating] = useState<'positive' | 'negative' | null>(null);
    const [showReasons, setShowReasons] = useState(false);
    const [selectedReason, setSelectedReason] = useState<string | null>(null);
    const [submitted, setSubmitted] = useState(false);

    const handleRating = async (newRating: 'positive' | 'negative') => {
        setRating(newRating);

        if (newRating === 'positive') {
            // Positive feedback - submit immediately
            await submitFeedback(newRating);
        } else {
            // Negative feedback - show reasons
            setShowReasons(true);
        }
    };

    const submitFeedback = async (finalRating: 'positive' | 'negative', reason?: string) => {
        const feedback: FeedbackData = {
            messageId,
            personaId,
            rating: finalRating,
            reason,
            timestamp: Date.now()
        };

        // Store locally
        try {
            const stored = JSON.parse(localStorage.getItem('message_feedback') || '[]');
            stored.push(feedback);
            // Keep last 100 feedback items
            if (stored.length > 100) stored.shift();
            localStorage.setItem('message_feedback', JSON.stringify(stored));
        } catch (e) {
            console.error('[Feedback] Storage error:', e);
        }

        // Callback for parent (can send to analytics/Langfuse)
        if (onFeedback) {
            onFeedback(feedback);
        }

        setSubmitted(true);
        setShowReasons(false);
    };

    const handleReasonSelect = async (reason: string) => {
        setSelectedReason(reason);
        await submitFeedback('negative', reason);
    };

    if (submitted) {
        return (
            <div className="text-xs text-gray-500 opacity-60 flex items-center gap-1">
                <span>✓</span>
                <span>Thanks for feedback</span>
            </div>
        );
    }

    if (compact) {
        return (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {!showReasons ? (
                    <>
                        <button
                            onClick={() => handleRating('positive')}
                            className={`p-1 rounded hover:bg-white/10 transition-colors ${rating === 'positive' ? 'text-green-400' : 'text-gray-400'}`}
                            title="Good response"
                        >
                            👍
                        </button>
                        <button
                            onClick={() => handleRating('negative')}
                            className={`p-1 rounded hover:bg-white/10 transition-colors ${rating === 'negative' ? 'text-red-400' : 'text-gray-400'}`}
                            title="Bad response"
                        >
                            👎
                        </button>
                    </>
                ) : (
                    <div className="flex flex-wrap gap-1 text-xs">
                        {NEGATIVE_REASONS.slice(0, 3).map(reason => (
                            <button
                                key={reason}
                                onClick={() => handleReasonSelect(reason)}
                                className="px-2 py-0.5 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors"
                            >
                                {reason}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // Full mode with all reasons
    return (
        <div className="p-2 bg-black/20 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-gray-400">Was this response helpful?</span>
                <button
                    onClick={() => handleRating('positive')}
                    className={`p-1.5 rounded-full hover:bg-green-500/20 transition-colors ${rating === 'positive' ? 'bg-green-500/30 text-green-400' : 'text-gray-400'}`}
                >
                    👍
                </button>
                <button
                    onClick={() => handleRating('negative')}
                    className={`p-1.5 rounded-full hover:bg-red-500/20 transition-colors ${rating === 'negative' ? 'bg-red-500/30 text-red-400' : 'text-gray-400'}`}
                >
                    👎
                </button>
            </div>

            {showReasons && (
                <div className="mt-2">
                    <p className="text-xs text-gray-400 mb-2">What went wrong?</p>
                    <div className="flex flex-wrap gap-2">
                        {NEGATIVE_REASONS.map(reason => (
                            <button
                                key={reason}
                                onClick={() => handleReasonSelect(reason)}
                                className={`px-3 py-1 text-xs rounded-full transition-colors ${selectedReason === reason
                                        ? 'bg-red-500 text-white'
                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                    }`}
                            >
                                {reason}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

/**
 * Get aggregated feedback stats
 */
export function getFeedbackStats(): {
    total: number;
    positive: number;
    negative: number;
    topReasons: { reason: string; count: number }[];
} {
    try {
        const stored: FeedbackData[] = JSON.parse(localStorage.getItem('message_feedback') || '[]');

        const positive = stored.filter(f => f.rating === 'positive').length;
        const negative = stored.filter(f => f.rating === 'negative').length;

        // Count reasons
        const reasonCounts: Record<string, number> = {};
        stored.filter(f => f.reason).forEach(f => {
            reasonCounts[f.reason!] = (reasonCounts[f.reason!] || 0) + 1;
        });

        const topReasons = Object.entries(reasonCounts)
            .map(([reason, count]) => ({ reason, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        return {
            total: stored.length,
            positive,
            negative,
            topReasons
        };
    } catch {
        return { total: 0, positive: 0, negative: 0, topReasons: [] };
    }
}

export default MessageFeedback;
