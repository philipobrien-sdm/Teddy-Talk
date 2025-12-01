import React from 'react';
import { ChatMessage } from '../types';

interface ChatBubbleProps {
  message: ChatMessage;
  onPlay?: (text: string) => void;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-4 animate-fade-in-up items-end`}>
      <div
        className={`max-w-[80%] px-5 py-3 rounded-2xl text-lg shadow-md leading-relaxed ${
          isUser
            ? 'bg-amber-400 text-amber-950 rounded-br-none'
            : 'bg-white text-gray-700 rounded-bl-none border border-amber-100'
        }`}
      >
        {message.text}
      </div>
    </div>
  );
};