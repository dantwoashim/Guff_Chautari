
import React, { useState, useRef, useEffect } from 'react';
import { Plus, Smile, Mic, Send } from '../Icons';
import VoiceRecorder from '../VoiceRecorder';
import EmojiPicker from '../EmojiPicker';

interface MessageInputProps {
    onSend: (text: string) => void;
    onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onTypingStart?: () => void;
    onVoiceComplete?: (blob: Blob, duration: number) => void;
    fileInputRef?: React.RefObject<HTMLInputElement | null>;
    hasAttachments?: boolean; // NEW: indicates if attachments are pending
}

const MessageInput: React.FC<MessageInputProps> = ({
    onSend,
    onFileSelect,
    onTypingStart,
    onVoiceComplete,
    fileInputRef,
    hasAttachments = false
}) => {
    const [text, setText] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [showEmoji, setShowEmoji] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const emojiRef = useRef<HTMLDivElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
        }
    }, [text]);

    // Click outside emoji picker
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
                setShowEmoji(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            // Allow sending with text OR attachments
            if (text.trim() || hasAttachments) {
                onSend(text.trim());
                setText('');
            }
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setText(e.target.value);
        onTypingStart?.();
    };

    return (
        <div className={`min-h-[62px] bg-[#202c33] px-4 py-2 flex items-end gap-3 z-20 ${isRecording ? 'items-center' : ''}`}>

            {/* Hidden File Input */}
            <input
                type="file"
                ref={fileInputRef}
                onChange={onFileSelect}
                className="hidden"
                multiple
                accept="image/*,video/*,audio/*"
            />

            {!isRecording && (
                <button
                    onClick={() => fileInputRef?.current?.click()}
                    className="p-2 text-[#8696a0] hover:text-[#e9edef] transition-colors mb-1"
                    title="Attach file"
                >
                    <Plus size={24} />
                </button>
            )}

            {!isRecording && (
                <div className="flex-1 wa-input-wrapper">
                    <div className="relative" ref={emojiRef}>
                        <button
                            onClick={() => setShowEmoji(!showEmoji)}
                            className="mr-3 text-[#8696a0] hover:text-[#e9edef] transition-colors mb-0.5"
                        >
                            <Smile size={24} />
                        </button>
                        {showEmoji && (
                            <div className="absolute bottom-full left-0 mb-2 z-50">
                                <EmojiPicker
                                    onSelect={(emoji: string) => {
                                        setText(prev => prev + emoji);
                                        // Don't close immediately to allow multiple selection
                                        textareaRef.current?.focus();
                                    }}
                                    onClose={() => setShowEmoji(false)}
                                    isDarkMode={true}
                                />
                            </div>
                        )}
                    </div>

                    <textarea
                        ref={textareaRef}
                        value={text}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        rows={1}
                        placeholder="Type a message"
                        className="wa-input"
                    />
                </div>
            )}

            {(text.trim() || hasAttachments) ? (
                <button
                    onClick={() => { onSend(text.trim()); setText(''); }}
                    className="p-2.5 text-[#8696a0] hover:text-[#e9edef] transition-colors mb-1"
                >
                    <Send size={24} />
                </button>
            ) : (
                onVoiceComplete ? (
                    <VoiceRecorder
                        onRecordingComplete={(blob, dur) => {
                            onVoiceComplete(blob, dur);
                            setIsRecording(false);
                        }}
                        onRecordingStart={() => setIsRecording(true)}
                        onRecordingCancel={() => setIsRecording(false)}
                        className={isRecording ? "flex-1 w-full" : "shrink-0"}
                    />
                ) : (
                    <button className="p-2.5 text-[#8696a0] hover:text-[#e9edef] transition-colors mb-1">
                        <Mic size={24} />
                    </button>
                )
            )}
        </div>
    );
};

export default MessageInput;
