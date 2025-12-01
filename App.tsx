import React, { useState, useRef, useEffect } from 'react';
import { CharacterAvatar } from './components/CharacterAvatar';
import { ChatBubble } from './components/ChatBubble';
import { TherapyPanel } from './components/TherapyPanel';
import { StoryPanel } from './components/StoryPanel';
import { SafeguardingModal } from './components/SafeguardingModal';
import { geminiService } from './services/geminiService';
import { browserTtsService } from './services/browserTtsService';
import { Memory, ChatMessage, TeddyMood, AppState, CharacterProfile, CharacterType, CharacterStyle, AppMode, SpeechTask, StoryState } from './types';
import { INITIAL_MEMORY } from './constants';

const pcmToAudioBuffer = (
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000
): AudioBuffer => {
  const pcm16 = new Int16Array(data.buffer);
  const frameCount = pcm16.length;
  const audioBuffer = ctx.createBuffer(1, frameCount, sampleRate);
  const channelData = audioBuffer.getChannelData(0);
  
  for (let i = 0; i < frameCount; i++) {
    channelData[i] = pcm16[i] / 32768.0;
  }
  
  return audioBuffer;
};

const createWavBlob = (pcmData: Uint8Array, sampleRate: number = 24000): Blob => {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmData.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  
  // Write audio data
  const dataView = new Uint8Array(buffer, 44);
  dataView.set(pcmData);

  return new Blob([buffer], { type: 'audio/wav' });
};

const INITIAL_STORY_STATE: StoryState = {
    hasStarted: false,
    theme: '',
    hero: '',
    animal: '',
    items: { item1: '', item2: '', item3: '' },
    availableItems: [],
    segments: []
};

