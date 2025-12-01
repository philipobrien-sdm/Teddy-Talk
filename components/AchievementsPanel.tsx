import React from 'react';
import { ACHIEVEMENTS_LIST, SPEECH_TREE } from '../constants';
import { Memory } from '../types';

interface AchievementsPanelProps {
  memory: Memory;
  onPracticeSound: (phoneme: string) => void;
}

export const AchievementsPanel: React.FC<AchievementsPanelProps> = ({ memory, onPracticeSound }) => {
  const unlockedIds = new Set(memory.achievements?.map(a => a.id) || []);

  // Calculate Sound Stars
  const renderSoundStars = () => {
    return Object.entries(SPEECH_TREE).map(([groupName, groupData]) => (
      <div key={groupName} className="mb-6">
        <h3 className="text-amber-800 font-bold mb-3 flex items-center gap-2">
            <span>🎵</span> {groupName}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Object.entries(groupData.phonemes).map(([phoneme, examples]) => {
            const stats = memory.phonemeStats?.[phoneme];
            const tasks = memory.speechTasks || [];
            
            // Star Logic
            let stars = 0;
            if (stats && stats.attempts > 0) {
                // Base: 1 star for trying
                stars = 1;
                
                // +1 star for > 30% success rate (encouragement)
                if ((stats.success / stats.attempts) > 0.3) stars += 1;
                
                // +1 star for > 70% success rate (proficiency)
                if ((stats.success / stats.attempts) > 0.7) stars += 1;

                // +1 star for Mastering at least 1 word with this phoneme
                const masteredCount = tasks.filter(t => t.targetPhoneme === phoneme && t.status === 'mastered').length;
                if (masteredCount >= 1) stars += 1;
                
                // +1 star for Mastering >= 3 words (Expert)
                if (masteredCount >= 3) stars += 1;
            }

            return (
              <button 
                key={phoneme} 
                onClick={() => onPracticeSound(phoneme)}
                className="bg-white p-3 rounded-2xl shadow-sm border border-amber-100 flex flex-col items-center transition-all hover:scale-105 hover:shadow-md hover:border-amber-300 active:scale-95 text-left w-full group"
              >
                <div className="flex justify-between w-full items-start">
                    <div className="text-2xl font-black text-amber-500 mb-1">{phoneme}</div>
                    <div className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-bold opacity-0 group-hover:opacity-100 transition-opacity">Train</div>
                </div>
                <div className="flex gap-0.5 mb-2">
                    {[1, 2, 3, 4, 5].map(i => (
                        <span key={i} className={`text-sm ${i <= stars ? 'text-yellow-400' : 'text-gray-200'}`}>★</span>
                    ))}
                </div>
                <div className="text-[10px] text-gray-400 text-center w-full">
                    {stars === 0 ? "Tap to try!" : stars === 5 ? "MASTER!" : "Keep going!"}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    ));
  };

  return (
    <div className="w-full h-full flex flex-col items-center p-2 sm:p-4 max-w-2xl mx-auto animate-fade-in-up overflow-y-auto scrollbar-hide">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-400 to-orange-400 w-full p-6 rounded-3xl shadow-lg text-white mb-6 text-center relative overflow-hidden flex-shrink-0">
            <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]"></div>
            <h2 className="text-3xl font-black mb-1 drop-shadow-md">My Trophy Room</h2>
            <p className="text-amber-100 font-medium">You are doing great!</p>
        </div>

        {/* Trophies Grid */}
        <div className="w-full mb-8 flex-shrink-0">
            <h3 className="text-amber-800 font-bold mb-3 pl-2">🏆 Big Wins</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {ACHIEVEMENTS_LIST.map(ach => {
                    const isUnlocked = unlockedIds.has(ach.id);
                    return (
                        <div 
                            key={ach.id} 
                            className={`p-4 rounded-2xl flex flex-col items-center text-center transition-all duration-500 ${isUnlocked ? 'bg-white shadow-md border-b-4 border-yellow-300 scale-100' : 'bg-gray-100 opacity-60 scale-95 grayscale'}`}
                        >
                            <div className={`text-4xl mb-2 ${isUnlocked ? 'animate-bounce-slow' : ''}`}>{ach.icon}</div>
                            <div className={`font-bold text-sm leading-tight ${isUnlocked ? 'text-slate-800' : 'text-gray-400'}`}>{ach.title}</div>
                            {isUnlocked && <div className="text-[10px] text-gray-500 mt-1">{ach.description}</div>}
                            {!isUnlocked && <div className="text-[10px] text-gray-400 mt-1">Locked</div>}
                        </div>
                    );
                })}
            </div>
        </div>

        {/* Sound Mastery */}
        <div className="w-full">
            <h3 className="text-amber-800 font-bold mb-3 pl-2">⭐ Sound Stars</h3>
            {renderSoundStars()}
        </div>
        
    </div>
  );
};