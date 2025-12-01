import React, { useState, useRef, useEffect } from 'react';
import { SpeechTask } from '../types';

interface TherapyPanelProps {
  task: SpeechTask | null;
  tasksList: SpeechTask[];
  onRecord: (blob: Blob) => Promise<void>;
  onStartNew: () => void;
  isLoading: boolean;
  onPlayTarget: () => void;
  onSaveTask: (taskId: string) => void;
  onLoadTask: (task: SpeechTask) => void;
}

export const TherapyPanel: React.FC<TherapyPanelProps> = ({ 
    task, 
    tasksList,
    onRecord, 
    onStartNew, 
    isLoading, 
    onPlayTarget,
    onSaveTask,
    onLoadTask 
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [showWordBank, setShowWordBank] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  // 10 seconds per attempt
  const GAME_DURATION = 10000; 

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const startGame = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        onRecord(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setTimeLeft(GAME_DURATION);

      const startTime = Date.now();
      timerRef.current = setInterval(() => {
          const elapsed = Date.now() - startTime;
          const remaining = Math.max(0, GAME_DURATION - elapsed);
          setTimeLeft(remaining);
          
          if (remaining <= 0) {
              stopGame();
          }
      }, 50);

    } catch (e) {
      console.error("Recording error", e);
      alert("Microphone access needed for the game!");
    }
  };

  const stopGame = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setTimeLeft(0);
  };

  const savedTasks = tasksList?.filter(t => t.isFavorite || t.status === 'review_needed') || [];

  // --- No Active Task: Selection Screen ---
  if (!task) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full relative">
        <button 
           onClick={() => setShowWordBank(true)}
           className="absolute top-0 left-4 text-amber-600 font-bold flex items-center gap-2 px-4 py-2 bg-amber-50 rounded-full border border-amber-200 shadow-sm hover:bg-amber-100"
        >
            <span>📖</span> Word Bank
        </button>

        <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm text-center border-2 border-amber-100 max-w-sm w-full mx-4">
           <h3 className="text-xl font-bold text-amber-800 mb-2">Ready to Practice?</h3>
           <p className="text-gray-600 mb-6">I'll help you practice words by making it a game!</p>
           <button 
             onClick={onStartNew}
             disabled={isLoading}
             className="bg-amber-500 text-white px-8 py-3 rounded-full font-bold text-lg shadow-lg hover:bg-amber-600 transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed w-full"
           >
             {isLoading ? 'Finding a word...' : "Find a Word"}
           </button>
        </div>

        {/* Word Bank Modal */}
        {showWordBank && (
            <div className="absolute inset-0 bg-white z-50 rounded-xl p-6 flex flex-col">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-amber-800">My Word Bank</h2>
                    <button onClick={() => setShowWordBank(false)} className="text-gray-400 text-2xl">×</button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2">
                    {savedTasks.length === 0 ? (
                        <p className="text-center text-gray-500 mt-10">No saved words yet. Play a game to save some!</p>
                    ) : (
                        savedTasks.map(t => (
                            <div key={t.id} className="flex justify-between items-center p-3 bg-amber-50 rounded-xl border border-amber-100">
                                <span className="font-bold text-lg text-slate-700">{t.word}</span>
                                <button 
                                  onClick={() => { onLoadTask(t); setShowWordBank(false); }}
                                  className="bg-white text-amber-600 px-3 py-1 rounded-lg border border-amber-200 text-sm font-medium hover:bg-amber-100"
                                >
                                    Practice
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        )}
      </div>
    );
  }

  const isMastered = task.status === 'mastered';
  const progressPercent = (timeLeft / GAME_DURATION) * 100;

  // --- Active Task Screen ---
  return (
    <div className="flex flex-col items-center h-full w-full max-w-lg mx-auto pt-2 sm:pt-4 px-2 min-h-0">
      
      {/* Target Word Card - Flex Shrink allowed */}
      <div className="bg-white w-full rounded-3xl shadow-lg border-b-4 border-amber-200 p-4 sm:p-6 text-center mb-4 relative overflow-hidden flex-shrink-0">
        <div className="absolute top-0 left-0 right-0 h-4 bg-amber-400"></div>
        
        {/* Back Button */}
        <button onClick={() => {onLoadTask(null as any)}} className="absolute top-4 left-4 text-gray-300 hover:text-gray-500">
            ← Back
        </button>

        <h2 className="text-gray-400 text-xs sm:text-sm font-bold tracking-widest uppercase mb-1 sm:mb-2">The Word is</h2>
        <h1 className="text-4xl sm:text-6xl font-black text-slate-800 mb-2 sm:mb-4 tracking-tight">{task.word}</h1>
        
        <button 
           onClick={onPlayTarget}
           disabled={isRecording}
           className="inline-flex items-center gap-2 text-amber-600 font-bold bg-amber-50 px-4 py-2 rounded-full hover:bg-amber-100 transition-colors disabled:opacity-50 text-sm sm:text-base"
        >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
            Hear it
        </button>
      </div>

      {/* Action Area - Grow to fill space */}
      <div className="w-full flex flex-col items-center justify-start flex-grow overflow-y-auto">
         {isMastered ? (
             <div className="text-center animate-bounce-in flex flex-col items-center justify-center h-full pb-4">
                 <div className="text-6xl mb-4">🎉</div>
                 <h3 className="text-2xl font-bold text-amber-800 mb-2">You did it!</h3>
                 
                 <div className="flex flex-col gap-3 mt-6 w-full max-w-xs">
                     <button 
                       onClick={onStartNew}
                       className="bg-amber-500 text-white px-8 py-3 rounded-full font-bold shadow-lg hover:bg-amber-600 transition-all"
                     >
                        Next Word
                     </button>
                     
                     <button 
                        onClick={() => onSaveTask(task.id)}
                        disabled={task.isFavorite}
                        className={`border-2 px-8 py-3 rounded-full font-bold shadow-sm transition-all flex items-center justify-center gap-2 ${task.isFavorite ? 'bg-red-50 border-red-200 text-red-300' : 'bg-white border-red-200 text-red-500 hover:bg-red-50'}`}
                     >
                        <span>{task.isFavorite ? '❤️ Saved' : '🤍 Save to Word Bank'}</span>
                     </button>
                 </div>
             </div>
         ) : (
            <>
                <div className="mb-2 sm:mb-4 text-center min-h-[4rem] flex flex-col items-center justify-center w-full px-4">
                   {isRecording ? (
                       <div className="w-full max-w-xs animate-fade-in">
                          <h2 className="text-xl sm:text-2xl font-black text-amber-600 mb-2 animate-pulse">
                              Say "{task.word}"!
                          </h2>
                          <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-red-500 transition-all ease-linear"
                                style={{ width: `${progressPercent}%` }}
                              />
                          </div>
                       </div>
                   ) : isLoading ? (
                       <p className="text-amber-600 italic text-xl">Listening & Thinking...</p>
                   ) : (
                       <p className="text-gray-500 text-sm sm:text-base">Press start and say the word <span className="font-bold text-amber-600">3 times</span>!</p>
                   )}
                </div>

                {!isRecording && !isLoading && (
                    <div className="flex flex-col gap-4 items-center w-full">
                        <button
                            onClick={startGame}
                            className="bg-amber-500 hover:bg-amber-600 text-white text-xl sm:text-2xl font-black px-8 sm:px-10 py-4 sm:py-6 rounded-3xl shadow-xl transition-transform hover:scale-105 active:scale-95 flex flex-col items-center w-full max-w-xs"
                        >
                            <span>{task.attempts > 0 ? "TRY AGAIN" : "START GAME"}</span>
                            <span className="text-xs sm:text-sm font-normal opacity-90 mt-1">You have {GAME_DURATION/1000} seconds!</span>
                        </button>

                        {/* Skip Button - Only appears after 3 attempts */}
                        {task.attempts >= 3 && (
                            <button 
                                onClick={onStartNew}
                                className="text-gray-400 font-bold hover:text-amber-500 transition-colors text-sm underline"
                            >
                                This one is tricky. Skip to next word?
                            </button>
                        )}
                    </div>
                )}
                
                {isRecording && (
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-red-100 flex items-center justify-center animate-pulse">
                         <div className="w-14 h-14 sm:w-16 sm:h-16 bg-red-500 rounded-full"></div>
                    </div>
                )}
            </>
         )}
      </div>
    </div>
  );
};