
import React, { useRef, useEffect, useState } from 'react';
import { Message, Attachment } from '../../types';
import MessageBubble from '../MessageBubble';
import MessageInput from './MessageInput';
import ChatHeader from './ChatHeader';
import EmptyMessages from './EmptyMessages';
import { X, Mic } from '../Icons';
import { messageRepository } from '../../src/data';

interface ChatAreaProps {
    messages: Message[];
    currentPersona: any;
    inputText: string;
    setInputText: (text: string) => void;
    onSendMessage: (text: string, replyToId?: string) => void;
    onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
    isStreaming: boolean;
    onOpenVideoCall: () => void;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    attachments: Attachment[];
    setAttachments?: React.Dispatch<React.SetStateAction<Attachment[]>>;
    onBack?: () => void;
    onCancelReply?: () => void;
    onTypingStart?: () => void;
    setMessages?: React.Dispatch<React.SetStateAction<Message[]>>;
    currentSessionId?: string;
    isDarkMode?: boolean;
    sendVoiceMessage?: (blob: Blob, duration: number) => void;
    onRegenerate?: (id: string) => void;
    onEdit?: (id: string, text: string) => void;
    // Features
    toggleChatList?: () => void;
    isChatListOpen?: boolean;
    toggleFullscreen?: () => void;
    isFullscreen?: boolean;
    onNewChatWithPersona?: () => void;
    onBranch?: (msgId: string) => void;
    onShowHistory?: () => void; // NEW: Show past chats with this persona
}

