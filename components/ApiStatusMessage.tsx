import React, { useState, useEffect } from 'react';
import { GeminiError } from '../services/geminiService';

interface ApiStatusMessageProps {
  error: GeminiError;
  onRetry: () => void;
}

export const ApiStatusMessage: React.FC<ApiStatusMessageProps> = ({ error, onRetry }) => {
  const [timeLeft, setTimeLeft] = useState(error.retryDelay);
  const [canRetry, setCanRetry] = useState(false);

  useEffect(() => {
    // Reset if error changes
    setTimeLeft(error.retryDelay);
    setCanRetry(false);
  }, [error]);

  useEffect(() => {
    if (timeLeft <= 0) {
      setCanRetry(true);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1000);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  const seconds = Math.ceil(timeLeft / 1000);

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm animate-fade-in">
        <div className="flex items-center gap-3">
            <div className="bg-red-100 p-2 rounded-full text-red-500">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            </div>
            <div>
                <p className="font-bold text-red-800 text-sm">{error.message}</p>
                <p className="text-xs text-red-600">
                    {canRetry ? "Ready to retry." : `Available in ${seconds}s...`}
                </p>
            </div>
        </div>
        
        <button 
            onClick={onRetry}
            disabled={!canRetry}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${
                canRetry 
                ? 'bg-red-500 text-white hover:bg-red-600 shadow-md transform hover:scale-105' 
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
        >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg>
            {canRetry ? "Retry Now" : `Wait ${seconds}s`}
        </button>
    </div>
  );
};
