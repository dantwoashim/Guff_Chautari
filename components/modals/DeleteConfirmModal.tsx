
import React from 'react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  chatName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({ 
  isOpen, 
  chatName, 
  onConfirm, 
  onCancel 
}) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-[#3b4a54] rounded-lg shadow-xl p-6 max-w-sm w-full animate-scale-in">
        <h3 className="text-[#e9edef] text-[15px] font-medium mb-3">
          Delete this chat with {chatName}?
        </h3>
        <p className="text-[#8696a0] text-[14px] leading-relaxed mb-6">
          Messages will be removed from this device and cannot be recovered.
        </p>
        <div className="flex justify-end gap-4 font-medium text-[14px]">
          <button 
            onClick={onCancel}
            className="px-4 py-2 text-[#00a884] hover:bg-[#2a3942] rounded-full transition-colors border border-transparent"
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm}
            className="px-4 py-2 bg-transparent text-[#e9edef] hover:bg-[#ef4444]/10 hover:text-[#ef4444] rounded-full transition-colors border border-[#536d7a] hover:border-[#ef4444]"
          >
            Delete chat
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;
