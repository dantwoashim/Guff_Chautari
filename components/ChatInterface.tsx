
import React, { useState, useRef, useEffect } from 'react';
import {
  Send, X, Sun, Moon, PanelLeft, Loader2, Paperclip,
  Maximize, Minimize, Sparkles, Video, RefreshCw, WifiOff,
  ArrowDown, Mic
} from './Icons';
import MessageBubble from './MessageBubble';
import ChatArea from './chat/ChatArea';
import { Message, Attachment, LivingPersona, Persona } from '../types';
import TypingStatus from './chat/TypingStatus';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import VoiceRecorder from './VoiceRecorder';
import { messageRepository } from '../src/data';

// Flag to toggle new UI (Matches App.tsx)
const USE_WHATSAPP_UI = true;

interface ChatInterfaceProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (v: boolean) => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  isDarkMode: boolean;
  setIsDarkMode: (v: boolean) => void;
  config: { livingPersona?: LivingPersona };
  isProcessingPersona: boolean;
  messages: Message[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  attachments: Attachment[];
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  isUploading: boolean;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  inputText: string;
  setInputText: (v: string) => void;
  sendMessage: (text: string, replyToId?: string) => void;
  sendVoiceMessage?: (blob: Blob, duration: number) => void;
  isStreaming: boolean;
  handleRegenerate: (id: string) => void;
  handleEdit: (id: string, text: string) => void;
  handlePaste?: (e: React.ClipboardEvent) => void;
  onOpenVideoCall: () => void;
  hasMoreMessages?: boolean;
  onLoadMore?: () => void;
  setMessages?: React.Dispatch<React.SetStateAction<Message[]>>;
  currentSessionId?: string;
  onBack?: () => void; // New prop for mobile back navigation
  // Features
  activePersona?: Persona;
  toggleChatList?: () => void;
  isChatListOpen?: boolean;
  onNewChatWithPersona?: () => void;
  onBranch?: (msgId: string) => void;
  onShowHistory?: () => void; // NEW: Show past chats with this persona
}

