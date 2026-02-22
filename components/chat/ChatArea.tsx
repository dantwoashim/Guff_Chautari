import React, { useState } from 'react';
import { Message, Attachment } from '../../types';
import ChatHeader from './ChatHeader';
import MessageBubble from '../MessageBubble';
import MessageInput from './MessageInput';
import EmptyMessages from './EmptyMessages';
import { X } from '../Icons';
import { supabase } from '../../lib/supabase';

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
  toggleChatList?: () => void;
  isChatListOpen?: boolean;
  toggleFullscreen?: () => void;
  isFullscreen?: boolean;
  onNewChatWithPersona?: () => void;
  onBranch?: (msgId: string) => void;
  onShowHistory?: () => void;
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
    onEdit,
  } = props;

  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  const updateMessageState = (msgId: string, updater: (m: Message) => Message) => {
    if (!props.setMessages) {
      return;
    }

    props.setMessages((prev) => {
      const next = prev.map((message) => (message.id === msgId ? updater(message) : message));
      if (props.currentSessionId) {
        supabase
          .from('chats')
          .update({
            messages: next,
            updated_at: new Date().toISOString(),
          })
          .eq('id', props.currentSessionId)
          .then(({ error }) => {
            if (error) {
              console.error('Failed to sync message updates:', error.message);
            }
          });
      }
      return next;
    });
  };

  const handleDelete = (msgId: string) => {
    if (!props.setMessages) {
      return;
    }

    props.setMessages((prev) => {
      const next = prev.filter((message) => message.id !== msgId);
      if (props.currentSessionId) {
        supabase
          .from('chats')
          .update({ messages: next, updated_at: new Date().toISOString() })
          .eq('id', props.currentSessionId)
          .then();
      }
      return next;
    });
  };

  if (!currentPersona) {
    return <EmptyMessages persona={{ id: 'empty', name: 'Welcome', user_id: '', description: '', system_instruction: '' }} />;
  }

  const personaName = currentPersona.name || currentPersona.core?.name || 'Ashim';

  return (
    <div className="h-full flex flex-col relative">
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

      <div className="flex-1 overflow-y-auto scroll-premium px-4 md:px-6 py-4">
        {messages.length === 0 ? (
          <EmptyMessages
            persona={
              currentPersona as {
                id: string;
                user_id: string;
                name: string;
                description: string;
                system_instruction: string;
              }
            }
            onSendPrompt={(prompt) => onSendMessage(prompt)}
          />
        ) : (
          <div className="max-w-4xl mx-auto pb-3">
            {messages.map((message, index) => {
              const previous = messages[index - 1];
              const replyTarget = message.replyToId
                ? messages.find((candidate) => candidate.id === message.replyToId)
                : undefined;

              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  previousMessage={previous}
                  replyingToMessage={replyTarget}
                  isDarkMode={props.isDarkMode ?? true}
                  onReply={setReplyingTo}
                  onReaction={(msgId, emoji) => {
                    updateMessageState(msgId, (source) => {
                      const existing = source.reactions?.find((entry) => entry.emoji === emoji);
                      const reactions = source.reactions || [];
                      if (!existing) {
                        return {
                          ...source,
                          reactions: [...reactions, { emoji, count: 1, userReacted: true }],
                        };
                      }

                      if (existing.userReacted) {
                        return {
                          ...source,
                          reactions: reactions
                            .map((entry) =>
                              entry.emoji === emoji
                                ? { ...entry, count: Math.max(0, entry.count - 1), userReacted: false }
                                : entry,
                            )
                            .filter((entry) => entry.count > 0),
                        };
                      }

                      return {
                        ...source,
                        reactions: reactions.map((entry) =>
                          entry.emoji === emoji ? { ...entry, count: entry.count + 1, userReacted: true } : entry,
                        ),
                      };
                    });
                  }}
                  onPin={(msgId) => updateMessageState(msgId, (source) => ({ ...source, isPinned: !source.isPinned }))}
                  onStar={(msgId) => updateMessageState(msgId, (source) => ({ ...source, isStarred: !source.isStarred }))}
                  onDelete={handleDelete}
                  onRegenerate={onRegenerate}
                  onEdit={onEdit}
                  onForward={(target) => props.setInputText?.(target.text || '')}
                  onBranch={props.onBranch}
                  personaName={personaName}
                />
              );
            })}

            {isStreaming ? (
              <div className="mt-4 max-w-[280px] rounded-2xl border border-[color:var(--color-border)] bg-[color:rgba(12,31,49,0.9)] px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-text-soft)] animate-bounce [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-text-soft)] animate-bounce [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-text-soft)] animate-bounce" />
                </div>
              </div>
            ) : null}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {replyingTo ? (
        <div className="mx-4 md:mx-6 mb-2 premium-panel px-3 py-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wide text-[color:var(--color-accent)]">
              Replying to {replyingTo.role === 'user' ? 'You' : personaName}
            </div>
            <div className="text-xs text-[color:var(--color-text-muted)] truncate">
              {replyingTo.text || '[Attachment]'}
            </div>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="premium-button h-8 w-8 inline-flex items-center justify-center"
            aria-label="Cancel reply"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      {props.attachments?.length ? (
        <div className="mx-4 md:mx-6 mb-2 flex gap-2 overflow-x-auto scroll-premium">
          {props.attachments.map((attachment, index) => (
            <div
              key={attachment.id || `${attachment.type}-${index}`}
              className="relative h-20 w-20 rounded-xl overflow-hidden border border-[color:var(--color-border)] bg-[color:rgba(15,32,50,0.84)]"
            >
              {attachment.type === 'video' || attachment.mimeType?.startsWith('video/') ? (
                <video src={attachment.url} className="h-full w-full object-cover" muted />
              ) : (
                <img src={attachment.url} alt="attachment preview" className="h-full w-full object-cover" />
              )}
              <button
                onClick={() => props.setAttachments?.((prev) => prev.filter((_, idx) => idx !== index))}
                className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white text-[10px]"
                aria-label="Remove attachment"
              >
                <X size={11} className="mx-auto" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <MessageInput
        onSend={(text) => {
          onSendMessage(text, replyingTo?.id);
          setReplyingTo(null);
        }}
        onFileSelect={props.onFileSelect}
        fileInputRef={props.fileInputRef}
        onTypingStart={onTypingStart}
        onVoiceComplete={props.sendVoiceMessage}
        hasAttachments={Boolean(props.attachments?.length)}
      />
    </div>
  );
};

export default ChatArea;
