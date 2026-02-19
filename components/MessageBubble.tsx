
import React, { useState, memo } from 'react';
import { Message } from '../types';
import Lightbox from './Lightbox';
import ChatContextMenu from './ChatContextMenu';
import { getShadowTraceByAssistantMessage, isShadowModeEnabled } from '../src/observability/shadowMode';
import {
  FileText, Check, CheckCheck, ChevronDown, Pin, Star, FileAudio, Mic, Clock
} from './Icons';

interface MessageBubbleProps {
  message: Message;
  isDarkMode?: boolean;
  onEdit?: (id: string, text: string) => void;
  onDelete?: (id: string) => void;
  onReply?: (message: Message) => void;
  onReaction?: (id: string, emoji: string) => void;
  onPin?: (id: string) => void;
  onStar?: (id: string) => void;
  onForward?: (message: Message) => void;
  personaName?: string;
  onRegenerate?: (id: string) => void;
  previousMessage?: Message;
  replyingToMessage?: Message;
  onBranch?: (id: string) => void; // New Prop
}

const MessageBubble: React.FC<MessageBubbleProps> = memo(({
  message,
  onDelete,
  onReply,
  onReaction,
  onPin,
  onStar,
  onForward,
  isDarkMode,
  previousMessage,
  replyingToMessage,
  personaName,
  onBranch
}) => {
  const isUser = message.role === 'user';
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);
  const [showMenuButton, setShowMenuButton] = useState(false);
  const [isTraceOpen, setIsTraceOpen] = useState(false);
  
  // Grouping logic (if same sender within 2 minutes)
  const isGrouped = previousMessage && previousMessage.role === message.role && (message.timestamp - previousMessage.timestamp < 120000);

  // Check if message has reactions
  const hasReactions = message.reactions && message.reactions.length > 0;

  // Check if it's a voice message (has audio attachment)
  const hasAudio = message.attachments?.some(a => a.type === 'audio');

  // Skip showing empty "processing" messages unless error or generating image
  if (!isUser && !message.text && !message.attachments?.length && !message.isError && !message.isImageGenerating && !message.isTyping) {
    return null;
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.text || '');
      setContextMenu(null);
    } catch {}
  };

  const renderAttachments = () => {
    if (message.isImageGenerating) {
        return (
            <div className={`mb-2 max-w-[280px] aspect-[3/4] rounded-2xl overflow-hidden bg-surface border border-stroke/50 relative shadow-sm`}>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
            </div>
        );
    }

    if (!message.attachments || message.attachments.length === 0) return null;

    return (
      <div className={`flex flex-col gap-1 mb-1 ${isUser ? 'items-end' : 'items-start'}`}>
        {message.attachments.map((att, i) => {
          const url = att.url || (att.data ? `data:${att.mimeType};base64,${att.data}` : '');
          
          if (att.type === 'audio') {
              return (
                  <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border max-w-[280px] w-full ${isUser ? 'bg-[#005c4b] border-white/10' : 'bg-surface border-stroke/50'}`}>
                      <div className="w-10 h-10 rounded-full bg-black/20 flex items-center justify-center text-white shrink-0">
                          <FileAudio size={20} />
                      </div>
                      <audio controls src={url} className="h-8 w-full max-w-[180px]" style={{ opacity: 0.9 }} />
                  </div>
              );
          }

          const isImg = att.type === 'image';

          return (
            <div key={i} className="relative group overflow-hidden rounded-xl border border-stroke/30 bg-black/5 max-w-[300px] cursor-pointer" onClick={() => isImg && setLightboxUrl(url)}>
              {isImg ? (
                <img src={url} alt="attachment" className="w-full h-auto object-cover rounded-lg" loading="lazy" />
              ) : (
                <a href={att.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 bg-surface rounded-lg">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                    <FileText size={20} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate max-w-[180px]">{att.metadata?.name || 'File Attachment'}</div>
                    <div className="text-[10px] text-muted uppercase">{att.type}</div>
                  </div>
                </a>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const StatusIcon = message.status === 'queued'
    ? Clock
    : message.status === 'read' || message.status === 'delivered'
      ? CheckCheck
      : Check;
  const statusColor = message.status === 'queued'
    ? 'text-[#f2c879]'
    : message.status === 'read'
      ? 'text-[#53bdeb]'
      : 'text-white/60';

  // Determine reply content safely
  const replyHasAudio = replyingToMessage?.attachments?.some(a => a.type === 'audio');
  const trace = !isUser && isShadowModeEnabled() ? getShadowTraceByAssistantMessage(message.id) : null;
  
  return (
    <div 
      className={`flex flex-col group/bubble relative ${isUser ? 'items-end' : 'items-start'} ${isGrouped ? 'mt-0.5' : 'mt-1.5'}`}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setShowMenuButton(true)}
      onMouseLeave={() => setShowMenuButton(false)}
    >
      {lightboxUrl && <Lightbox imageUrl={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
      
      {contextMenu && (
        <ChatContextMenu 
          x={contextMenu.x} 
          y={contextMenu.y} 
          isUser={isUser} 
          isDarkMode={isDarkMode}
          onClose={() => setContextMenu(null)}
          onReply={() => { onReply?.(message); setContextMenu(null); }}
          onCopy={handleCopy}
          onDelete={() => { onDelete?.(message.id); setContextMenu(null); }}
          onReact={(emoji) => { onReaction?.(message.id, emoji); setContextMenu(null); }}
          onPin={() => { onPin?.(message.id); setContextMenu(null); }}
          onStar={() => { onStar?.(message.id); setContextMenu(null); }}
          onForward={() => { onForward?.(message); setContextMenu(null); }}
          onSelect={() => { console.log('Select message', message.id); setContextMenu(null); }}
          onBranch={() => { onBranch?.(message.id); setContextMenu(null); }} // Added Branch
        />
      )}

      {/* Message Container - Add EXTRA bottom margin if reactions exist */}
      <div className={`relative max-w-[85%] md:max-w-[70%] min-w-[80px] ${hasReactions ? 'mb-6' : ''}`}>
        
        {/* Hover Menu Button */}
        <button 
            onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                setContextMenu({ x: rect.left, y: rect.bottom });
            }}
            className={`
                absolute top-0 -right-8 p-1.5 rounded-full bg-surface border border-stroke shadow-sm text-muted opacity-0 group-hover/bubble:opacity-100 transition-opacity z-10
                ${showMenuButton ? 'opacity-100' : ''}
            `}
        >
            <ChevronDown size={14} />
        </button>

        {renderAttachments()}

        {/* Bubble (Contains text & timestamp) */}
        <div 
            className={`
            relative px-3 py-2 shadow-sm border overflow-visible
            ${isUser 
                ? 'bg-[#005c4b] dark:bg-[#005c4b] border-[#005c4b] text-[#e9edef] rounded-l-xl rounded-br-xl rounded-tr-none' 
                : 'bg-white dark:bg-[#202c33] border-stroke/10 text-gray-800 dark:text-[#e9edef] rounded-r-xl rounded-bl-xl rounded-tl-none'}
            ${isGrouped ? 'rounded-xl' : ''}
            `}
        >
            {/* Reply Context */}
            {message.replyToId && (
                <div className={`
                    mb-1.5 rounded-lg p-2 border-l-4 text-xs bg-black/10 dark:bg-black/20 flex flex-col gap-0.5 overflow-hidden
                    ${isUser ? 'border-white/50 text-white/90' : 'border-accent text-gray-600 dark:text-gray-300'}
                `}>
                    <span className="font-bold opacity-90 truncate">
                        {replyingToMessage?.role === 'user' ? 'You' : (personaName || 'Ashim')}
                    </span>
                    <span className="opacity-80 line-clamp-2 break-words leading-relaxed text-[11px]">
                        {replyHasAudio ? (
                            <span className="flex items-center gap-1 italic"><Mic size={12} /> Voice Message</span>
                        ) : (
                            replyingToMessage ? (replyingToMessage.text || (replyingToMessage.attachments?.length ? '[Media]' : 'Message')) : 'Message unavailable'
                        )}
                    </span>
                </div>
            )}

            {/* Text Content - Hidden if audio present */}
            {message.isTyping && !message.text ? (
                <div className="flex gap-1 h-5 items-center px-1 py-1">
                    <div className="w-1.5 h-1.5 bg-current opacity-60 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-1.5 h-1.5 bg-current opacity-60 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-1.5 h-1.5 bg-current opacity-60 rounded-full animate-bounce" />
                </div>
            ) : (
                !hasAudio && (
                    <div className="text-[15px] leading-snug whitespace-pre-wrap break-words pb-3">
                        {message.text}
                    </div>
                )
            )}

            {!isUser && trace ? (
                <div className="mb-2 mt-1 rounded border border-[#36515f] bg-[#10222b] p-2 text-[11px] text-[#bfd8e8]">
                    <button
                        type="button"
                        className="text-left text-[11px] font-semibold text-[#d7f0ff] hover:text-white"
                        onClick={() => setIsTraceOpen((open) => !open)}
                    >
                        {isTraceOpen ? 'Hide reasoning trace' : 'Show reasoning trace'}
                    </button>
                    {isTraceOpen ? (
                        <div className="mt-2 space-y-1">
                            <div className="text-[#9ec6da]">
                                {trace.provider} / {trace.model}
                            </div>
                            {trace.stages.map((stage) => (
                                <div key={stage.id} className="rounded border border-[#27424f] bg-[#0d1a21] px-2 py-1">
                                    <div className="font-semibold text-[#cce6f5]">{stage.id}</div>
                                    <div>{stage.summary}</div>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
            ) : null}

            {/* Indicators & Timestamp */}
            <div className={`
                absolute bottom-1 right-2 flex items-center gap-1.5 select-none pointer-events-none
                ${isUser ? 'text-white/70' : 'text-gray-400 dark:text-gray-500'}
                ${hasAudio ? 'static justify-end mt-1' : ''}
            `}>
                {message.isStarred && <Star size={10} className="fill-current opacity-80" />}
                {message.isPinned && <Pin size={10} className="fill-current opacity-80" />}
                
                <span className="text-[10px]">
                    {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase()}
                </span>
                {isUser && (
                    <StatusIcon size={16} className={statusColor} strokeWidth={2} />
                )}
            </div>
        </div>

        {/* Reactions - Positioned absolute bottom outside bubble */}
        {hasReactions && (
            <div className={`absolute -bottom-5 ${isUser ? 'right-0' : 'left-0'} flex gap-1 z-20`}>
                {message.reactions?.map((r, i) => (
                    <div key={i} className="bg-surface dark:bg-[#202c33] border border-stroke/20 rounded-full px-1.5 py-0.5 text-[10px] shadow-sm flex items-center gap-1 animate-scale-in cursor-default text-white">
                        <span>{r.emoji}</span>
                        {r.count > 1 && <span className="font-bold">{r.count}</span>}
                    </div>
                ))}
            </div>
        )}
      </div>
    </div>
  );
});

export default MessageBubble;
