
import React from 'react';
import { Message } from '../../types';
import { Check, CheckCheck } from '../Icons';

interface MessageBubbleProps {
  message: Message;
  isGrouped: boolean;
  isLastInGroup: boolean;
}

const TailIn = () => (
  <svg viewBox="0 0 8 13" width="8" height="13" className="wa-tail-in">
    <path opacity="0.13" d="M1.533 3.568 8 12.193V1H2.812C1.042 1 .474 2.156 1.533 3.568z"></path>
    <path d="M1.533 2.568 8 11.193V0H2.812C1.042 0 .474 1.156 1.533 2.568z"></path>
  </svg>
);

const TailOut = () => (
  <svg viewBox="0 0 8 13" width="8" height="13" className="wa-tail-out">
    <path opacity="0.13" d="M5.188 1H0v11.193l6.467-8.625C7.526 2.156 6.958 1 5.188 1z"></path>
    <path d="M5.188 0H0v11.193l6.467-8.625C7.526 1.156 6.958 0 5.188 0z"></path>
  </svg>
);

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isGrouped, isLastInGroup }) => {
  const isUser = message.role === 'user';
  // A "tail" usually appears on the first message of a group (top corner) in strict visual terms, 
  // but simpler logic: first message has tail.
  // Actually in WA, tail is on the top corner of the FIRST message in a sequence.
  const hasTail = !isGrouped; 

  const bubbleClass = isUser ? 'wa-bubble-out' : 'wa-bubble-in';
  
  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-1 px-[9%]`}>
      <div 
        className={`wa-bubble ${bubbleClass} ${hasTail ? 'has-tail' : ''}`}
        style={{
            borderTopLeftRadius: !isUser && hasTail ? 0 : 7.5,
            borderTopRightRadius: isUser && hasTail ? 0 : 7.5
        }}
      >
        {hasTail && !isUser && <TailIn />}
        {hasTail && isUser && <TailOut />}

        <div className="pb-1 pr-1">
            <span className="whitespace-pre-wrap">{message.text}</span>
            {/* Timestamp & Status float */}
            <span className="float-right flex items-center gap-1 ml-2 mt-2 translate-y-1">
                <span className="text-[11px] text-[hsla(0,0%,100%,0.6)]">
                    {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                </span>
                {isUser && (
                    <span className={message.status === 'read' ? 'text-[#53bdeb]' : 'text-[hsla(0,0%,100%,0.6)]'}>
                        {message.status === 'read' ? <CheckCheck size={16} /> : <Check size={16} />}
                    </span>
                )}
            </span>
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
