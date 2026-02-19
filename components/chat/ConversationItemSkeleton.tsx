
import React from 'react';

const ConversationItemSkeleton: React.FC = () => (
  <div className="flex items-center px-3 py-3 w-full h-[72px] border-b border-[#202c33] animate-pulse">
    <div className="w-[49px] h-[49px] bg-[#202c33] rounded-full shrink-0 mr-3" />
    <div className="flex-1 flex flex-col justify-center gap-2">
      <div className="flex justify-between w-full">
         <div className="h-4 bg-[#202c33] rounded w-24" />
         <div className="h-3 bg-[#202c33] rounded w-10" />
      </div>
      <div className="h-3 bg-[#202c33] rounded w-48" />
    </div>
  </div>
);

export default ConversationItemSkeleton;