const ChatInterface: React.FC<ChatInterfaceProps> = (props) => {
  const isOnline = useOnlineStatus();
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Smart Auto-scroll: Only scroll if user is near bottom (within 300px)
  // This prevents interrupting reading during streaming responses
  useEffect(() => {
    if (!props.messagesEndRef.current || !scrollContainerRef.current) return;

    const container = scrollContainerRef.current;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const isNearBottom = distanceFromBottom < 300;

    // Only auto-scroll if:
    // 1. User is already near bottom (reading latest messages), OR
    // 2. Not currently streaming (scroll to show new message after completion)
    if (isNearBottom || (!props.isStreaming && !showScrollBottom)) {
      props.messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [props.messages, props.isStreaming, showScrollBottom]);

  // Auto-resize textarea (Legacy UI)
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 128)}px`;
    }
  }, [props.inputText]);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollBottom(!isNearBottom);
    }
  };

  const handleReply = (message: Message) => {
    setReplyingTo(message);
    if (textareaRef.current) textareaRef.current.focus();
  };

  const handleSend = () => {
    if (!props.inputText.trim() && props.attachments.length === 0) return;
    props.sendMessage(props.inputText, replyingTo?.id);
    setReplyingTo(null);
    // Reset height
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  // Helper to update messages and sync to DB
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
          .catch((error) => console.error('Failed to sync message state:', error));
      }
    }
  };

  const handleReaction = async (msgId: string, emoji: string) => {
    updateMessageState(msgId, (m) => {
      const existing = m.reactions?.find(r => r.emoji === emoji);
      let newReactions = m.reactions || [];
      if (existing) {
        if (existing.userReacted) {
          newReactions = newReactions.filter(r => r.emoji !== emoji);
        } else {
          newReactions = newReactions.map(r => r.emoji === emoji ? { ...r, count: r.count + 1, userReacted: true } : r);
        }
      } else {
        newReactions = [...newReactions, { emoji, count: 1, userReacted: true }];
      }
      return { ...m, reactions: newReactions };
    });
  };

  const handlePin = (msgId: string) => {
    updateMessageState(msgId, (m) => ({ ...m, isPinned: !m.isPinned }));
  };

  const handleStar = (msgId: string) => {
    updateMessageState(msgId, (m) => ({ ...m, isStarred: !m.isStarred }));
  };

  const handleForward = (message: Message) => {
    if (message.text) {
      props.setInputText(message.text);
      if (textareaRef.current) textareaRef.current.focus();
    }
  };

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
          .catch((error) => console.error('Failed to delete message from storage:', error));
      }
    }
  };

  const getReplyContent = (msg: Message) => {
    const hasAudio = msg.attachments?.some(a => a.type === 'audio');
    if (hasAudio) {
      return (
        <div className="flex items-center gap-1.5 text-muted italic">
          <Mic size={12} />
          <span>Voice Message</span>
        </div>
      );
    }
    if (msg.attachments && msg.attachments.length > 0 && !msg.text) {
      return `[${msg.attachments[0].type}]`;
    }
    return msg.text || '';
  };

  // --- NEW WHATSAPP UI RENDER ---
  if (USE_WHATSAPP_UI) {
    // Use basic persona from conversation list as primary, fall back to living persona
    const displayPersona = props.activePersona || props.config.livingPersona;

    return (
      <ChatArea
        messages={props.messages}
        currentPersona={displayPersona}
        inputText={props.inputText}
        setInputText={props.setInputText}
        onSendMessage={props.sendMessage}
        onFileSelect={props.handleFileSelect}
        messagesEndRef={props.messagesEndRef}
        isStreaming={props.isStreaming}
        onOpenVideoCall={props.onOpenVideoCall}
        fileInputRef={props.fileInputRef}
        attachments={props.attachments}
        setAttachments={props.setAttachments}
        onBack={props.onBack}
        setMessages={props.setMessages}
        currentSessionId={props.currentSessionId}
        isDarkMode={props.isDarkMode}
        sendVoiceMessage={props.sendVoiceMessage}
        onRegenerate={props.handleRegenerate}
        onEdit={props.handleEdit}
        toggleChatList={props.toggleChatList}
        isChatListOpen={props.isChatListOpen}
        toggleFullscreen={props.toggleFullscreen}
        isFullscreen={props.isFullscreen}
        onNewChatWithPersona={props.onNewChatWithPersona}
        onBranch={props.onBranch}
        onShowHistory={props.onShowHistory}
      />
    );
  }

  // --- LEGACY UI RENDER ---
  return (
    <>
      <header className="h-16 flex items-center justify-between px-4 glass-thin specular-top sticky top-0 z-40 border-b border-stroke/50 bg-bg/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          {!props.isSidebarOpen && (
            <button
              onClick={() => props.setIsSidebarOpen(true)}
              className="p-2 rounded-xl hover:bg-surface active:bg-surface/80 transition-all text-ink"
            >
              <PanelLeft size={20} />
            </button>
          )}

          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-accent2 flex items-center justify-center shadow-md">
                <span className="text-white font-bold text-lg">
                  {props.config.livingPersona?.core?.name?.[0] || 'A'}
                </span>
              </div>
              {isOnline && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-bg"></div>}
            </div>

            <div className="flex flex-col">
              <h1 className="font-bold text-sm text-ink leading-tight">
                {props.config.livingPersona?.core?.name || 'Ashim'}
              </h1>
              <div className="flex items-center gap-2 h-4">
                {props.isProcessingPersona ? (
                  <span className="text-[10px] text-accent font-medium flex items-center gap-1">
                    <Loader2 size={10} className="animate-spin" />
                    Updating...
                  </span>
                ) : (
                  <TypingStatus isTyping={props.isStreaming} isOnline={isOnline} />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={props.onOpenVideoCall} className="p-2.5 rounded-full hover:bg-surface text-ink transition-colors" title="Video Call">
            <Video size={20} />
          </button>
          <button onClick={props.toggleFullscreen} className="p-2.5 rounded-full hover:bg-surface text-ink transition-colors" title="Toggle Fullscreen">
            {props.isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
          <button onClick={() => props.setIsDarkMode(!props.isDarkMode)} className="p-2.5 rounded-full hover:bg-surface text-ink transition-colors">
            {props.isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </header>

      {!isOnline && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-1.5 flex items-center justify-center gap-2">
          <WifiOff size={12} className="text-red-500" />
          <span className="text-[11px] font-semibold text-red-500">No connection</span>
        </div>
      )}

      <main
        className="flex-1 overflow-y-auto custom-scrollbar relative bg-bg"
        ref={scrollContainerRef}
        onScroll={handleScroll}
      >
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }} />

        <div className="max-w-3xl mx-auto px-4 py-6 pb-32 min-h-full flex flex-col justify-end">
          {props.hasMoreMessages && (
            <div className="flex justify-center mb-6">
              <button onClick={props.onLoadMore} className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface shadow-sm border border-stroke/50 text-xs font-medium text-muted hover:bg-surface2 transition-all">
                <RefreshCw size={12} /> Load older messages
              </button>
            </div>
          )}

          {props.messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-up">
              <div className="w-20 h-20 rounded-3xl bg-surface border border-stroke/50 flex items-center justify-center mb-6 shadow-sm">
                <Sparkles size={32} className="text-accent" />
              </div>
              <h2 className="text-xl font-bold text-ink mb-2">
                Say hello to {props.config.livingPersona?.core?.name || 'Ashim'}
              </h2>
              <p className="text-sm text-muted max-w-xs mx-auto">
                Start a conversation. I can see, hear, and remember details about you.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-0">
            {props.messages.map((msg, index) => {
              const prev = props.messages[index - 1];
              const showDate = !prev || (new Date(msg.timestamp).getDate() !== new Date(prev.timestamp).getDate());
              const replyTarget = msg.replyToId ? props.messages.find(m => m.id === msg.replyToId) : undefined;

              return (
                <React.Fragment key={msg.id}>
                  {showDate && (
                    <div className="flex justify-center my-6 sticky top-2 z-10">
                      <span className="bg-surface/80 backdrop-blur border border-stroke/50 px-3 py-1 rounded-full text-[10px] font-bold text-muted shadow-sm">
                        {new Date(msg.timestamp).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  )}
                  <div className="animate-fade-up">
                    <MessageBubble
                      message={msg}
                      previousMessage={prev}
                      replyingToMessage={replyTarget}
                      isDarkMode={props.isDarkMode}
                      onRegenerate={props.handleRegenerate}
                      onEdit={props.handleEdit}
                      onDelete={handleDelete}
                      onReply={handleReply}
                      onReaction={handleReaction}
                      onPin={handlePin}
                      onStar={handleStar}
                      onForward={handleForward}
                      personaName={props.config.livingPersona?.core?.name}
                    />
                  </div>
                </React.Fragment>
              );
            })}

            {props.isStreaming && (
              <div className="flex flex-col items-start mt-2 animate-fade-in">
                <div className="px-4 py-3 bg-white dark:bg-[#202c33] border border-stroke/10 rounded-2xl rounded-tl-none shadow-sm">
                  <div className="flex gap-1 h-2 items-center">
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                  </div>
                </div>
              </div>
            )}
          </div>
          <div ref={props.messagesEndRef} />
        </div>
      </main>

      {showScrollBottom && (
        <button
          onClick={() => props.messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="absolute bottom-24 right-6 p-3 bg-surface shadow-lg border border-stroke rounded-full text-accent hover:scale-110 transition-all z-20"
        >
          <ArrowDown size={20} />
        </button>
      )}

      <footer className="absolute bottom-0 left-0 right-0 z-50 p-4 pt-0">
        <div className="w-full max-w-3xl mx-auto">
          {replyingTo && !isRecording && (
            <div className="flex items-center justify-between p-3 mx-2 mb-[-10px] rounded-t-2xl bg-surface border border-stroke shadow-lg animate-slide-up relative z-0 overflow-hidden">
              <div className="flex items-center gap-3 overflow-hidden pl-2 border-l-4 border-accent flex-1 w-0 min-w-0 max-w-[calc(100vw-80px)]">
                <div className="flex flex-col w-full overflow-hidden">
                  <span className="text-xs font-bold text-accent mb-0.5 truncate block">
                    {replyingTo.role === 'user' ? 'You' : props.config.livingPersona?.core?.name || 'Ashim'}
                  </span>
                  <div className="text-xs text-muted truncate block w-full">
                    {getReplyContent(replyingTo)}
                  </div>
                </div>
              </div>
              <button onClick={() => setReplyingTo(null)} className="p-1.5 hover:bg-surface2 rounded-full transition-colors shrink-0 ml-2">
                <X size={16} className="text-muted" />
              </button>
            </div>
          )}

          <div className={`
            bg-surface/90 backdrop-blur-xl border border-stroke/80 shadow-2xl 
            flex gap-2 p-2 relative z-10 transition-all
            ${isRecording ? 'items-center rounded-[24px]' : 'items-end'}
            ${replyingTo && !isRecording ? 'rounded-b-[24px] rounded-t-xl' : 'rounded-[24px]'}
          `}>
            {!isRecording && (
              <button
                onClick={() => props.fileInputRef.current?.click()}
                disabled={props.isUploading}
                className="p-3 rounded-full hover:bg-surface2 text-muted hover:text-ink transition-all disabled:opacity-50 shrink-0"
              >
                {props.isUploading ? <Loader2 size={22} className="animate-spin" /> : <Paperclip size={22} />}
              </button>
            )}

            <input type="file" ref={props.fileInputRef} onChange={props.handleFileSelect} className="hidden" multiple accept="image/*,video/*" />

            {!isRecording && (
              <textarea
                ref={textareaRef}
                value={props.inputText}
                onChange={e => props.setInputText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                onPaste={props.handlePaste}
                className="flex-1 min-w-0 bg-transparent border-none resize-none py-3.5 px-2 outline-none text-ink placeholder-muted/60 max-h-32 text-[15px]"
                placeholder="Message..."
                rows={1}
                autoFocus
                style={{ height: 'auto', minHeight: '52px' }}
              />
            )}

            {(!props.inputText.trim() && props.attachments.length === 0 && props.sendVoiceMessage) ? (
              <VoiceRecorder
                onRecordingComplete={(blob, dur) => {
                  props.sendVoiceMessage?.(blob, dur);
                  setIsRecording(false);
                }}
                onRecordingStart={() => setIsRecording(true)}
                onRecordingCancel={() => setIsRecording(false)}
                className={isRecording ? "flex-1 w-full" : "shrink-0"}
              />
            ) : (
              <button
                onClick={handleSend}
                disabled={(!props.inputText.trim() && props.attachments.length === 0)}
                className={`
                        p-3 rounded-full transition-all duration-300 transform active:scale-95 shrink-0
                        ${(!props.inputText.trim() && props.attachments.length === 0)
                    ? 'bg-surface2 text-muted cursor-default'
                    : 'bg-accent text-white shadow-lg hover:shadow-accent/25 hover:bg-accent-dark'}
                    `}
              >
                <Send size={20} className={props.isStreaming ? "hidden" : "block"} />
                {props.isStreaming && <Loader2 size={20} className="animate-spin" />}
              </button>
            )}
          </div>
        </div>
      </footer>
    </>
  );
};

export default ChatInterface;
