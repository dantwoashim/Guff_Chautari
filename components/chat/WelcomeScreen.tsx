
import React from 'react';
import { MessageSquare, Lock } from '../Icons';

const WelcomeScreen: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-[#222e35] border-b-[6px] border-[#00a884] text-center p-10 select-none">
      <div className="w-[80px] h-[80px] bg-[#202c33] rounded-full flex items-center justify-center mb-6">
         <MessageSquare size={36} className="text-[#aebac1]" />
      </div>
      
      <h1 className="text-[28px] font-light text-[#e9edef] mb-4">
        Ashim for Web
      </h1>
      
      <p className="text-[14px] text-[#8696a0] max-w-[460px] leading-6 mb-8">
        Chat with AI personas that feel like friends. <br/>
        Experience spontaneous, living conversations that evolve over time.
      </p>

      <div className="mt-auto flex items-center gap-2 text-[#667781] text-[13px]">
        <Lock size={12} />
        <span>End-to-end encrypted</span>
      </div>
    </div>
  );
};

export default WelcomeScreen;
