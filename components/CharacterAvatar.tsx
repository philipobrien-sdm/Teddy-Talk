import React, { useEffect, useState } from 'react';
import { TeddyMood, CharacterType, CharacterStyle } from '../types';

interface CharacterAvatarProps {
  mood: TeddyMood;
  type: CharacterType;
  style: CharacterStyle;
}

export const CharacterAvatar: React.FC<CharacterAvatarProps> = ({ mood, type, style }) => {
  const [blink, setBlink] = useState(false);

  // Blinking logic
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 200);
    }, 4000);
    return () => clearInterval(blinkInterval);
  }, []);

  const isTalking = mood === TeddyMood.TALKING;
  const isThinking = mood === TeddyMood.THINKING;
  const isSad = mood === TeddyMood.SAD;
  const isExcited = mood === TeddyMood.EXCITED;

  const getColors = () => {
    switch (type) {
      case 'frog': return { body: 'bg-green-500', inner: 'bg-green-200', ears: 'bg-green-600', snout: 'bg-green-300' };
      case 'dragon': return { body: 'bg-teal-600', inner: 'bg-teal-300', ears: 'bg-teal-700', snout: 'bg-teal-400' };
      case 'unicorn': return { body: 'bg-pink-100', inner: 'bg-pink-300', ears: 'bg-white', snout: 'bg-pink-50' };
      case 'teddy': 
      default: return { body: 'bg-amber-500', inner: 'bg-amber-300', ears: 'bg-amber-600', snout: 'bg-amber-200' };
    }
  };

  const colors = getColors();

  const getMouthShape = () => {
    const colorClass = type === 'unicorn' ? 'border-pink-400' : 'border-amber-900';
    const fillClass = type === 'unicorn' ? 'bg-pink-400' : 'bg-amber-900';
    
    switch (mood) {
      case TeddyMood.HAPPY:
      case TeddyMood.TALKING:
        return `rounded-b-full h-4 w-8 border-b-4 ${colorClass}`;
      case TeddyMood.EXCITED:
         // Big open mouth D:
         return `rounded-b-full h-6 w-8 border-b-8 ${colorClass}`;
      case TeddyMood.SAD:
        // Inverted curve (frown)
        return `rounded-t-full h-3 w-8 border-t-4 ${colorClass} mt-2`;
      case TeddyMood.SURPRISED:
        return `rounded-full h-4 w-4 ${fillClass}`;
      case TeddyMood.THINKING:
        return `w-5 h-2 ${fillClass} rounded-full translate-x-1`;
      default:
        return `rounded-b-full h-2 w-6 border-b-4 ${colorClass}`;
    }
  };

  // determine animation class
  let animationClass = "animate-breathe"; // Default idle
  if (isTalking) animationClass = "animate-talking-body"; // More active body language
  if (isThinking) animationClass = "animate-thinking-sway";
  if (isExcited && !isTalking && !isThinking) animationClass = "animate-excited-bounce";
  if (isSad && !isTalking && !isThinking) animationClass = "animate-sad-droop";

  // Eye direction
  const pupilClass = isThinking 
    ? "top-0 left-2" // Look up/right
    : isSad 
      ? "top-2 left-1" // Look down
      : "top-1 left-1"; // Neutral

  const eyeShapeClass = isSad 
    ? "scale-y-75" // Droopy eyes
    : isExcited
      ? "scale-110" // Wide eyes
      : "scale-100";

  return (
    <div className="relative w-40 h-40 sm:w-64 sm:h-64 lg:w-96 lg:h-96 mx-auto z-20 transition-all duration-500">
      <style>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
        @keyframes talking-body {
          0% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(2px) rotate(-3deg); }
          50% { transform: translateY(0) rotate(0deg); }
          75% { transform: translateY(2px) rotate(3deg); }
          100% { transform: translateY(0) rotate(0deg); }
        }
        @keyframes thinking-sway {
          0%, 100% { transform: rotate(-2deg); }
          50% { transform: rotate(2deg); }
        }
        @keyframes excited-bounce {
            0%, 100% { transform: translateY(0) scale(1); }
            50% { transform: translateY(-10px) scale(1.05); }
        }
        @keyframes sad-droop {
            0%, 100% { transform: translateY(0) rotate(0); }
            50% { transform: translateY(5px) rotate(-3deg); }
        }
        .animate-breathe { animation: breathe 4s ease-in-out infinite; }
        .animate-talking-body { animation: talking-body 1.5s ease-in-out infinite; }
        .animate-thinking-sway { animation: thinking-sway 2s ease-in-out infinite; }
        .animate-excited-bounce { animation: excited-bounce 0.8s ease-in-out infinite; }
        .animate-sad-droop { animation: sad-droop 4s ease-in-out infinite; }
      `}</style>

      {/* Main Container for all head parts to move together */}
      <div className={`w-full h-full relative transition-transform duration-500 ${animationClass}`}>
        
        {/* Ears */}
        <div className={`absolute top-4 left-4 w-12 h-12 sm:w-16 sm:h-16 lg:w-24 lg:h-24 ${colors.ears} rounded-full`} />
        <div className={`absolute top-4 right-4 w-12 h-12 sm:w-16 sm:h-16 lg:w-24 lg:h-24 ${colors.ears} rounded-full`} />
        
        {type !== 'frog' && (
          <>
             <div className={`absolute top-6 left-6 w-8 h-8 sm:w-10 sm:h-10 lg:w-14 lg:h-14 ${colors.inner} rounded-full opacity-60`} />
             <div className={`absolute top-6 right-6 w-8 h-8 sm:w-10 sm:h-10 lg:w-14 lg:h-14 ${colors.inner} rounded-full opacity-60`} />
          </>
        )}

        {/* Unicorn Horn */}
        {type === 'unicorn' && (
            <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 w-8 h-16 lg:w-12 lg:h-24 bg-yellow-200 rounded-full clip-triangle z-0" style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }}></div>
        )}

        {/* Dragon Spikes */}
        {type === 'dragon' && (
           <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 flex gap-1">
              <div className="w-4 h-6 bg-teal-800 rounded-t-full"></div>
              <div className="w-4 h-8 bg-teal-800 rounded-t-full -mt-2"></div>
              <div className="w-4 h-6 bg-teal-800 rounded-t-full"></div>
           </div>
        )}

        {/* Head */}
        <div className={`absolute inset-4 ${colors.body} rounded-full shadow-lg flex flex-col items-center justify-center z-10`}>
          
          {/* Eyes */}
          <div className="flex justify-between w-20 sm:w-24 lg:w-40 mb-2 lg:mb-4">
            {/* Left Eye */}
            <div className={`w-5 h-5 sm:w-6 sm:h-6 lg:w-10 lg:h-10 bg-amber-950 rounded-full relative overflow-hidden transition-all duration-300 ${eyeShapeClass} ${blink ? 'scale-y-10' : ''}`}>
              <div className={`absolute w-2 h-2 bg-white rounded-full opacity-60 transition-all duration-500 ${pupilClass}`}></div>
            </div>
             {/* Right Eye */}
             <div className={`w-5 h-5 sm:w-6 sm:h-6 lg:w-10 lg:h-10 bg-amber-950 rounded-full relative overflow-hidden transition-all duration-300 ${eyeShapeClass} ${blink ? 'scale-y-10' : ''}`}>
              <div className={`absolute w-2 h-2 bg-white rounded-full opacity-60 transition-all duration-500 ${pupilClass}`}></div>
            </div>
          </div>

          {/* Snout */}
          <div className={`${colors.snout} w-24 h-16 sm:w-28 sm:h-20 lg:w-48 lg:h-32 rounded-[50%] flex flex-col items-center justify-center relative shadow-inner-sm`}>
            {/* Nose */}
            <div className={`w-6 h-4 sm:w-8 sm:h-6 lg:w-14 lg:h-10 ${type === 'unicorn' ? 'bg-pink-500' : 'bg-amber-900'} rounded-full mb-1 shadow-sm`}></div>
            {/* Philtrum (not for frog) */}
            {type !== 'frog' && <div className={`w-1 h-3 ${type === 'unicorn' ? 'bg-pink-400' : 'bg-amber-900'}`}></div>}
            
            {/* Mouth */}
            <div className={`transition-all duration-300 ${getMouthShape()} ${isTalking ? 'animate-pulse' : ''} lg:scale-125 lg:mt-2`}></div>
          </div>

          {/* Cheeks */}
          <div className="absolute top-24 left-4 w-6 h-3 sm:w-8 sm:h-4 lg:w-14 lg:h-7 lg:top-40 lg:left-8 bg-pink-300 rounded-full blur-md opacity-50"></div>
          <div className="absolute top-24 right-4 w-6 h-3 sm:w-8 sm:h-4 lg:w-14 lg:h-7 lg:top-40 lg:right-8 bg-pink-300 rounded-full blur-md opacity-50"></div>
        </div>
      </div>
      
      {/* Accessories */}
      {style === 'bowtie' && (
        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1 z-20 flex flex-col items-center animate-breathe lg:translate-y-4">
           <div className="flex">
             <div className="w-8 h-8 lg:w-12 lg:h-12 bg-red-500 rounded-l-lg clip-triangle" style={{clipPath: 'polygon(0 0, 100% 50%, 0 100%)'}}></div>
             <div className="w-4 h-8 lg:w-6 lg:h-12 bg-red-600 rounded-sm"></div>
             <div className="w-8 h-8 lg:w-12 lg:h-12 bg-red-500 rounded-r-lg clip-triangle" style={{clipPath: 'polygon(100% 0, 0 50%, 100% 100%)'}}></div>
           </div>
        </div>
      )}

      {style === 'hairbow' && (
         <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 z-20 animate-breathe lg:-top-4">
             <div className="flex relative">
                <div className="w-8 h-8 lg:w-12 lg:h-12 bg-pink-500 rounded-full absolute -left-4 lg:-left-6"></div>
                <div className="w-8 h-8 lg:w-12 lg:h-12 bg-pink-500 rounded-full absolute -right-4 lg:-right-6"></div>
                <div className="w-4 h-4 lg:w-6 lg:h-6 bg-pink-400 rounded-full relative z-10"></div>
             </div>
         </div>
      )}
    </div>
  );
};