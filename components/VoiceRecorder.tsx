
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, X, Send, Trash2 } from './Icons';

interface VoiceRecorderProps {
    onRecordingComplete: (audioBlob: Blob, duration: number) => void;
    onRecordingStart?: () => void;
    onRecordingCancel?: () => void;
    disabled?: boolean;
    className?: string;
}

interface RecordingState {
    isRecording: boolean;
    duration: number;
    audioBlob: Blob | null;
    audioUrl: string | null;
}

const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
    onRecordingComplete,
    onRecordingStart,
    onRecordingCancel,
    disabled = false,
    className = ''
}) => {
    const [state, setState] = useState<RecordingState>({
        isRecording: false,
        duration: 0,
        audioBlob: null,
        audioUrl: null
    });
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [showPreview, setShowPreview] = useState(false);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Clean up on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
        };
    }, []);

    // Format duration as MM:SS
    const formatDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Start recording
    const startRecording = useCallback(async () => {
        try {
            // Request microphone permission
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100
                }
            });
            streamRef.current = stream;
            setHasPermission(true);

            // Create MediaRecorder
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: MediaRecorder.isTypeSupported('audio/webm')
                    ? 'audio/webm'
                    : 'audio/mp4'
            });
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, {
                    type: mediaRecorder.mimeType
                });
                const url = URL.createObjectURL(blob);

                setState(prev => ({
                    ...prev,
                    isRecording: false,
                    audioBlob: blob,
                    audioUrl: url
                }));
                setShowPreview(true);

                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start(100); // Collect data every 100ms

            setState(prev => ({
                ...prev,
                isRecording: true,
                duration: 0,
                audioBlob: null,
                audioUrl: null
            }));

            // Start timer
            timerRef.current = setInterval(() => {
                setState(prev => ({ ...prev, duration: prev.duration + 1 }));
            }, 1000);

            onRecordingStart?.();

        } catch (error) {
            console.error('Error starting recording:', error);
            setHasPermission(false);
        }
    }, [onRecordingStart]);

    // Stop recording and show preview
    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && state.isRecording) {
            mediaRecorderRef.current.stop();
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }
    }, [state.isRecording]);

    // Cancel recording
    const cancelRecording = useCallback(() => {
        if (mediaRecorderRef.current && state.isRecording) {
            mediaRecorderRef.current.stop();
        }
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }
        if (state.audioUrl) {
            URL.revokeObjectURL(state.audioUrl);
        }

        setState({
            isRecording: false,
            duration: 0,
            audioBlob: null,
            audioUrl: null
        });
        setShowPreview(false);
        onRecordingCancel?.();
    }, [state.isRecording, state.audioUrl, onRecordingCancel]);

    // Send recording
    const sendRecording = useCallback(() => {
        if (state.audioBlob) {
            onRecordingComplete(state.audioBlob, state.duration);

            // Clean up
            if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
            setState({
                isRecording: false,
                duration: 0,
                audioBlob: null,
                audioUrl: null
            });
            setShowPreview(false);
        } else if (state.isRecording) {
            // Special case: If sent while recording, stop first then send (WhatsApp behavior)
            // Note: Since onstop is async, we can't easily send immediately in this function scope
            // For now, we stop, which triggers preview, user taps send again. 
            // OR: We just stop. The user sees preview. They tap send.
            stopRecording();
        }
    }, [state.audioBlob, state.duration, state.audioUrl, state.isRecording, onRecordingComplete, stopRecording]);

    // Recording in progress UI (WhatsApp Style)
    if (state.isRecording) {
        return (
            <div className={`flex items-center justify-between w-full px-1 animate-fade-in ${className}`}>
                {/* Delete / Cancel */}
                <button
                    onClick={cancelRecording}
                    className="p-2.5 rounded-full hover:bg-red-500/10 text-muted hover:text-red-500 transition-colors animate-scale-in"
                    title="Cancel Recording"
                >
                    <Trash2 size={20} />
                </button>

                {/* Timer & Indicator */}
                <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-ink font-mono font-medium text-lg min-w-[60px] text-center">
                        {formatDuration(state.duration)}
                    </span>
                </div>

                {/* Stop/Send Button */}
                <button
                    onClick={stopRecording}
                    className="p-3 rounded-full bg-accent text-white shadow-lg hover:bg-accent-dark hover:scale-105 transition-all animate-scale-in"
                    title="Stop & Review"
                >
                    <Send size={20} />
                </button>
            </div>
        );
    }

    // Preview recorded audio (Full Width)
    if (showPreview && state.audioUrl) {
        return (
            <div className={`flex items-center gap-2 w-full animate-fade-in ${className}`}>
                <button
                    onClick={cancelRecording}
                    className="p-2.5 rounded-full hover:bg-red-500/10 text-muted hover:text-red-500 transition-colors"
                    title="Delete"
                >
                    <Trash2 size={20} />
                </button>

                {/* Audio player */}
                <div className="flex-1 flex items-center gap-3 px-4 py-2 rounded-2xl bg-surface/50 border border-stroke/50">
                    <audio
                        src={state.audioUrl}
                        controls
                        className="h-8 flex-1 w-full"
                        style={{ opacity: 0.8 }}
                    />
                    <span className="text-muted text-xs font-mono">
                        {formatDuration(state.duration)}
                    </span>
                </div>

                {/* Send */}
                <button
                    onClick={sendRecording}
                    className="p-3 rounded-full bg-accent text-white hover:shadow-lg hover:shadow-accent/30 transition-all duration-200"
                    title="Send Voice Note"
                >
                    <Send size={20} />
                </button>
            </div>
        );
    }

    // Default mic button
    return (
        <button
            onClick={startRecording}
            disabled={disabled || hasPermission === false}
            className={`p-3 rounded-full hover:bg-surface2 transition-all duration-200 
        ${hasPermission === false ? 'text-red-400 cursor-not-allowed' : 'text-muted hover:text-ink'}
        disabled:opacity-50 ${className}`}
            title={hasPermission === false ? 'Microphone access denied' : 'Record voice note'}
        >
            {hasPermission === false ? <MicOff size={22} /> : <Mic size={22} />}
        </button>
    );
};

export default VoiceRecorder;