const ChatArea: React.FC<ChatAreaProps> = (props) => {
    const {
        messages,
        currentPersona,
        onSendMessage,
        messagesEndRef,
        isStreaming,
        onOpenVideoCall,
        onBack,
        onTypingStart,
        onRegenerate,
        onEdit
    } = props;

    const [replyingTo, setReplyingTo] = useState<Message | null>(null);

    // --- State Management Helpers with Supabase Sync ---

    const updateMessageState = (msgId: string, updater: (m: Message) => Message) => {
        if (props.setMessages) {
            let updatedMessage: Message | null = null;
            props.setMessages(prev => {
                return prev.map(m => {
                    if (m.id !== msgId) return m;
                    updatedMessage = updater(m);
                    return updatedMessage;
                });
            });

            if (props.currentSessionId && updatedMessage) {
                void messageRepository
                    .upsertMessage(props.currentSessionId, updatedMessage, { touchUpdatedAt: false })
                    .catch((error) => {
                        console.error("Failed to sync message state:", error);
                    });
            }
        }
    };

    const handleReply = (message: Message) => {
        setReplyingTo(message);
    };

    const handleReaction = (msgId: string, emoji: string) => {
        updateMessageState(msgId, (m) => {
            const existing = m.reactions?.find(r => r.emoji === emoji);
            let newReactions = m.reactions || [];

            if (existing) {
                // Toggle logic
                if (existing.userReacted) {
                    // Remove if already reacted by user
                    newReactions = newReactions.map(r => r.emoji === emoji ? { ...r, count: r.count - 1, userReacted: false } : r).filter(r => r.count > 0);
                } else {
                    // Add if reacted by others but not user
                    newReactions = newReactions.map(r => r.emoji === emoji ? { ...r, count: r.count + 1, userReacted: true } : r);
                }
            } else {
                // New reaction
                newReactions = [...newReactions, { emoji, count: 1, userReacted: true }];
            }
            return { ...m, reactions: newReactions };
        });
    };

    const handlePin = (msgId: string) => updateMessageState(msgId, m => ({ ...m, isPinned: !m.isPinned }));
    const handleStar = (msgId: string) => updateMessageState(msgId, m => ({ ...m, isStarred: !m.isStarred }));

    const handleDelete = (msgId: string) => {
        if (props.setMessages) {
            let removed = false;
            props.setMessages(prev => {
                const filtered = prev.filter(m => m.id !== msgId);
                removed = filtered.length !== prev.length;
                return filtered;
            });

            if (removed && props.currentSessionId) {
                void messageRepository
                    .removeMessage(props.currentSessionId, msgId, { touchUpdatedAt: false })
                    .catch((error) => {
                        console.error("Failed to sync deleted message:", error);
                    });
            }
        }
    };

    // --- Render ---

    if (!currentPersona) {
        return <EmptyMessages persona={{ name: 'Welcome', id: '0' } as any} />;
    }

    // Determine persona name safely
    const personaName = currentPersona.name || currentPersona.core?.name || 'Ashim';

    return (
        <div className="flex flex-col h-full bg-[#0b141a] relative">
            <ChatHeader
                persona={currentPersona}
                isTyping={isStreaming}
                onOpenVideoCall={onOpenVideoCall}
                onBack={onBack}
                toggleChatList={props.toggleChatList}
                isChatListOpen={props.isChatListOpen}
                toggleFullscreen={props.toggleFullscreen}
                isFullscreen={props.isFullscreen}
                onNewChat={props.onNewChatWithPersona}
                onShowHistory={props.onShowHistory}
            />

            {/* Chat Background & Messages */}
            <div className="flex-1 overflow-y-auto wa-chat-bg wa-scroll relative flex flex-col">
                <div className="flex-1" /> {/* Spacer to push messages down */}
                <div className="flex flex-col pt-4 pb-2">
                    {messages.map((msg, idx) => {
                        const prevMsg = messages[idx - 1];
                        const replyTarget = msg.replyToId ? messages.find(m => m.id === msg.replyToId) : undefined;

                        return (
                            <MessageBubble
                                key={msg.id}
                                message={msg}
                                previousMessage={prevMsg}
                                replyingToMessage={replyTarget}
                                isDarkMode={props.isDarkMode ?? true}
                                onReply={handleReply}
                                onReaction={handleReaction}
                                onPin={handlePin}
                                onStar={handleStar}
                                onDelete={handleDelete}
                                onRegenerate={onRegenerate}
                                onEdit={onEdit}
                                onForward={(m) => props.setInputText?.(m.text || '')}
                                onBranch={props.onBranch} // Pass branching handler
                                personaName={personaName}
                            />
                        );
                    })}

                    {isStreaming && (
                        <div className="flex justify-start mb-1 px-[9%]">
                            <div className="wa-bubble wa-bubble-in px-4 py-3">
                                <div className="flex gap-1 h-2 items-center">
                                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Reply Preview Bar */}
            {replyingTo && (
                <div className="bg-[#202c33] px-4 py-2 border-l-4 border-[#00a884] flex justify-between items-center animate-slide-up z-10 mx-2 rounded-t-lg mb-[-5px]">
                    <div className="flex flex-col overflow-hidden">
                        <span className="text-[#00a884] text-xs font-bold">
                            {replyingTo.role === 'user' ? 'You' : personaName}
                        </span>
                        <span className="text-[#8696a0] text-xs truncate max-w-[80vw]">
                            {replyingTo.attachments?.some(a => a.type === 'audio') ? (
                                <span className="flex items-center gap-1"><Mic size={10} /> Voice message</span>
                            ) : (
                                replyingTo.text || '[Media]'
                            )}
                        </span>
                    </div>
                    <button
                        onClick={() => setReplyingTo(null)}
                        className="p-1 text-[#8696a0] hover:text-[#e9edef] bg-[#2a3942] rounded-full"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* Attachment Preview - Show uploaded files before sending */}
            {props.attachments && props.attachments.length > 0 && (
                <div className="bg-[#202c33] px-4 py-3 flex gap-2 overflow-x-auto z-10 border-t border-[#2a3942]">
                    {props.attachments.map((att, idx) => (
                        <div key={att.id || idx} className="relative shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-[#2a3942] group">
                            {(() => {
                                const previewUrl = att.url || (att.data ? `data:${att.mimeType};base64,${att.data}` : '');
                                if (!previewUrl) {
                                    return (
                                        <div className="flex h-full w-full items-center justify-center text-[10px] text-[#9eb0ba]">
                                            No preview
                                        </div>
                                    );
                                }
                                return att.type === 'video' || att.mimeType?.startsWith('video/') ? (
                                    <video
                                        src={previewUrl}
                                        className="w-full h-full object-cover"
                                        muted
                                    />
                                ) : (
                                    <img
                                        src={previewUrl}
                                        alt="attachment preview"
                                        className="w-full h-full object-cover"
                                    />
                                );
                            })()}
                            {/* Remove button */}
                            <button
                                onClick={() => {
                                    if (props.setAttachments) {
                                        props.setAttachments(prev => prev.filter((_, i) => i !== idx));
                                    }
                                }}
                                className="absolute top-1 right-1 bg-black/60 hover:bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <X size={12} />
                            </button>
                            {/* Type indicator */}
                            {(att.type === 'video' || att.mimeType?.startsWith('video/')) && (
                                <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded">
                                    VIDEO
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <MessageInput
                onSend={(text) => {
                    onSendMessage(text, replyingTo?.id);
                    setReplyingTo(null);
                }}
                onFileSelect={props.onFileSelect}
                fileInputRef={props.fileInputRef}
                onTypingStart={onTypingStart}
                onVoiceComplete={props.sendVoiceMessage}
                hasAttachments={props.attachments && props.attachments.length > 0}
            />
        </div>
    );
};

export default ChatArea;
