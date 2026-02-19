
import React from 'react';
import { X, Maximize, Download } from './Icons';

interface LightboxProps {
  imageUrl: string | null;
  onClose: () => void;
}

const Lightbox: React.FC<LightboxProps> = ({ imageUrl, onClose }) => {
  if (!imageUrl) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 animate-fade-in backdrop-blur-xl">
      <div className="absolute top-4 right-4 flex gap-4">
        <a 
            href={imageUrl} 
            download={`ashim-generated-${Date.now()}.png`}
            className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
            onClick={(e) => e.stopPropagation()}
        >
            <Download size={24} />
        </a>
        <button 
          onClick={onClose}
          className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
        >
          <X size={24} />
        </button>
      </div>

      <img 
        src={imageUrl} 
        alt="Full screen view" 
        className="max-h-[95vh] max-w-[95vw] object-contain rounded-lg shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
};

export default Lightbox;
