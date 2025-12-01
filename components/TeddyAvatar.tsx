import React, { useEffect, useState } from 'react';
import { TeddyMood } from '../types';

interface TeddyAvatarProps {
  mood: TeddyMood;
}

export const TeddyAvatar: React.FC<TeddyAvatarProps> = ({ mood }) => {
  const [blink, setBlink] = useState(false);

  // Blinking logic
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 200);
    }, 4000);
    return () => clearInterval(blinkInterval);
  }, []);

  const getMouthShape = () => {
    switch (mood) {
      case TeddyMood.HAPPY:
      case TeddyMood.TALKING:
        return "rounded-b-full h-4 w-8 border-b-4 border-amber-900";
      case TeddyMood.SURPRISED:
        return "rounded-full h-4 w-4 bg-amber-900";
      case TeddyMood.THINKING:
        return "w-6 h-1 bg-amber-900 rounded-full translate-x-2 rotate-6";
      default:
        return "rounded-b-full h-2 w-6 border-b-4 border-amber-900";
    }
  };

  const isTalking = mood === TeddyMood.TALKING;

  return (
    <div className="relative w-48 h-48 sm:w-64 sm:h-64 mx-auto transition-transform duration-500 hover:scale-105">
      {/* Ears */}
      <div className="absolute top-4 left-4 w-16 h-16 bg-amber-600 rounded-full" />
      <div className="absolute top-4 right-4 w-16 h-16 bg-amber-600 rounded-full" />
      <div className="absolute top-6 left-6 w-10 h-10 bg-amber-300 rounded-full opacity-60" />
      <div className="absolute top-6 right-6 w-10 h-10 bg-amber-300 rounded-full opacity-60" />

      {/* Head */}
      <div className="absolute inset-4 bg-amber-500 rounded-full shadow-lg flex flex-col items-center justify-center z-10">
        
        {/* Eyes */}
        <div className="flex justify-between w-24 mb-2">
          {/* Left Eye */}
          <div className={`w-6 h-6 bg-amber-950 rounded-full relative overflow-hidden transition-all duration-100 ${blink ? 'scale-y-10' : 'scale-y-100'}`}>
            <div className="absolute top-1 left-1 w-2 h-2 bg-white rounded-full opacity-60"></div>
          </div>
           {/* Right Eye */}
           <div className={`w-6 h-6 bg-amber-950 rounded-full relative overflow-hidden transition-all duration-100 ${blink ? 'scale-y-10' : 'scale-y-100'}`}>
            <div className="absolute top-1 left-1 w-2 h-2 bg-white rounded-full opacity-60"></div>
          </div>
        </div>

        {/* Snout */}
        <div className="bg-amber-200 w-28 h-20 rounded-[50%] flex flex-col items-center justify-center relative shadow-inner-sm">
          {/* Nose */}
          <div className="w-8 h-6 bg-amber-900 rounded-full mb-1 shadow-sm"></div>
          {/* Philtrum */}
          <div className="w-1 h-3 bg-amber-900"></div>
          {/* Mouth */}
          <div className={`transition-all duration-300 ${getMouthShape()} ${isTalking ? 'animate-pulse' : ''}`}></div>
        </div>

        {/* Cheeks */}
        <div className="absolute top-28 left-4 w-8 h-4 bg-pink-300 rounded-full blur-md opacity-50"></div>
        <div className="absolute top-28 right-4 w-8 h-4 bg-pink-300 rounded-full blur-md opacity-50"></div>
      </div>
      
      {/* Bowtie (Optional cute accessory) */}
      <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-2 z-20 flex flex-col items-center">
        <div className="w-8 h-8 bg-red-500 rotate-45 rounded-md shadow-md"></div>
      </div>
    </div>
  );
};
