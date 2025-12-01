import React, { useEffect, useState } from 'react';

interface NotificationModalProps {
  title: string;
  message: string;
  onClose: () => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({ title, message, onClose }) => {
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    // 1. Trigger Fade In (Start immediately)
    // Using a small timeout to ensure the browser registers the initial '0' opacity for the transition
    const enterTimer = setTimeout(() => setOpacity(1), 50);

    // 2. Trigger Fade Out
    // 2s Fade In + 3s Reading Time = Start fading out at 5s
    const exitTimer = setTimeout(() => {
      setOpacity(0);
    }, 5000);

    // 3. Remove Component (Call onClose)
    // 5s + 2s Fade Out = 7s Total Duration
    const closeTimer = setTimeout(() => {
      onClose();
    }, 7000);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(closeTimer);
    };
  }, [onClose]);

  return (
    <div className="fixed bottom-24 lg:bottom-8 left-1/2 transform -translate-x-1/2 z-[100] pointer-events-none w-full max-w-sm px-4 flex justify-center">
      <div 
        className="bg-white/95 backdrop-blur-md border border-amber-200 shadow-xl rounded-full px-6 py-3 flex items-center gap-4 transition-opacity ease-in-out"
        style={{ 
            opacity: opacity, 
            transitionDuration: '2000ms' // Requested 2s fade duration
        }}
      >
        <div className="text-3xl animate-bounce-slow">🏆</div>
        <div>
            <h3 className="font-bold text-amber-800 text-sm">{title}</h3>
            <p className="text-xs text-gray-500 font-medium">{message}</p>
        </div>
      </div>
    </div>
  );
};