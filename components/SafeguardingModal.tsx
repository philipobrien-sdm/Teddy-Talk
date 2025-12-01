import React, { useState, useEffect } from 'react';
import { SAFEGUARDING_RULES, INITIAL_MEMORY } from '../constants';
import { Memory } from '../types';

interface SafeguardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  memory: Memory;
  onUpdateMemory: (key: string, value: any, action: 'set') => void;
}

export const SafeguardingModal: React.FC<SafeguardingModalProps> = ({ isOpen, onClose, memory, onUpdateMemory }) => {
  const [activeTab, setActiveTab] = useState<'safeguarding' | 'settings' | 'speech'>('safeguarding');
  
  // Settings State
  const [childName, setChildName] = useState(memory.childName || '');
  const [childAge, setChildAge] = useState(memory.childAge || '');
  const [childGender, setChildGender] = useState(memory.childGender || '');
  const [ttsEngine, setTtsEngine] = useState<'gemini' | 'browser'>(memory.ttsEngine || 'gemini');

  // Speech Profile State
  const [targetWords, setTargetWords] = useState<string[]>(memory.targetWords || []);
  const [masteredWords, setMasteredWords] = useState<string[]>(memory.masteredWords || []);
  const [newTargetInput, setNewTargetInput] = useState('');
  const [newMasteredInput, setNewMasteredInput] = useState('');

  // Sync with memory when modal opens
  useEffect(() => {
    if (isOpen) {
        setChildName(memory.childName || '');
        setChildAge(memory.childAge || '');
        setChildGender(memory.childGender || '');
        setTtsEngine(memory.ttsEngine || 'gemini');
        setTargetWords(memory.targetWords || []);
        setMasteredWords(memory.masteredWords || []);
    }
  }, [isOpen, memory]);

  const handleSaveSettings = () => {
    onUpdateMemory('childName', childName, 'set');
    onUpdateMemory('childAge', childAge, 'set');
    onUpdateMemory('childGender', childGender, 'set');
    onUpdateMemory('ttsEngine', ttsEngine, 'set');
    onUpdateMemory('targetWords', targetWords, 'set');
    onUpdateMemory('masteredWords', masteredWords, 'set');
    onClose();
  };

  const addWord = (list: 'target' | 'mastered') => {
      if (list === 'target') {
          const val = newTargetInput.trim();
          if (val && !targetWords.includes(val)) {
              setTargetWords([...targetWords, val]);
              setNewTargetInput('');
          }
      } else {
          const val = newMasteredInput.trim();
          if (val && !masteredWords.includes(val)) {
              setMasteredWords([...masteredWords, val]);
              setNewMasteredInput('');
          }
      }
  };

  const removeWord = (list: 'target' | 'mastered', word: string) => {
      if (list === 'target') {
          setTargetWords(targetWords.filter(w => w !== word));
      } else {
          setMasteredWords(masteredWords.filter(w => w !== word));
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl max-w-lg w-full p-0 shadow-2xl border-4 border-amber-200 overflow-hidden relative flex flex-col max-h-[90vh]">
        
        {/* Tabs */}
        <div className="flex border-b border-gray-100">
             <button 
                onClick={() => setActiveTab('safeguarding')}
                className={`flex-1 py-4 font-bold text-xs sm:text-sm uppercase tracking-wider ${activeTab === 'safeguarding' ? 'bg-amber-50 text-amber-600 border-b-2 border-amber-500' : 'text-gray-400 hover:text-gray-600'}`}
             >
                 Safety
             </button>
             <button 
                onClick={() => setActiveTab('settings')}
                className={`flex-1 py-4 font-bold text-xs sm:text-sm uppercase tracking-wider ${activeTab === 'settings' ? 'bg-amber-50 text-amber-600 border-b-2 border-amber-500' : 'text-gray-400 hover:text-gray-600'}`}
             >
                 Settings
             </button>
             <button 
                onClick={() => setActiveTab('speech')}
                className={`flex-1 py-4 font-bold text-xs sm:text-sm uppercase tracking-wider ${activeTab === 'speech' ? 'bg-amber-50 text-amber-600 border-b-2 border-amber-500' : 'text-gray-400 hover:text-gray-600'}`}
             >
                 Speech Profile
             </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
            {activeTab === 'safeguarding' && (
                <>
                    <h2 className="text-xl font-bold text-amber-800 mb-4 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                        Safety Protocols
                    </h2>
                    <div className="prose prose-sm text-slate-700">
                        <p className="mb-4">
                            Teddy Talk is designed with strict safety instructions. The AI will:
                        </p>
                        <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 whitespace-pre-line leading-relaxed text-xs">
                            {SAFEGUARDING_RULES}
                        </div>
                    </div>
                </>
            )}

            {activeTab === 'settings' && (
                <div className="space-y-6">
                    <h2 className="text-xl font-bold text-amber-800 mb-2">Personalize the Experience</h2>
                    <p className="text-sm text-gray-500 mb-4">Providing these details helps the AI create better stories and appropriately leveled conversation.</p>
                    
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Child's Name</label>
                        <input 
                            type="text" 
                            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-amber-300 outline-none"
                            placeholder="e.g. Charlie"
                            value={childName}
                            onChange={(e) => setChildName(e.target.value)}
                        />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Age</label>
                            <input 
                                type="text" 
                                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-amber-300 outline-none"
                                placeholder="e.g. 5"
                                value={childAge}
                                onChange={(e) => setChildAge(e.target.value)}
                            />
                        </div>
                        <div>
                             <label className="block text-sm font-bold text-gray-700 mb-1">Gender (Optional)</label>
                             <select 
                                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-amber-300 outline-none bg-white"
                                value={childGender}
                                onChange={(e) => setChildGender(e.target.value)}
                             >
                                 <option value="">Prefer not to say</option>
                                 <option value="Boy">Boy</option>
                                 <option value="Girl">Girl</option>
                                 <option value="Non-binary">Non-binary</option>
                             </select>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-gray-100">
                        <label className="block text-sm font-bold text-gray-700 mb-3">Voice Settings</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setTtsEngine('gemini')}
                                className={`p-3 rounded-xl border-2 text-left transition-all ${ttsEngine === 'gemini' ? 'border-amber-400 bg-amber-50' : 'border-gray-200 hover:border-amber-200'}`}
                            >
                                <div className="font-bold text-amber-900 mb-1">✨ AI Voice</div>
                                <div className="text-xs text-gray-500">Realistic, emotional, requires internet.</div>
                            </button>
                            <button
                                onClick={() => setTtsEngine('browser')}
                                className={`p-3 rounded-xl border-2 text-left transition-all ${ttsEngine === 'browser' ? 'border-amber-400 bg-amber-50' : 'border-gray-200 hover:border-amber-200'}`}
                            >
                                <div className="font-bold text-amber-900 mb-1">⚡ Local Voice</div>
                                <div className="text-xs text-gray-500">Fast, works offline, robotic fun.</div>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'speech' && (
                <div className="space-y-6">
                    <h2 className="text-xl font-bold text-amber-800 mb-2">Speech Therapy Focus</h2>
                    <p className="text-sm text-gray-500 mb-4">Tell the AI which words to practice and which ones to use for encouragement.</p>

                    {/* Target Words Section */}
                    <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                        <label className="block text-sm font-bold text-red-800 mb-2">⚠️ Target Words (Needs Practice)</label>
                        <div className="flex gap-2 mb-3">
                            <input 
                                type="text"
                                className="flex-1 border border-red-200 rounded-lg p-2 focus:ring-2 focus:ring-red-300 outline-none text-sm"
                                placeholder="e.g. Rabbit, Yellow"
                                value={newTargetInput}
                                onChange={(e) => setNewTargetInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addWord('target')}
                            />
                            <button 
                                onClick={() => addWord('target')}
                                className="bg-red-500 text-white px-4 rounded-lg font-bold hover:bg-red-600"
                            >
                                +
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {targetWords.map(w => (
                                <span key={w} className="bg-white text-red-600 px-3 py-1 rounded-full text-sm border border-red-100 flex items-center gap-2">
                                    {w}
                                    <button onClick={() => removeWord('target', w)} className="hover:text-red-800 font-bold">×</button>
                                </span>
                            ))}
                            {targetWords.length === 0 && <span className="text-xs text-red-300 italic">No words added yet.</span>}
                        </div>
                    </div>

                    {/* Mastered Words Section */}
                    <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                        <label className="block text-sm font-bold text-green-800 mb-2">✅ Mastered Words (Confidence Boosters)</label>
                        <div className="flex gap-2 mb-3">
                            <input 
                                type="text"
                                className="flex-1 border border-green-200 rounded-lg p-2 focus:ring-2 focus:ring-green-300 outline-none text-sm"
                                placeholder="e.g. Mama, Ball"
                                value={newMasteredInput}
                                onChange={(e) => setNewMasteredInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addWord('mastered')}
                            />
                            <button 
                                onClick={() => addWord('mastered')}
                                className="bg-green-500 text-white px-4 rounded-lg font-bold hover:bg-green-600"
                            >
                                +
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {masteredWords.map(w => (
                                <span key={w} className="bg-white text-green-600 px-3 py-1 rounded-full text-sm border border-green-100 flex items-center gap-2">
                                    {w}
                                    <button onClick={() => removeWord('mastered', w)} className="hover:text-green-800 font-bold">×</button>
                                </span>
                            ))}
                             {masteredWords.length === 0 && <span className="text-xs text-green-300 italic">No words added yet.</span>}
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* Footer Buttons */}
        <div className="p-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50">
            <button 
                onClick={onClose}
                className="text-gray-500 px-4 py-2 hover:bg-gray-200 rounded-lg"
            >
                Close
            </button>
            {(activeTab === 'settings' || activeTab === 'speech') && (
                <button 
                    onClick={handleSaveSettings}
                    className="bg-amber-500 text-white px-6 py-2 rounded-lg font-bold hover:bg-amber-600 shadow-sm"
                >
                    Save Changes
                </button>
            )}
        </div>
      </div>
    </div>
  );
};