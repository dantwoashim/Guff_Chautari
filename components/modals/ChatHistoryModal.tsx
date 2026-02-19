/**
 * @file components/modals/ChatHistoryModal.tsx
 * @description Modal to show past chat sessions with the current persona
 */

import React, { useEffect, useState } from 'react';
import { X, MessageSquare, Clock, Loader2 } from '../Icons';
import { messageRepository, type ChatHistoryEntry } from '../../src/data/repositories';

interface ChatHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    personaId: string;
    personaName: string;
    currentSessionId?: string;
    onSelectSession: (sessionId: string) => void;
}

const ChatHistoryModal: React.FC<ChatHistoryModalProps> = ({
    isOpen,
    onClose,
    personaId,
    personaName,
    currentSessionId,
    onSelectSession
}) => {
    const [sessions, setSessions] = useState<ChatHistoryEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (isOpen && personaId) {
            loadHistory();
        }
    }, [isOpen, personaId]);

    const loadHistory = async () => {
        setIsLoading(true);
        try {
            const data = await messageRepository.listChatsByPersona(personaId, 50);
            setSessions(data);
        } catch (e) {
            console.error('Error loading history:', e);
            setSessions([]);
        } finally {
            setIsLoading(false);
        }
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        return date.toLocaleDateString();
    };

    const getPreview = (messages: ChatHistoryEntry['messages']) => {
        if (!messages || messages.length === 0) return 'No messages yet';
        const lastMsg = messages[messages.length - 1];
        const text = lastMsg?.text || '';
        return text.length > 60 ? text.substring(0, 60) + '...' : text;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#111b21] rounded-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col shadow-2xl border border-[#313d45] animate-scale-in">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-[#313d45]">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#00a884]/20 flex items-center justify-center">
                            <Clock size={20} className="text-[#00a884]" />
                        </div>
                        <div>
                            <h2 className="text-[#e9edef] font-semibold">Chat History</h2>
                            <p className="text-[#8696a0] text-sm">with {personaName}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-[#2a3942] text-[#8696a0] hover:text-[#e9edef] transition-colors"
                        title="Close"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-2">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="animate-spin text-[#00a884]" size={32} />
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                            <div className="w-16 h-16 rounded-full bg-[#202c33] flex items-center justify-center mb-4">
                                <MessageSquare size={28} className="text-[#8696a0]" />
                            </div>
                            <p className="text-[#e9edef] font-medium mb-1">No chat history</p>
                            <p className="text-[#8696a0] text-sm">Start chatting with {personaName} to build history</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {sessions.map((session) => (
                                <button
                                    key={session.id}
                                    onClick={() => {
                                        onSelectSession(session.id);
                                        onClose();
                                    }}
                                    className={`w-full p-3 rounded-xl text-left transition-all ${session.id === currentSessionId
                                            ? 'bg-[#00a884]/20 border border-[#00a884]/30'
                                            : 'hover:bg-[#202c33] border border-transparent'
                                        }`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${session.id === currentSessionId ? 'bg-[#00a884]' : 'bg-[#2a3942]'
                                            }`}>
                                            <MessageSquare size={18} className={session.id === currentSessionId ? 'text-white' : 'text-[#8696a0]'} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className={`font-medium truncate ${session.id === currentSessionId ? 'text-[#00a884]' : 'text-[#e9edef]'
                                                    }`}>
                                                    {session.title || `Chat ${formatDate(session.created_at)}`}
                                                </span>
                                                <span className="text-[#8696a0] text-xs shrink-0">
                                                    {formatDate(session.updated_at)}
                                                </span>
                                            </div>
                                            <p className="text-[#8696a0] text-sm truncate mt-0.5">
                                                {getPreview(session.messages)}
                                            </p>
                                            <p className="text-[#8696a0] text-xs mt-1">
                                                {session.messages?.length || 0} messages
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-[#313d45]">
                    <p className="text-[#8696a0] text-xs text-center">
                        Showing up to 50 most recent chats
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ChatHistoryModal;