const App: React.FC = () => {
  // --- State ---
  const [character, setCharacter] = useState<CharacterProfile | null>(null);
  const [mode, setMode] = useState<AppMode>('landing');
  const [hasPlayedGreeting, setHasPlayedGreeting] = useState(false);
  
  // Selection State
  const [selectedType, setSelectedType] = useState<CharacterType>('teddy');
  const [selectedStyle, setSelectedStyle] = useState<CharacterStyle>('neutral');
  const [setupStep, setSetupStep] = useState<'type' | 'style'>('type');

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [memory, setMemory] = useState<Memory>(INITIAL_MEMORY);
  
  // Story State (Lifted up for persistence)
  const [storyState, setStoryState] = useState<StoryState>(INITIAL_STORY_STATE);
  
  // Speech Therapy State
  const [activeTask, setActiveTask] = useState<SpeechTask | null>(null);
  
  // Emotional State Logic
  const [baseMood, setBaseMood] = useState<TeddyMood>(TeddyMood.HAPPY);
  const [activity, setActivity] = useState<'idle' | 'thinking' | 'talking'>('idle');

  const displayMood = (() => {
    if (activity === 'thinking') return TeddyMood.THINKING;
    if (activity === 'talking') return TeddyMood.TALKING;
    return baseMood; 
  })();

  const [showSafeguarding, setShowSafeguarding] = useState(false);
  const [pendingHistory, setPendingHistory] = useState<ChatMessage[] | null>(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentAudioSource = useRef<AudioBufferSourceNode | null>(null);

  const getCharacterVoice = (char?: CharacterProfile): string => {
      const c = char || character;
      if (!c) return 'Puck';
      if (c.style === 'hairbow' || c.type === 'unicorn') return 'Kore';
      if (c.style === 'bowtie' || c.type === 'dragon') return 'Fenrir';
      return 'Puck';
  };

  const lastAiMessage = messages.filter(m => m.role === 'model').slice(-1)[0]?.text;

  // Auto-scroll
  useEffect(() => {
    if (mode === 'chat' && messages.length > 0) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping, mode]); 

  // Initialize Speech Recognition
  useEffect(() => {
    const { webkitSpeechRecognition, SpeechRecognition } = window as any;
    const SpeechAPI = webkitSpeechRecognition || SpeechRecognition;
    
    if (SpeechAPI) {
      recognitionRef.current = new SpeechAPI();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onstart = () => setIsListening(true);
      recognitionRef.current.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        setInputText(transcript);
      };
      recognitionRef.current.onend = () => setIsListening(false);
      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech Recognition Error", event.error);
        setIsListening(false);
      };
    }
  }, []);

  const initAudioContext = () => {
    if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
    }
  };

  const stopCurrentAudio = () => {
    // Stop Gemini Audio
    if (currentAudioSource.current) {
      try {
        currentAudioSource.current.stop();
        currentAudioSource.current.disconnect();
      } catch (e) { console.warn(e); }
      currentAudioSource.current = null;
    }
    // Stop Browser Audio
    browserTtsService.stop();
    
    setActivity('idle');
  };

  // Helper to handle speech generation based on preference
  const speakText = async (text: string, charOverride?: CharacterProfile) => {
    const char = charOverride || character;
    if (!text || !char) return;

    stopCurrentAudio();
    
    // Check Engine Preference (Default to Gemini if not set)
    const engine = memory.ttsEngine || 'gemini';

    if (engine === 'browser') {
        setActivity('talking');
        browserTtsService.speak(
            text, 
            char.type, 
            () => { /* started */ },
            () => { 
                // Ensure we only set to idle if we are still 'talking' (haven't been interrupted)
                setActivity((prev) => prev === 'talking' ? 'idle' : prev); 
            }
        );
    } else {
        const voice = getCharacterVoice(char);
        const audioData = await geminiService.generateSpeech(text, voice);
        if (audioData) {
            playAudioBuffer(audioData);
        } else {
            setActivity('idle');
        }
    }
  };

  const playAudioBuffer = async (pcmData: Uint8Array) => {
    try {
      if (!audioContextRef.current) initAudioContext();
      const ctx = audioContextRef.current!;
      const audioBuffer = pcmToAudioBuffer(pcmData, ctx);
      
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => {
        if (currentAudioSource.current === source) {
            setActivity('idle');
            currentAudioSource.current = null;
        }
      };
      currentAudioSource.current = source;
      setActivity('talking');
      source.start(0);
    } catch (error) {
      console.error("Audio Playback Error:", error);
      setActivity('idle');
    }
  };

  const toggleListening = () => {
    initAudioContext();
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      stopCurrentAudio();
      if (recognitionRef.current) {
        setInputText('');
        try { recognitionRef.current.start(); } catch(e) { console.error(e); }
      } else {
        alert("Speech recognition is not supported in this browser.");
      }
    }
  };

  const handleManualPlay = async (text: string) => {
    initAudioContext();
    setActivity('thinking');
    await speakText(text);
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || !character) return;
    if (isTyping) return;
    
    initAudioContext();
    stopCurrentAudio();
    if (isListening) recognitionRef.current?.stop();

    const userMsg: ChatMessage = { role: 'user', text: inputText, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);
    setActivity('thinking');

    const responseText = await geminiService.sendMessage(
      messages, 
      userMsg.text,
      memory,
      character,
      updateMemoryState,
      updateCharacterName,
      updateMood
    );

    const modelMsg: ChatMessage = { role: 'model', text: responseText, timestamp: Date.now() };
    setMessages(prev => [...prev, modelMsg]);
    setIsTyping(false);

    await speakText(responseText);
  };

  const updateMemoryState = (key: string, value: any, action: 'set' | 'add') => {
    setMemory(prev => {
      const newMemory = { ...prev };
      if (action === 'set') {
        newMemory[key] = value;
      } else if (action === 'add') {
        if (!Array.isArray(newMemory[key])) {
          newMemory[key] = newMemory[key] ? [newMemory[key]] : [];
        }
        if (!newMemory[key].includes(value)) {
          newMemory[key] = [...newMemory[key], value];
        }
      }
      return newMemory;
    });
  };

  const updateCharacterName = (newName: string) => {
    setCharacter(prev => prev ? { ...prev, name: newName } : null);
  };
  const updateMood = (newMood: TeddyMood) => {
    setBaseMood(newMood);
  };

  // --- Story Logic ---
  const handleUpdateStoryState = (updates: Partial<StoryState>) => {
      setStoryState(prev => ({ ...prev, ...updates }));
  };

  const handleStartStory = async (inputs: { theme: string; hero: string; animal: string; items: string[] }) => {
    initAudioContext();
    stopCurrentAudio();
    setActivity('thinking');
    
    // Reset but keep inputs
    const newState: StoryState = {
        hasStarted: true,
        theme: inputs.theme,
        hero: inputs.hero,
        animal: inputs.animal,
        items: { item1: inputs.items[0], item2: inputs.items[1], item3: inputs.items[2] },
        availableItems: inputs.items,
        segments: []
    };
    setStoryState(newState);

    const intro = await geminiService.generateStoryIntro(inputs, memory);
    
    setStoryState(prev => ({ ...prev, segments: [intro] }));
    await speakText(intro);
  };

  const handleContinueStory = async (item: string, remainingItems: string[]) => {
      initAudioContext();
      stopCurrentAudio();
      setActivity('thinking');

      const fullContext = storyState.segments.join(' ');
      let nextSegment = '';

      if (remainingItems.length > 0) {
          // Mid-story chapter
          nextSegment = await geminiService.generateStoryChapter(fullContext, item, remainingItems);
      } else {
          // Conclusion
          nextSegment = await geminiService.generateStoryConclusion(fullContext, item);
      }
      
      setStoryState(prev => ({
          ...prev,
          availableItems: remainingItems,
          segments: [...prev.segments, nextSegment]
      }));
      await speakText(nextSegment);
  };

  const handleResetStory = () => {
    setStoryState(INITIAL_STORY_STATE);
  };

  const handleDownloadStoryAudio = async () => {
    if (storyState.segments.length === 0) return;
    setActivity('thinking');
    
    const voice = getCharacterVoice();
    const allAudio: Uint8Array[] = [];
    
    // Process segments sequentially using GEMINI always for download quality
    for (const segment of storyState.segments) {
        const audio = await geminiService.generateSpeech(segment, voice, 4000); // Increased limit
        if (audio) {
            allAudio.push(audio);
        }
    }

    if (allAudio.length === 0) {
        setActivity('idle');
        alert("Could not generate audio.");
        return;
    }

    // Combine all audio buffers
    const totalLength = allAudio.reduce((acc, curr) => acc + curr.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of allAudio) {
        combined.set(arr, offset);
        offset += arr.length;
    }

    // Create WAV
    const blob = createWavBlob(combined);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${storyState.hero}-adventure.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    setActivity('idle');
  };

  // --- Therapy Logic ---
  const handleStartTherapyTask = async () => {
      setActivity('thinking');
      const newTask = await geminiService.generateTherapyTask(memory);
      
      setMemory(prev => ({
          ...prev,
          speechTasks: [...(prev.speechTasks || []), newTask]
      }));
      setActiveTask(newTask);

      const intro = `Let's practice the word ${newTask.word}! Say it with me: ${newTask.word}`;
      await speakText(intro);
  };

  const handleTherapyRecord = async (audioBlob: Blob) => {
      if (!activeTask || !character) return;
      setActivity('thinking');
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
          const base64data = (reader.result as string).split(',')[1];
          const feedback = await geminiService.assessPronunciation(
              base64data,
              activeTask,
              character,
              updateMood,
              (taskId, status, note) => {
                  const updatedTask = { ...activeTask, status: status as any, attempts: activeTask.attempts + 1 };
                  setActiveTask(updatedTask);
                  setMemory(prev => ({
                      ...prev,
                      speechTasks: prev.speechTasks?.map(t => t.id === taskId ? updatedTask : t)
                  }));
              }
          );
          
          // Updated Logic: Only 'mastered' is a hard stop. Otherwise, we just increment attempts and append history.
          // We do NOT force 'review_needed' after 3 attempts anymore, allowing infinite retries.
          // The UI will show a skip button after 3 attempts.
          if (activeTask.status !== 'mastered') {
               const newAttempts = activeTask.attempts + 1;
               const updatedTask = { 
                   ...activeTask, 
                   attempts: newAttempts, 
                   // Keep status as in_progress unless mastered, or if the model explicitly set it to something else
                   status: activeTask.status === 'mastered' ? 'mastered' : 'in_progress', 
                   history: [...activeTask.history, feedback] 
               };
               setActiveTask(updatedTask);
               setMemory(prev => ({
                   ...prev,
                   speechTasks: prev.speechTasks?.map(t => t.id === activeTask.id ? updatedTask : t)
               }));
          }

          await speakText(feedback);
      };
  };

  const handleSaveTherapyTask = (taskId: string) => {
      setMemory(prev => ({
          ...prev,
          speechTasks: prev.speechTasks?.map(t => t.id === taskId ? { ...t, isFavorite: true } : t)
      }));
      if (activeTask && activeTask.id === taskId) {
          setActiveTask(prev => prev ? { ...prev, isFavorite: true } : null);
      }
      setBaseMood(TeddyMood.EXCITED); // Visual feedback
  };

  const handleLoadTask = (task: SpeechTask | null) => {
      setActiveTask(task);
      setActivity('idle');
  };

  // --- Persistence ---
  const handleSelectCharacter = async () => {
      initAudioContext();
      const typeStr = selectedType.charAt(0).toUpperCase() + selectedType.slice(1);
      const newCharacter: CharacterProfile = { type: selectedType, style: selectedStyle, name: typeStr };
      setCharacter(newCharacter);
      
      const initialText = `Hi friend! I am so happy to meet you! I'm a ${selectedType}, but I don't have a name yet. What should my name be?`;
      setMessages([{ role: 'model', text: initialText, timestamp: Date.now() }]);
      
      // Removed immediate speakText call
      setHasPlayedGreeting(false);
  };

  const handleSaveState = () => {
    if(!character) return;
    const state: AppState = { memory, chatHistory: messages, character, storyState };
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `teddy-memory-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleLoadState = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string) as AppState;
        if (json.memory && json.chatHistory && json.character) {
          setCharacter(json.character);
          setMemory(json.memory);
          setPendingHistory(json.chatHistory);
          setStoryState(json.storyState || INITIAL_STORY_STATE);
          setMessages([]);
          setHasPlayedGreeting(true); // Don't play greeting for loaded state
        } else {
          alert("This memory file looks a bit fuzzy. I couldn't read it!");
        }
      } catch (err) {
        console.error("Failed to parse JSON", err);
        alert("Oh no! I couldn't open that memory.");
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleResumeChoice = async (choice: 'continue' | 'new') => {
      if (!character || !pendingHistory) return;
      initAudioContext();
      setActivity('thinking');
      const historyToUse = choice === 'continue' ? pendingHistory : [];
      setPendingHistory(null);
      if (choice === 'continue') setMessages(historyToUse);
      else setMessages([]);

      setIsTyping(true);
      let responseText = "";
      if (choice === 'continue') {
        responseText = await geminiService.resumeSession(historyToUse, memory, character, updateMemoryState, updateCharacterName, updateMood);
      } else {
        responseText = await geminiService.startNewSession(memory, character, updateMemoryState, updateCharacterName, updateMood);
      }
      
      const modelMsg: ChatMessage = { role: 'model', text: responseText, timestamp: Date.now() };
      setMessages(prev => [...prev, modelMsg]);
      setIsTyping(false);

      await speakText(responseText);
  };

  // --- Tab Switch Logic ---
  const handleTabChange = (targetMode: AppMode) => {
    setMode(targetMode);
    stopCurrentAudio();

    if (targetMode === 'chat' && !hasPlayedGreeting && messages.length > 0) {
        setHasPlayedGreeting(true);
        speakText(messages[0].text);
    }
  };

  // Determine if we need to compact the UI
  // Note: Compact ONLY if not in landing mode
  const isLanding = mode === 'landing';
  const isCompactMode = !isLanding && ((mode === 'therapy' && !!activeTask) || (mode === 'story' && storyState.hasStarted));

  // --- Renders ---

  // 1. Setup Screen
  if (!character) {
    return (
        <div className="min-h-screen bg-[#fdf6e3] flex flex-col items-center justify-center p-4 font-sans text-amber-900">
             <div className="bg-white p-8 rounded-3xl shadow-xl max-w-lg w-full text-center border-4 border-amber-100">
                 <h1 className="text-3xl font-bold mb-6 text-amber-600">Pick your Friend!</h1>
                 {setupStep === 'type' && (
                     <div className="grid grid-cols-2 gap-4 mb-8">
                        {(['teddy', 'frog', 'unicorn', 'dragon'] as CharacterType[]).map(type => (
                            <button 
                                key={type}
                                onClick={() => { setSelectedType(type); setSetupStep('style'); initAudioContext(); }}
                                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${selectedType === type ? 'border-amber-400 bg-amber-50' : 'border-gray-100 hover:border-amber-200'}`}
                            >
                                <div className="text-4xl">{type === 'teddy' ? '🧸' : type === 'frog' ? '🐸' : type === 'unicorn' ? '🦄' : '🐲'}</div>
                                <span className="capitalize font-medium text-gray-700">{type}</span>
                            </button>
                        ))}
                     </div>
                 )}
                 {setupStep === 'style' && (
                     <div className="space-y-6">
                        <div className="flex justify-center mb-4"><div className="scale-75 origin-center"><CharacterAvatar mood={TeddyMood.HAPPY} type={selectedType} style={selectedStyle} /></div></div>
                        <div className="flex justify-center gap-4 mb-8">
                             <button onClick={() => { setSelectedStyle('neutral'); initAudioContext(); }} className={`px-4 py-2 rounded-full border-2 transition-all ${selectedStyle === 'neutral' ? 'bg-amber-100 border-amber-400 text-amber-900' : 'border-gray-200 text-gray-500 hover:border-amber-200'}`}>Neutral</button>
                             <button onClick={() => { setSelectedStyle('bowtie'); initAudioContext(); }} className={`px-4 py-2 rounded-full border-2 transition-all ${selectedStyle === 'bowtie' ? 'bg-amber-100 border-amber-400 text-amber-900' : 'border-gray-200 text-gray-500 hover:border-amber-200'}`}>Boy</button>
                             <button onClick={() => { setSelectedStyle('hairbow'); initAudioContext(); }} className={`px-4 py-2 rounded-full border-2 transition-all ${selectedStyle === 'hairbow' ? 'bg-amber-100 border-amber-400 text-amber-900' : 'border-gray-200 text-gray-500 hover:border-amber-200'}`}>Girl</button>
                        </div>
                        <div className="flex gap-4 justify-center">
                            <button onClick={() => setSetupStep('type')} className="text-gray-400 hover:text-gray-600">Back</button>
                            <button onClick={handleSelectCharacter} className="bg-amber-500 text-white px-8 py-3 rounded-full font-bold text-xl shadow-lg hover:bg-amber-600 transform transition hover:-translate-y-1">Let's Play!</button>
                        </div>
                     </div>
                 )}
                 <div className="mt-8 pt-6 border-t border-amber-100">
                    <button onClick={() => fileInputRef.current?.click()} className="text-sm text-amber-500 hover:text-amber-700 flex items-center justify-center gap-2 w-full">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                        Already have a memory file? Load it here
                    </button>
                 </div>
             </div>
        </div>
    );
  }

  // 2. Main App
  return (
    <div className="h-[100dvh] bg-[#fdf6e3] flex flex-col font-sans text-slate-800 overflow-hidden relative">
      <SafeguardingModal 
        isOpen={showSafeguarding} 
        onClose={() => setShowSafeguarding(false)} 
        memory={memory}
        onUpdateMemory={updateMemoryState}
      />

      {/* Header */}
      <header className="absolute top-4 left-4 right-4 z-50 flex justify-between items-start pointer-events-none">
        <button onClick={() => setShowSafeguarding(true)} className="pointer-events-auto bg-white/80 backdrop-blur-sm hover:bg-white text-gray-500 text-xs px-3 py-1.5 rounded-full shadow-sm border border-gray-200 transition-colors flex items-center gap-1">
            Parents
        </button>
        <div className="flex gap-2 pointer-events-auto">
            <button onClick={handleSaveState} className="bg-amber-100 hover:bg-amber-200 text-amber-800 p-2 rounded-full shadow-sm transition-colors" title="Save Memory">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="bg-amber-100 hover:bg-amber-200 text-amber-800 p-2 rounded-full shadow-sm transition-colors" title="Load Memory">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            </button>
            <input type="file" ref={fileInputRef} onChange={handleLoadState} accept=".json" className="hidden" />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-start max-w-3xl w-full mx-auto p-4 sm:p-6 min-h-0 relative">
        
        {/* Avatar Container: 
            - In Landing Mode: Grow to fill available space, center content.
            - In Compact Mode: Shrink to top.
            - Default: Standard size.
         */}
        <div 
          className={`w-full flex justify-center transition-all duration-500 shrink-0 z-10 
          ${isLanding ? 'flex-1 items-center scale-110' : 
            isCompactMode ? 'h-32 pt-2 items-start' : 'h-64 sm:h-80 items-center py-6'}`}
        >
          <div className={`transition-all duration-500 origin-top ${isCompactMode && !isLanding ? 'scale-50' : 'scale-100'}`}>
            <CharacterAvatar mood={displayMood} type={character.type} style={character.style} />
          </div>
        </div>

        {/* Content Switcher: Must be flex-1 to fill the remaining space */}
        {mode === 'chat' && (
             <div className="flex-1 w-full overflow-y-auto scrollbar-hide px-2 sm:px-4 pb-4 space-y-4 fade-mask min-h-0">
               {messages.map((msg, idx) => (
                 <ChatBubble key={idx} message={msg} />
               ))}
               {isTyping && (
                  <div className="flex w-full justify-start mb-4">
                     <div className="bg-white text-gray-500 px-4 py-2 rounded-2xl rounded-bl-none border border-amber-100 text-sm italic animate-pulse">
                       {character.name} is thinking...
                     </div>
                  </div>
               )}
               <div ref={messagesEndRef} />
             </div>
        )}

        {mode === 'story' && (
            <StoryPanel 
                onStartStory={handleStartStory} 
                onContinueStory={handleContinueStory}
                onUpdateState={handleUpdateStoryState}
                onResetStory={handleResetStory}
                onDownloadAudio={handleDownloadStoryAudio}
                onSaveGame={handleSaveState}
                isGenerating={activity === 'thinking'} 
                storyState={storyState}
                memory={memory}
                chatHistory={messages}
            />
        )}

        {mode === 'therapy' && (
            <TherapyPanel 
                task={activeTask}
                tasksList={memory.speechTasks || []}
                onRecord={handleTherapyRecord} 
                onStartNew={handleStartTherapyTask}
                isLoading={activity === 'thinking'}
                onPlayTarget={() => activeTask && speakText(activeTask.word)}
                onSaveTask={handleSaveTherapyTask}
                onLoadTask={handleLoadTask}
            />
        )}

        {/* Resume Dialog */}
        {pendingHistory && (
             <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-6 animate-fade-in rounded-2xl">
                <h2 className="text-2xl font-bold text-amber-600 mb-2">Welcome Back!</h2>
                <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm mt-8">
                    <button onClick={() => handleResumeChoice('continue')} className="flex-1 bg-amber-500 text-white p-4 rounded-xl font-bold text-lg shadow-lg hover:bg-amber-600 transition-all">Continue Adventure</button>
                    <button onClick={() => handleResumeChoice('new')} className="flex-1 bg-white text-amber-600 border-2 border-amber-200 p-4 rounded-xl font-bold text-lg shadow-sm hover:bg-amber-50 transition-all">Start New Game</button>
                </div>
             </div>
        )}
      </main>

      {/* Input / Tabs Area */}
      <div className="flex-shrink-0 bg-[#fdf6e3] z-20 pb-4 w-full">
          
          {/* Mode Tabs */}
          <div className="flex justify-center gap-4 mb-4">
              <button 
                onClick={() => handleTabChange('chat')} 
                className={`flex items-center gap-2 px-6 py-2 rounded-full font-bold transition-all ${mode === 'chat' ? 'bg-white text-amber-600 shadow-md ring-2 ring-amber-100' : 'text-gray-400 hover:bg-amber-50'}`}
              >
                  <span>💬</span> Chat
              </button>
               <button 
                onClick={() => handleTabChange('story')} 
                className={`flex items-center gap-2 px-6 py-2 rounded-full font-bold transition-all ${mode === 'story' ? 'bg-white text-amber-600 shadow-md ring-2 ring-amber-100' : 'text-gray-400 hover:bg-amber-50'}`}
              >
                  <span>📚</span> Story
              </button>
              <button 
                onClick={() => handleTabChange('therapy')}
                className={`flex items-center gap-2 px-6 py-2 rounded-full font-bold transition-all ${mode === 'therapy' ? 'bg-white text-amber-600 shadow-md ring-2 ring-amber-100' : 'text-gray-400 hover:bg-amber-50'}`}
              >
                  <span>🗣️</span> Practice
              </button>
          </div>

          {/* Chat Controls (Only visible in Chat Mode) */}
          {mode === 'chat' && (
            <div className="max-w-3xl mx-auto flex gap-3 items-center px-4 sm:px-6">
              <button
                onClick={toggleListening}
                disabled={!!pendingHistory} 
                className={`h-14 w-14 shrink-0 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 ${
                  isListening
                    ? 'bg-red-500 text-white animate-pulse ring-4 ring-red-200'
                    : 'bg-white text-amber-500 border-2 border-amber-200 hover:bg-amber-50'
                } ${pendingHistory ? 'opacity-50 grayscale' : ''}`}
              >
                {isListening ? <div className="w-4 h-4 bg-white rounded-sm" /> : <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>}
              </button>

              {lastAiMessage && (
                <button
                    onClick={() => handleManualPlay(lastAiMessage)}
                    className="h-14 w-14 shrink-0 rounded-full flex items-center justify-center shadow-md bg-amber-100 text-amber-600 border border-amber-200 hover:bg-amber-200 transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
                </button>
              )}

              <div className="relative flex-1">
                 <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder={isListening ? "Listening..." : `Say something...`}
                  className={`w-full h-14 pl-6 pr-4 rounded-full border-2 bg-white focus:outline-none text-lg shadow-lg placeholder-amber-300 transition-all ${
                     isListening ? 'border-red-300 ring-2 ring-red-100' : 'border-amber-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-200'
                  }`}
                  disabled={isTyping || !!pendingHistory}
                />
              </div>
             
              <button
                onClick={handleSendMessage}
                disabled={!inputText.trim() || isTyping || !!pendingHistory}
                className={`h-14 w-14 shrink-0 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 ${
                  !inputText.trim() || isTyping || !!pendingHistory
                    ? 'bg-amber-200 cursor-not-allowed' 
                    : 'bg-amber-500 hover:bg-amber-600 text-white'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="transform rotate-45 ml-[-4px]"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
              </button>
            </div>
          )}
      </div>
    </div>
  );
};

export default App;