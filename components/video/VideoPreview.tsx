
import React, { useRef, useState, useEffect } from 'react';
import { Mic, MicOff, Video as VideoIcon, VideoOff } from '../Icons';

interface VideoPreviewProps {
  stream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  isModelSpeaking: boolean;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onFrameCapture: (base64: string) => void;
}

const VideoPreview: React.FC<VideoPreviewProps> = ({
  stream,
  isMuted,
  isVideoOff,
  isModelSpeaking,
  onToggleMute,
  onToggleVideo,
  onFrameCapture
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pipPosition, setPipPosition] = useState({ x: 20, y: 80 });
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Handle stream attachment
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Handle frame extraction
  useEffect(() => {
    if (!stream || isVideoOff) return;

    const interval = setInterval(() => {
      if (videoRef.current && canvasRef.current && videoRef.current.readyState >= 2) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = 320;
        canvas.height = 240;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const base64 = canvas.toDataURL('image/jpeg', 0.4).split(',')[1];
          onFrameCapture(base64);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [stream, isVideoOff, onFrameCapture]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    isDragging.current = true;
    dragOffset.current = { x: e.clientX - pipPosition.x, y: e.clientY - pipPosition.y };
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging.current) {
      setPipPosition({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDragging.current = false;
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  return (
    <div 
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ transform: `translate3d(${pipPosition.x}px, ${pipPosition.y}px, 0)` }}
      className="fixed top-0 left-0 z-[100] w-[280px] aspect-[4/3] rounded-3xl overflow-hidden shadow-2xl border border-white/10 bg-black cursor-move touch-none pointer-events-auto group"
    >
       <div className="absolute inset-0 bg-black flex items-center justify-center">
          <video ref={videoRef} muted autoPlay playsInline className={`w-full h-full object-cover transform scale-x-[-1] transition-opacity ${isVideoOff ? 'opacity-0' : 'opacity-100'}`} />
          {isVideoOff && <VideoOff className="text-white/30 absolute" />}
       </div>
       
       <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/80 to-transparent flex items-end justify-center pb-4 gap-1 pointer-events-none">
          {isModelSpeaking && [1,2,3,4].map(i => (
              <div key={i} className="w-1 bg-purple-400 rounded-full animate-pulse" style={{ height: `${20 + Math.random() * 60}%` }} />
          ))}
       </div>

       <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={(e) => { e.stopPropagation(); onToggleMute(); }} className={`p-3 rounded-full ${isMuted ? 'bg-red-500' : 'bg-white/20'}`}>
              {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
          <button onClick={(e) => { e.stopPropagation(); onToggleVideo(); }} className={`p-3 rounded-full ${isVideoOff ? 'bg-red-500' : 'bg-white/20'}`}>
              {isVideoOff ? <VideoOff size={16} /> : <VideoIcon size={16} />}
          </button>
       </div>
       <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default VideoPreview;
