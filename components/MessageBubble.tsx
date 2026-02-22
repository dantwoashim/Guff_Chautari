import React, { memo, useState } from 'react';
import { Message } from '../types';
import ChatContextMenu from './ChatContextMenu';
import Lightbox from './Lightbox';
import { Check, CheckCheck, ChevronDown, FileAudio, FileText, Mic, Pin, Star } from './Icons';

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
  onBranch?: (id: string) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = memo(
  ({
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
    onBranch,
  }) => {
    const isUser = message.role === 'user';
    const grouped =
      previousMessage && previousMessage.role === message.role
        ? message.timestamp - previousMessage.timestamp < 120000
        : false;

    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

    if (
      !isUser &&
      !message.text &&
      !message.attachments?.length &&
      !message.isError &&
      !message.isImageGenerating &&
      !message.isTyping
    ) {
      return null;
    }

    const hasReactions = Boolean(message.reactions?.length);
    const hasAudio = Boolean(message.attachments?.some((attachment) => attachment.type === 'audio'));
    const StatusIcon = message.status === 'delivered' || message.status === 'read' ? CheckCheck : Check;

    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(message.text || '');
      } finally {
        setContextMenu(null);
      }
    };

    return (
      <div
        className={`group relative flex ${isUser ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-1' : 'mt-3'}`}
        onContextMenu={(event) => {
          event.preventDefault();
          setContextMenu({ x: event.clientX, y: event.clientY });
        }}
      >
        {lightboxUrl ? <Lightbox imageUrl={lightboxUrl} onClose={() => setLightboxUrl(null)} /> : null}

        {contextMenu ? (
          <ChatContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            isUser={isUser}
            isDarkMode={isDarkMode}
            onClose={() => setContextMenu(null)}
            onReply={() => {
              onReply?.(message);
              setContextMenu(null);
            }}
            onCopy={handleCopy}
            onDelete={() => {
              onDelete?.(message.id);
              setContextMenu(null);
            }}
            onReact={(emoji) => {
              onReaction?.(message.id, emoji);
              setContextMenu(null);
            }}
            onPin={() => {
              onPin?.(message.id);
              setContextMenu(null);
            }}
            onStar={() => {
              onStar?.(message.id);
              setContextMenu(null);
            }}
            onForward={() => {
              onForward?.(message);
              setContextMenu(null);
            }}
            onSelect={() => setContextMenu(null)}
            onBranch={() => {
              onBranch?.(message.id);
              setContextMenu(null);
            }}
          />
        ) : null}

        <div className={`max-w-[88%] md:max-w-[72%] relative ${hasReactions ? 'mb-6' : ''}`}>
          <button
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setContextMenu({ x: rect.left, y: rect.bottom });
            }}
            className="absolute top-1 -left-10 opacity-0 group-hover:opacity-100 premium-button h-8 w-8 inline-flex items-center justify-center"
            aria-label="Open message actions"
          >
            <ChevronDown size={13} />
          </button>

          {message.attachments?.length ? (
            <div className={`space-y-2 mb-2 ${isUser ? 'items-end' : 'items-start'}`}>
              {message.attachments.map((attachment, index) => {
                const url = attachment.url || (attachment.data ? `data:${attachment.mimeType};base64,${attachment.data}` : '');

                if (attachment.type === 'audio') {
                  return (
                    <div
                      key={index}
                      className={`rounded-2xl border px-3 py-2 flex items-center gap-3 ${
                        isUser
                          ? 'bg-[color:rgba(23,72,110,0.86)] border-[color:rgba(111,198,255,0.42)]'
                          : 'bg-[color:rgba(15,33,52,0.88)] border-[color:var(--color-border)]'
                      }`}
                    >
                      <span className="h-8 w-8 rounded-full inline-flex items-center justify-center bg-black/25">
                        <FileAudio size={14} />
                      </span>
                      <audio controls src={url} className="h-8 max-w-[220px]" />
                    </div>
                  );
                }

                if (attachment.type === 'image' || attachment.type === 'video') {
                  return (
                    <button
                      key={index}
                      className="overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-black/20"
                      onClick={() => setLightboxUrl(url)}
                    >
                      {attachment.type === 'image' ? (
                        <img src={url} alt="attachment" className="max-h-[320px] object-cover" loading="lazy" />
                      ) : (
                        <video src={url} className="max-h-[320px] object-cover" muted controls />
                      )}
                    </button>
                  );
                }

                return (
                  <a
                    key={index}
                    href={attachment.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-xl border border-[color:var(--color-border)] bg-[color:rgba(15,33,52,0.86)] px-3 py-2"
                  >
                    <FileText size={14} />
                    <span className="text-xs text-[color:var(--color-text-muted)]">
                      {attachment.metadata?.name || 'Attachment'}
                    </span>
                  </a>
                );
              })}
            </div>
          ) : null}

          <article
            className={`rounded-2xl border px-3 py-2.5 shadow-[0_12px_24px_rgba(0,0,0,0.24)] ${
              isUser
                ? 'bg-[color:rgba(21,71,109,0.84)] border-[color:rgba(109,197,255,0.45)] text-[color:var(--color-text)]'
                : 'bg-[color:rgba(13,29,46,0.9)] border-[color:var(--color-border)] text-[color:var(--color-text)]'
            }`}
          >
            {message.replyToId ? (
              <div className="mb-2 rounded-xl border-l-2 border-[color:var(--color-accent)] bg-black/15 px-2 py-1.5">
                <div className="text-[10px] uppercase tracking-wide text-[color:var(--color-text-soft)]">
                  {replyingToMessage?.role === 'user' ? 'You' : personaName || 'Ashim'}
                </div>
                <div className="text-xs text-[color:var(--color-text-muted)] truncate">
                  {replyingToMessage?.attachments?.some((attachment) => attachment.type === 'audio') ? (
                    <span className="inline-flex items-center gap-1"><Mic size={10} /> Voice message</span>
                  ) : (
                    replyingToMessage?.text || '[Media]'
                  )}
                </div>
              </div>
            ) : null}

            {message.isTyping && !message.text ? (
              <div className="flex gap-1 h-5 items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--color-text-soft)] animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--color-text-soft)] animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--color-text-soft)] animate-bounce" />
              </div>
            ) : !hasAudio ? (
              <div className="text-[14px] leading-relaxed whitespace-pre-wrap break-words pb-3">{message.text}</div>
            ) : null}

            <div className="absolute bottom-1.5 right-2.5 flex items-center gap-1.5 text-[10px] text-[color:var(--color-text-soft)]">
              {message.isStarred ? <Star size={10} /> : null}
              {message.isPinned ? <Pin size={10} /> : null}
              <span>
                {new Date(message.timestamp)
                  .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  .toLowerCase()}
              </span>
              {isUser ? (
                <StatusIcon
                  size={12}
                  className={message.status === 'read' ? 'text-[color:var(--color-accent)]' : undefined}
                />
              ) : null}
            </div>
          </article>

          {hasReactions ? (
            <div className={`absolute -bottom-5 ${isUser ? 'right-2' : 'left-2'} flex gap-1`}>
              {message.reactions?.map((reaction, idx) => (
                <span
                  key={idx}
                  className="text-[10px] px-2 py-0.5 rounded-full border border-[color:var(--color-border)] bg-[color:rgba(13,30,47,0.92)]"
                >
                  {reaction.emoji} {reaction.count > 1 ? reaction.count : ''}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  },
);

export default MessageBubble;
