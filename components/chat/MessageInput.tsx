import React, { useEffect, useRef, useState } from 'react';
import { Mic, Paperclip, Send, Smile } from '../Icons';
import VoiceRecorder from '../VoiceRecorder';
import EmojiPicker from '../EmojiPicker';

interface MessageInputProps {
  onSend: (text: string) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onTypingStart?: () => void;
  onVoiceComplete?: (blob: Blob, duration: number) => void;
  fileInputRef?: React.RefObject<HTMLInputElement | null>;
  hasAttachments?: boolean;
}

const MessageInput: React.FC<MessageInputProps> = ({
  onSend,
  onFileSelect,
  onTypingStart,
  onVoiceComplete,
  fileInputRef,
  hasAttachments = false,
}) => {
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!textareaRef.current) {
      return;
    }
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
  }, [text]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(event.target as Node)) {
        setShowEmoji(false);
      }
    };

    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, []);

  const canSend = Boolean(text.trim()) || hasAttachments;

  return (
    <div className="border-t border-[color:var(--color-border)] bg-[color:rgba(9,19,31,0.85)] backdrop-blur-xl p-3">
      <div className="premium-panel p-2 flex items-end gap-2">
        <input
          type="file"
          ref={fileInputRef}
          onChange={onFileSelect}
          className="hidden"
          multiple
          accept="image/*,video/*,audio/*"
        />

        {!recording ? (
          <button
            onClick={() => fileInputRef?.current?.click()}
            className="premium-button h-10 w-10 inline-flex items-center justify-center shrink-0"
            title="Attach files"
            aria-label="Attach files"
          >
            <Paperclip size={16} />
          </button>
        ) : null}

        {!recording ? (
          <div className="flex-1 min-w-0 flex items-end gap-2">
            <div className="relative" ref={emojiRef}>
              <button
                onClick={() => setShowEmoji((prev) => !prev)}
                className="premium-button h-10 w-10 inline-flex items-center justify-center"
                title="Emoji"
                aria-label="Open emoji picker"
              >
                <Smile size={16} />
              </button>

              {showEmoji ? (
                <div className="absolute bottom-[calc(100%+8px)] left-0 z-50">
                  <EmojiPicker
                    onSelect={(emoji: string) => {
                      setText((prev) => prev + emoji);
                      textareaRef.current?.focus();
                    }}
                    onClose={() => setShowEmoji(false)}
                    isDarkMode={true}
                  />
                </div>
              ) : null}
            </div>

            <textarea
              ref={textareaRef}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                onTypingStart?.();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  if (canSend) {
                    onSend(text.trim());
                    setText('');
                  }
                }
              }}
              rows={1}
              className="premium-input min-h-[46px] max-h-[140px] resize-none"
              placeholder="Message Ashim..."
            />
          </div>
        ) : null}

        {canSend ? (
          <button
            onClick={() => {
              onSend(text.trim());
              setText('');
            }}
            className="premium-button h-10 w-10 inline-flex items-center justify-center shrink-0 bg-[color:rgba(108,199,255,0.2)] border-[color:rgba(108,199,255,0.45)]"
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        ) : onVoiceComplete ? (
          <VoiceRecorder
            onRecordingComplete={(blob, duration) => {
              onVoiceComplete(blob, duration);
              setRecording(false);
            }}
            onRecordingStart={() => setRecording(true)}
            onRecordingCancel={() => setRecording(false)}
            className={recording ? 'flex-1 w-full' : 'shrink-0'}
          />
        ) : (
          <button
            className="premium-button h-10 w-10 inline-flex items-center justify-center shrink-0"
            aria-label="Record voice"
          >
            <Mic size={16} />
          </button>
        )}
      </div>
    </div>
  );
};

export default MessageInput;
