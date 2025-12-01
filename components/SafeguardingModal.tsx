import React, { useState, useEffect, useRef } from 'react';
import { SAFEGUARDING_RULES, INITIAL_MEMORY, SPEECH_TREE } from '../constants';
import { Memory, SpeechTask } from '../types';
import { geminiService } from '../services/geminiService';
import { generateHtmlReport } from '../services/reportGenerator';

interface SafeguardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  memory: Memory;
  onUpdateMemory: (key: string, value: any, action: 'set') => void;
}

export const SafeguardingModal: React.FC<SafeguardingModalProps> = ({ isOpen, onClose, memory, onUpdateMemory }) => {
  const [activeTab, setActiveTab] = useState<'about' | 'safeguarding' | 'settings' | 'speech' | 'reports'>('about');
  
  // Settings State
  const [childName, setChildName] = useState(memory.childName || '');
  const [childAge, setChildAge] = useState(memory.childAge || '');
  const [childGender, setChildGender] = useState(memory.childGender || '');
  const [ttsEngine, setTtsEngine] = useState<'gemini' | 'browser'>(memory.ttsEngine || 'gemini');

  // Audio Test State
  const [isTestingAudio, setIsTestingAudio] = useState(false);
  const [testResult, setTestResult] = useState<{ text: string; quality: string; issues: string } | null>(null);
  const [testAudioUrl, setTestAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

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

  const handleExportReport = () => {
      const html = generateHtmlReport(memory);
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TeddyTalk-Report-${new Date().toLocaleDateString().replace(/\//g, '-')}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  // --- Audio Test Logic ---
  const handleStartMicTest = async () => {
      setTestResult(null);
      setTestAudioUrl(null);
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          // Explicitly use opus if available to prevent grunt/troll voice issue
          let options: MediaRecorderOptions = {};
          if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            options = { mimeType: 'audio/webm;codecs=opus' };
          } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            options = { mimeType: 'audio/webm' };
          }

          const recorder = new MediaRecorder(stream, options);
          mediaRecorderRef.current = recorder;
          audioChunksRef.current = [];

          recorder.ondataavailable = (e) => {
              if (e.data.size > 0) audioChunksRef.current.push(e.data);
          };

          recorder.onstop = async () => {
              const audioBlob = new Blob(audioChunksRef.current, { type: options.mimeType });
              const audioUrl = URL.createObjectURL(audioBlob);
              setTestAudioUrl(audioUrl);
              stream.getTracks().forEach(track => track.stop()); // Stop mic
              
              // Convert to base64 for AI
              const reader = new FileReader();
              reader.readAsDataURL(audioBlob);
              reader.onloadend = async () => {
                  const base64data = (reader.result as string).split(',')[1];
                  // Send to AI
                  const analysis = await geminiService.testAudioInput(base64data);
                  setTestResult(analysis);
                  setIsTestingAudio(false);
              };
          };

          recorder.start();
          setIsTestingAudio(true);

          // Stop automatically after 5 seconds
          setTimeout(() => {
              if (recorder.state === 'recording') {
                  recorder.stop();
              }
          }, 5000);

      } catch (e) {
          console.error("Mic Access Error", e);
          alert("Could not access microphone. Please check permissions.");
          setIsTestingAudio(false);
      }
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

  const getUrgencyColor = (urgency?: string) => {
      if (urgency === 'high') return 'bg-red-100 text-red-800 border-red-200';
      if (urgency === 'medium') return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      if (urgency === 'low') return 'bg-green-100 text-green-800 border-green-200';
      return 'bg-gray-100 text-gray-800 border-gray-200';
  };
  
  // Calculate Stats for Report
  const getPhonemeStats = () => {
      const stats: Record<string, { attempts: number; mastered: number }> = {};
      (memory.speechTasks || []).forEach(t => {
          if(!t.targetPhoneme) return;
          if(!stats[t.targetPhoneme]) stats[t.targetPhoneme] = { attempts: 0, mastered: 0 };
          stats[t.targetPhoneme].attempts++;
          if(t.status === 'mastered') stats[t.targetPhoneme].mastered++;
      });
      return stats;
  };

  if (!isOpen) return null;

  const phonemeStats = getPhonemeStats();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl max-w-lg w-full p-0 shadow-2xl border-4 border-amber-200 overflow-hidden relative flex flex-col max-h-[90vh]">
        
        {/* Tabs */}
        <div className="flex border-b border-gray-100 bg-gray-50">
             <button 
                onClick={() => setActiveTab('about')}
                className={`flex-1 py-4 font-bold text-xs sm:text-xs uppercase tracking-wider transition-colors ${activeTab === 'about' ? 'bg-white text-amber-600 border-b-2 border-amber-500 shadow-sm' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
             >
                 About
             </button>
             <button 
                onClick={() => setActiveTab('safeguarding')}
                className={`flex-1 py-4 font-bold text-xs sm:text-xs uppercase tracking-wider transition-colors ${activeTab === 'safeguarding' ? 'bg-white text-amber-600 border-b-2 border-amber-500 shadow-sm' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
             >
                 Safety
             </button>
             <button 
                onClick={() => setActiveTab('settings')}
                className={`flex-1 py-4 font-bold text-xs sm:text-xs uppercase tracking-wider transition-colors ${activeTab === 'settings' ? 'bg-white text-amber-600 border-b-2 border-amber-500 shadow-sm' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
             >
                 Settings
             </button>
             <button 
                onClick={() => setActiveTab('speech')}
                className={`flex-1 py-4 font-bold text-xs sm:text-xs uppercase tracking-wider transition-colors ${activeTab === 'speech' ? 'bg-white text-amber-600 border-b-2 border-amber-500 shadow-sm' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
             >
                 Inputs
             </button>
             <button 
                onClick={() => setActiveTab('reports')}
                className={`flex-1 py-4 font-bold text-xs sm:text-xs uppercase tracking-wider transition-colors ${activeTab === 'reports' ? 'bg-white text-amber-600 border-b-2 border-amber-500 shadow-sm' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
             >
                 Reports
             </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
            {activeTab === 'about' && (
                <div className="space-y-6">
                    <div className="text-center mb-6">
                        <div className="text-6xl mb-2">🧸</div>
                        <h2 className="text-2xl font-black text-amber-800">Welcome to Teddy Talk!</h2>
                        <p className="text-gray-500 text-sm">Your child's new magical best friend.</p>
                    </div>

                    <div className="space-y-4">
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                            <h3 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
                                <span>👋</span> What is this?
                            </h3>
                            <p className="text-sm text-slate-700 leading-relaxed">
                                Teddy Talk is an interactive AI companion designed to help children practice speech, storytelling, and social conversation in a safe, judgment-free environment.
                            </p>
                        </div>

                        <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                            <h3 className="font-bold text-green-900 mb-2 flex items-center gap-2">
                                <span>⚙️</span> How does it work?
                            </h3>
                            <ul className="text-sm text-slate-700 space-y-2 list-disc pl-4">
                                <li><strong>Smart Chat:</strong> The character uses advanced AI to understand what your child says and replies with personality.</li>
                                <li><strong>Speech Coach:</strong> In "Practice Mode", the AI listens to pronunciation and gives gentle, fun feedback to help master tricky sounds.</li>
                                <li><strong>Storyteller:</strong> It creates unique adventures where your child decides what happens next!</li>
                            </ul>
                        </div>

                        <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                            <h3 className="font-bold text-amber-900 mb-2 flex items-center gap-2">
                                <span>🔒</span> Privacy & Saving
                            </h3>
                            <p className="text-sm text-slate-700 leading-relaxed mb-2">
                                <strong>We respect your privacy.</strong>
                            </p>
                            <ul className="text-sm text-slate-700 space-y-2 list-disc pl-4">
                                <li>All chat history and progress are stored <strong>locally on this device</strong> using your browser's storage (LocalStorage), allowing you to resume where you left off.</li>
                                <li>If you clear your browser data, you might lose progress. Use the "Save Memory" button (floppy disk icon) to download a backup!</li>
                                <li>Audio is sent securely to Google's AI for processing but is not saved by us.</li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}

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

                    {/* Microphone Check Section */}
                    <div className="pt-4 border-t border-gray-100">
                        <label className="block text-sm font-bold text-gray-700 mb-3">Microphone Check & Calibration</label>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-sm text-slate-600">Troubleshooting corrupted audio? Record a 5s test.</span>
                                {isTestingAudio && <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full animate-pulse">● Recording...</span>}
                            </div>
                            
                            {!testResult && !isTestingAudio && (
                                <button 
                                    onClick={handleStartMicTest}
                                    className="w-full py-2 bg-white border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-100 shadow-sm"
                                >
                                    🎙️ Record 5s Test
                                </button>
                            )}
                            
                            {isTestingAudio && (
                                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                                    <div className="bg-red-500 h-full animate-[width_5s_linear_forwards]" style={{width: '0%', animationName: 'grow', animationDuration: '5s'}}></div>
                                    <style>{`@keyframes grow { from { width: 0%; } to { width: 100%; } }`}</style>
                                </div>
                            )}

                            {/* Results Display */}
                            {testAudioUrl && !isTestingAudio && (
                                <div className="mt-3 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <audio controls src={testAudioUrl} className="w-full h-8" />
                                    </div>
                                    {testResult ? (
                                        <div className="text-xs space-y-2 bg-white p-3 rounded-lg border border-slate-200">
                                            <div className="flex justify-between">
                                                <span className="font-bold text-slate-700">AI Transcript:</span>
                                                <span className={`px-2 py-0.5 rounded-full ${testResult.quality === 'Clean' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{testResult.quality}</span>
                                            </div>
                                            <p className="italic text-slate-600">"{testResult.text}"</p>
                                            {testResult.issues && testResult.issues !== "None" && (
                                                <div className="text-red-600">
                                                    <strong>Issues:</strong> {testResult.issues}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-center text-xs text-slate-500 italic">Analyzing audio with AI...</div>
                                    )}
                                    <button onClick={handleStartMicTest} className="text-xs text-blue-500 underline w-full text-center">Test Again</button>
                                </div>
                            )}
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

            {activeTab === 'reports' && (
                <div className="space-y-6">
                    <div className="flex justify-between items-center mb-2">
                        <h2 className="text-xl font-bold text-amber-800">Progress Report</h2>
                        <button 
                            onClick={handleExportReport}
                            className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-full border border-blue-200 hover:bg-blue-100 flex items-center gap-1 font-bold"
                        >
                            <span>📥</span> Export HTML
                        </button>
                    </div>
                    <p className="text-sm text-gray-500 mb-4">Insights generated by AI from practice sessions.</p>
                    
                    {/* Baseline Summary */}
                    {memory.baseline && (
                        <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 mb-6">
                            <h3 className="font-bold text-purple-900 mb-2 flex items-center gap-2">
                                <span>🎯</span> Baseline Assessment
                            </h3>
                            <p className="text-sm text-purple-800 mb-2 italic">"{memory.baseline.summary}"</p>
                            <div className="flex gap-2 text-xs">
                                <span className="bg-white px-2 py-1 rounded border border-purple-200 text-purple-700">Recommended Start: <strong>{memory.baseline.recommendedStartingPoint}</strong></span>
                                <span className="bg-white px-2 py-1 rounded border border-purple-200 text-purple-700">Date: {new Date(memory.baseline.date).toLocaleDateString()}</span>
                            </div>
                        </div>
                    )}

                    {/* Sound Mastery Profile */}
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-6">
                         <h3 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
                            <span>📊</span> Sound Mastery Profile
                         </h3>
                         <div className="space-y-4">
                             {Object.entries(SPEECH_TREE).map(([groupName, groupData]) => (
                                 <div key={groupName} className="bg-white p-3 rounded-lg shadow-sm">
                                     <div className="flex justify-between items-center mb-1">
                                         <span className="text-sm font-bold text-slate-700">{groupName}</span>
                                         <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{groupData.description}</span>
                                     </div>
                                     <div className="flex flex-wrap gap-2">
                                         {Object.keys(groupData.phonemes).map(ph => {
                                             const stats = phonemeStats[ph];
                                             const hasData = stats && stats.attempts > 0;
                                             const mastery = hasData ? stats.mastered / stats.attempts : 0;
                                             
                                             let colorClass = "bg-gray-100 text-gray-400 border-gray-200"; // No Data
                                             if (hasData) {
                                                 if (mastery > 0.7) colorClass = "bg-green-100 text-green-700 border-green-200";
                                                 else if (mastery > 0.3) colorClass = "bg-yellow-100 text-yellow-700 border-yellow-200";
                                                 else colorClass = "bg-red-100 text-red-700 border-red-200";
                                             }

                                             return (
                                                 <div key={ph} className={`px-2 py-1 rounded text-xs font-bold border ${colorClass} flex flex-col items-center min-w-[30px]`}>
                                                     <span>{ph}</span>
                                                     {hasData && <div className="h-1 w-full bg-white/50 mt-1 rounded-full overflow-hidden"><div className="h-full bg-current" style={{width: `${mastery * 100}%`}}></div></div>}
                                                 </div>
                                             );
                                         })}
                                     </div>
                                 </div>
                             ))}
                         </div>
                    </div>

                    {/* Detailed Task List */}
                    {(!memory.speechTasks || memory.speechTasks.length === 0) ? (
                        <div className="text-center p-8 border-2 border-dashed border-gray-200 rounded-xl">
                            <p className="text-gray-400">No practice sessions recorded yet.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {memory.speechTasks.filter(t => t.report || t.status === 'review_needed' || t.status === 'mastered').map((task) => (
                                <div key={task.id} className="bg-white border border-amber-100 rounded-xl p-4 shadow-sm">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <h3 className="text-lg font-bold text-slate-800 capitalize">{task.word}</h3>
                                            <div className="flex gap-2 mt-1">
                                                <span className={`text-xs px-2 py-0.5 rounded-full border ${getUrgencyColor(task.urgency)}`}>
                                                    Priority: {task.urgency?.toUpperCase() || 'UNKNOWN'}
                                                </span>
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                                    Status: {task.status.replace('_', ' ')}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs text-gray-400">Attempts: {task.attempts}</span>
                                        </div>
                                    </div>
                                    
                                    {task.report ? (
                                        <div className="text-sm space-y-2 bg-slate-50 p-3 rounded-lg">
                                            {task.report.strengths && (
                                                <div className="flex gap-2 items-start">
                                                    <span className="text-green-500 shrink-0">✅</span>
                                                    <span className="text-slate-600"><strong className="text-slate-800">Strengths:</strong> {task.report.strengths}</span>
                                                </div>
                                            )}
                                            {task.report.needsWork && (
                                                <div className="flex gap-2 items-start">
                                                    <span className="text-red-400 shrink-0">⚠️</span>
                                                    <span className="text-slate-600"><strong className="text-slate-800">Needs Work:</strong> {task.report.needsWork}</span>
                                                </div>
                                            )}
                                            {task.report.howToHelp && (
                                                <div className="flex gap-2 items-start mt-2 pt-2 border-t border-slate-200">
                                                    <span className="text-blue-400 shrink-0">💡</span>
                                                    <span className="text-slate-600"><strong className="text-slate-800">Tip:</strong> {task.report.howToHelp}</span>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-gray-400 italic">Not enough data for a detailed report yet.</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
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