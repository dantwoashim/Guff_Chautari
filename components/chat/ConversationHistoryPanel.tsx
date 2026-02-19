
import React, { useState, useEffect } from 'react';
import { X, MessageSquare, Calendar, ChevronRight } from '../Icons';
import { Conversation, Persona } from '../../types';
import { conversationRepository } from '../../src/data/repositories';

interface ConversationHistoryPanelProps {
    isOpen: boolean;
    onClose: () => void;
    personaId: string;
    currentConversationId: string | null;
    onSelectConversation: (conversationId: string) => void;
    onStartNewChat: () => void;
    persona: Persona | null;
    userId: string;
}

interface GroupedConversations {
    label: string;
    conversations: Conversation[];
}

const ConversationHistoryPanel: React.FC<ConversationHistoryPanelProps> = ({
    isOpen,
    onClose,
    personaId,
    currentConversationId,
    onSelectConversation,
    onStartNewChat,
    persona,
    userId
}) => {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Fetch all conversations with this persona
    useEffect(() => {
        if (!isOpen || !personaId || !userId) return;

        const fetchConversations = async () => {
            setIsLoading(true);
            try {
                const data = await conversationRepository.listByUserAndPersona(userId, personaId);
                setConversations(data);
            } catch (error) {
                console.error('Failed to load conversation history:', error);
                setConversations([]);
            }
            setIsLoading(false);
        };

        fetchConversations();
    }, [isOpen, personaId, userId]);

    // Group conversations by date
    const groupedConversations: GroupedConversations[] = React.useMemo(() => {
        if (conversations.length === 0) return [];

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

        const groups: { [key: string]: Conversation[] } = {
            'Today': [],
            'Yesterday': [],
            'This Week': [],
            'Earlier': []
        };

        conversations.forEach(conv => {
            const convDate = new Date(conv.last_message_at || (conv as any).created_at || 0);

            if (convDate >= today) {
                groups['Today'].push(conv);
            } else if (convDate >= yesterday) {
                groups['Yesterday'].push(conv);
            } else if (convDate >= thisWeek) {
                groups['This Week'].push(conv);
            } else {
                groups['Earlier'].push(conv);
            }
        });

        return Object.entries(groups)
            .filter(([_, convs]) => convs.length > 0)
            .map(([label, convs]) => ({ label, conversations: convs }));
    }, [conversations]);

    const formatTime = (dateStr: string | null) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="relative w-full max-w-sm bg-[#111b21] h-full flex flex-col animate-slide-in-right shadow-2xl">
                {/* Header */}
                <div className="h-[59px] px-4 flex items-center justify-between bg-[#202c33] shrink-0 border-b border-[#313d45]">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="p-2 text-[#aebac1] hover:text-white rounded-full hover:bg-[#374248] transition-colors"
                            title="Close history panel"
                        >
                            <X size={20} />
                        </button>
                        <div>
                            <h2 className="text-[#e9edef] font-medium">Chat History</h2>
                            <p className="text-xs text-[#8696a0]">
                                {persona?.name || 'Persona'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Start New Chat Button */}
                <button
                    onClick={() => {
                        onStartNewChat();
                        onClose();
                    }}
                    className="m-3 py-3 px-4 bg-[#00a884] hover:bg-[#008f72] text-white rounded-lg flex items-center justify-center gap-2 font-medium transition-colors"
                >
                    <MessageSquare size={18} />
                    Start New Chat
                </button>

                {/* Conversation List */}
                <div className="flex-1 overflow-y-auto">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="animate-spin w-6 h-6 border-2 border-[#00a884] border-t-transparent rounded-full" />
                        </div>
                    ) : conversations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                            <Calendar size={48} className="text-[#3b4a54] mb-4" />
                            <p className="text-[#8696a0]">No chat history yet</p>
                            <p className="text-[#8696a0] text-sm mt-1">Start your first conversation!</p>
                        </div>
                    ) : (
                        groupedConversations.map(group => (
                            <div key={group.label}>
                                <div className="px-4 py-2 text-xs font-semibold text-[#00a884] uppercase tracking-wider bg-[#111b21] sticky top-0">
                                    {group.label}
                                </div>
                                {group.conversations.map(conv => (
                                    <button
                                        key={conv.id}
                                        onClick={() => {
                                            onSelectConversation(conv.id);
                                            onClose();
                                        }}
                                        className={`w-full px-4 py-3 flex items-center justify-between hover:bg-[#202c33] transition-colors border-b border-[#313d45]/30 ${conv.id === currentConversationId ? 'bg-[#2a3942]' : ''
                                            }`}
                                    >
                                        <div className="flex-1 min-w-0 text-left">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[#e9edef] text-sm">
                                                    {formatTime(conv.last_message_at)}
                                                </span>
                                                {conv.id === currentConversationId && (
                                                    <span className="px-1.5 py-0.5 text-[10px] bg-[#00a884] text-white rounded">
                                                        Current
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[#8696a0] text-sm truncate mt-0.5">
                                                {conv.last_message_text || 'No messages yet'}
                                            </p>
                                        </div>
                                        <ChevronRight size={16} className="text-[#8696a0] shrink-0 ml-2" />
                                    </button>
                                ))}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default ConversationHistoryPanel;
