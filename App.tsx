import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CharacterAvatar } from './components/CharacterAvatar';
import { ChatBubble } from './components/ChatBubble';
import { TherapyPanel } from './components/TherapyPanel';
import { StoryPanel } from './components/StoryPanel';
import { AchievementsPanel } from './components/AchievementsPanel';
import { SafeguardingModal } from './components/SafeguardingModal';
import { NotificationModal } from './components/NotificationModal';
import { ApiStatusMessage } from './components/ApiStatusMessage';
import { geminiService, GeminiError } from './services/geminiService';
import { browserTtsService } from './services/browserTtsService';
import { Memory, ChatMessage, TeddyMood, AppState, CharacterProfile, CharacterType, CharacterStyle, AppMode, SpeechTask, StoryState } from './types';
import { INITIAL_MEMORY } from './constants';
import { pcmToAudioBuffer, concatenateAudioBuffers, audioBufferToWav, blobToWavBase64 } from './services/audioUtils';

const INITIAL_STORY_STATE: StoryState = {
    hasStarted: false,
    theme: '',
    hero: '',
    animal: '',
    items: { item1: '', item2: '', item3: '' },
    availableItems: [],
    segments: []
};

// Helper for Star Calculation (Must match AchievementsPanel logic)
const calculateStars = (memory: Memory, phoneme: string): number => {
    const stats = memory.phonemeStats?.[phoneme];
    const tasks = memory.speechTasks || [];
    let stars = 0;
    if (stats && stats.attempts > 0) {
        stars = 1;
        if ((stats.success / stats.attempts) > 0.3) stars += 1;
        if ((stats.success / stats.attempts) > 0.7) stars += 1;
        const masteredCount = tasks.filter(t => t.targetPhoneme === phoneme && t.status === 'mastered').length;
        if (masteredCount >= 1) stars += 1;
        if (masteredCount >= 3) stars += 1;
    }
    return stars;
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
  
  // Story State
  const [storyState, setStoryState] = useState<StoryState>(INITIAL_STORY_STATE);
  
  // Speech Therapy State
  const [activeTask, setActiveTask] = useState<SpeechTask | null>(null);
  
  // Notification & Error State
  const [notifications, setNotifications] = useState<{ title: string; message: string }[]>([]);
  const [apiError, setApiError] = useState<GeminiError | null>(null);
  const [retryAction, setRetryAction] = useState<(() => Promise<void>) | null>(null);

  // Emotional State Logic
  const [baseMood, setBaseMood] = useState<TeddyMood>(TeddyMood.HAPPY);
  const [activity, setActivity] = useState<'idle' | 'thinking' | 'talking'>('idle');

  const displayMood = (() => {
    if (activity === 'thinking') return TeddyMood.THINKING;
    if (activity === 'talking') return TeddyMood.TALKING;
    return baseMood; 
  })();

  const isSpeaking = activity === 'talking';

  const [showSafeguarding, setShowSafeguarding] = useState(false);
  const [pendingHistory, setPendingHistory] = useState<ChatMessage[] | null>(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentAudioSource = useRef<AudioBufferSourceNode | null>(null);
  
  // Practice Session Recording
  const practiceAudioBuffers = useRef<AudioBuffer[]>([]);

  // --- Global API Error Handler Wrapper ---
  const handleApiOperation = async (operation: () => Promise<void>) => {
      setApiError(null);
      setRetryAction(null);
      try {
          await operation();
      } catch (error: any) {
          console.error("Operation Failed", error);
          if (error.name === 'GeminiError') {
              setApiError(error);
              setRetryAction(() => () => handleApiOperation(operation));
          } else {
              alert("Something unexpected happened. Please try again.");
          }
          setActivity('idle');
          setIsTyping(false);
      }
  };

  // --- Persistence Logic ---
  // Load on mount
  useEffect(() => {
    const saved = localStorage.getItem('TEDDY_TALK_STATE');
    if (saved) {
      try {
        const json = JSON.parse(saved) as AppState;
        if (json.character) {
          setCharacter(json.character);
          setMemory(json.memory || INITIAL_MEMORY);
          // If we have history, we can load it directly or set as pending.
          // Let's load directly for seamless continuation.
          setMessages(json.chatHistory || []);
          setStoryState(json.storyState || INITIAL_STORY_STATE);
          setHasPlayedGreeting(true); // Assume greeting played if loading state
        }
      } catch (e) {
        console.error("Failed to load local state", e);
      }
    }
  }, []);

  // Save on change
  useEffect(() => {
    if (character) {
      const state: AppState = { memory, chatHistory: messages, character, storyState };
      localStorage.setItem('TEDDY_TALK_STATE', JSON.stringify(state));
    }
  }, [memory, messages, character, storyState]);

  // --- Achievement Checking Logic ---
  const checkAchievements = () => {
      const unlocked = new Set(memory.achievements?.map(a => a.id) || []);
      const newUnlockIds: string[] = [];
      const newUnlockDetails: {id: string, title: string}[] = [];

      const ACHIEVEMENTS_META = {
          'friend_named': "Best Friends",
          'first_chat': "Hello!",
          'story_started': "Storyteller",
          'baseline_done': "Checkup Champ",
          'practice_start': "Try It Out",
          'word_mastered': "Super Star",
          'three_mastered': "Word Wizard",
          'memory_saved': "Time Traveler"
      };

      // 1. Friend Named (Name != Type)
      if (character && character.name.toLowerCase() !== character.type.toLowerCase() && !unlocked.has('friend_named')) {
          newUnlockIds.push('friend_named');
      }

      // 2. First Chat (User messages > 0)
      if (messages.some(m => m.role === 'user') && !unlocked.has('first_chat')) {
          newUnlockIds.push('first_chat');
      }

      // 3. Story Started
      if (storyState.hasStarted && !unlocked.has('story_started')) {
          newUnlockIds.push('story_started');
      }

      // 4. Baseline Done
      if (memory.baseline && !unlocked.has('baseline_done')) {
          newUnlockIds.push('baseline_done');
      }

      // 5. Practice Start (Any tasks)
      if (memory.speechTasks && memory.speechTasks.length > 0 && !unlocked.has('practice_start')) {
          newUnlockIds.push('practice_start');
      }

      // 6. Word Mastered
      const masteredCount = memory.speechTasks?.filter(t => t.status === 'mastered').length || 0;
      if (masteredCount >= 1 && !unlocked.has('word_mastered')) {
          newUnlockIds.push('word_mastered');
      }

      // 7. Three Mastered
      if (masteredCount >= 3 && !unlocked.has('three_mastered')) {
          newUnlockIds.push('three_mastered');
      }

      // Apply updates if any
      if (newUnlockIds.length > 0) {
          // Trigger notifications
          newUnlockIds.forEach(id => {
              const title = ACHIEVEMENTS_META[id as keyof typeof ACHIEVEMENTS_META] || "Achievement";
              setNotifications(prev => [...prev, { title: "Achievement Unlocked!", message: `You earned the "${title}" badge!` }]);
          });

          setMemory(prev => ({
              ...prev,
              achievements: [
                  ...(prev.achievements || []),
                  ...newUnlockIds.map(id => ({ id, unlockedAt: Date.now() }))
              ]
          }));
      }
  };

  // Run achievement check whenever relevant state changes
  useEffect(() => {
      if (character) {
          const timer = setTimeout(checkAchievements, 1000); // Debounce slightly
          return () => clearTimeout(timer);
      }
  }, [messages, storyState, memory.speechTasks, memory.baseline, character]);


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
                setActivity((prev) => prev === 'talking' ? 'idle' : prev); 
            }
        );
    } else {
        // Wrap speech gen in error handler too
        const voice = getCharacterVoice(char);
        try {
            const audioData = await geminiService.generateSpeech(text, voice);
            if (audioData) {
                if (mode === 'therapy') {
                     if (!audioContextRef.current) initAudioContext();
                     const buffer = pcmToAudioBuffer(audioData, audioContextRef.current!);
                     practiceAudioBuffers.current.push(buffer);
                }
                playAudioBuffer(audioData);
            } else {
                setActivity('idle');
            }
        } catch (e) {
            console.error("TTS Failed silently", e);
            setActivity('idle'); // Just fail TTS silently, don't crash flow
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
    if (isSpeaking) return;
    
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
    if (isSpeaking) return;
    initAudioContext();
    setActivity('thinking');
    await speakText(text);
  };

  const handleSendMessage = () => {
    if (!inputText.trim() || !character) return;
    if (isTyping || isSpeaking) return;
    
    initAudioContext();
    stopCurrentAudio();
    if (isListening) recognitionRef.current?.stop();

    const userMsg: ChatMessage = { role: 'user', text: inputText, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);
    setActivity('thinking');

    handleApiOperation(async () => {
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
    });
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

  const handleStartStory = (inputs: { theme: string; hero: string; animal: string; items: string[] }) => {
    return handleApiOperation(async () => {
        initAudioContext();
        stopCurrentAudio();
        setActivity('thinking');
        
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
    });
  };

  const handleContinueStory = (item: string, remainingItems: string[]) => {
      return handleApiOperation(async () => {
          initAudioContext();
          stopCurrentAudio();
          setActivity('thinking');

          const fullContext = storyState.segments.join(' ');
          let nextSegment = '';

          if (remainingItems.length > 0) {
              nextSegment = await geminiService.generateStoryChapter(fullContext, item, remainingItems);
          } else {
              nextSegment = await geminiService.generateStoryConclusion(fullContext, item);
          }
          
          setStoryState(prev => ({
              ...prev,
              availableItems: remainingItems,
              segments: [...prev.segments, nextSegment]
          }));
          await speakText(nextSegment);
      });
  };

  const handleResetStory = () => {
    setStoryState(INITIAL_STORY_STATE);
  };

  const handleDownloadStoryAudio = async () => {
    if (storyState.segments.length === 0) return;
    setActivity('thinking');
    
    // Not wrapped in main error handler because it's a download action, user can retry easily
    const voice = getCharacterVoice();
    const allAudio: Uint8Array[] = [];
    
    try {
        for (const segment of storyState.segments) {
            const audio = await geminiService.generateSpeech(segment, voice, 4000); 
            if (audio) {
                allAudio.push(audio);
            }
        }

        if (allAudio.length === 0) throw new Error("No audio generated");

        const totalLength = allAudio.reduce((acc, curr) => acc + curr.length, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const arr of allAudio) {
            combined.set(arr, offset);
            offset += arr.length;
        }

        if (!audioContextRef.current) initAudioContext();
        const buffer = pcmToAudioBuffer(combined, audioContextRef.current!);
        const wavBlob = audioBufferToWav(buffer);

        const url = URL.createObjectURL(wavBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${storyState.hero}-adventure.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        alert("Could not generate audio download. Try again later.");
    }
    
    setActivity('idle');
  };

  // --- Therapy Logic ---
  
  const downloadPracticeSession = useCallback(() => {
      if (practiceAudioBuffers.current.length === 0 || !activeTask) return;
      
      if (!audioContextRef.current) initAudioContext();
      const combinedBuffer = concatenateAudioBuffers(practiceAudioBuffers.current, audioContextRef.current!);
      
      if (combinedBuffer) {
          const blob = audioBufferToWav(combinedBuffer);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `practice-${activeTask.word}-${Date.now()}.wav`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
      }
      practiceAudioBuffers.current = [];
  }, [activeTask]);


  const handleStartTherapyTask = (forcedPhoneme?: string) => {
      return handleApiOperation(async () => {
          if (activeTask && practiceAudioBuffers.current.length > 0) {
              downloadPracticeSession();
          }
          
          practiceAudioBuffers.current = []; 

          setActivity('thinking');
          const exclude = activeTask?.word;
          const newTask = await geminiService.generateTherapyTask(memory, exclude, forcedPhoneme);
          
          setMemory(prev => ({
              ...prev,
              speechTasks: [...(prev.speechTasks || []), newTask]
          }));
          setActiveTask(newTask);

          const intro = `Let's practice the word ${newTask.word}! Say it with me: ${newTask.word}`;
          await speakText(intro);
      });
  };

  const handlePracticeSound = (phoneme: string) => {
      setMode('therapy');
      setTimeout(() => handleStartTherapyTask(phoneme), 100);
  };

  const handleTherapyRecord = (audioBlob: Blob) => {
      return handleApiOperation(async () => {
          if (!activeTask || !character) return;
          
          if (!audioContextRef.current) initAudioContext();
          
          try {
              const arrayBuffer = await audioBlob.arrayBuffer();
              const audioBuffer = await audioContextRef.current!.decodeAudioData(arrayBuffer);
              practiceAudioBuffers.current.push(audioBuffer);
          } catch (e) {
              console.warn("Could not decode user audio for session export", e);
          }

          setActivity('thinking');
          
          let base64data = "";
          let finalMimeType = 'audio/wav'; // Assume success initially

          try {
              base64data = await blobToWavBase64(audioBlob);
          } catch (e) {
              console.error("WAV Conversion failed, falling back to original blob", e);
              const reader = new FileReader();
              reader.readAsDataURL(audioBlob);
              await new Promise(resolve => {
                  reader.onloadend = () => {
                      base64data = (reader.result as string).split(',')[1];
                      resolve(null);
                  }
              });
              finalMimeType = audioBlob.type; // Fallback mime type
          }
          
          console.debug(`Sending audio to AI as: ${finalMimeType}`);

          const feedback = await geminiService.assessPronunciation(
              base64data,
              activeTask,
              character,
              updateMood,
              (taskId, updates) => { 
                  const updatedTask = { 
                      ...activeTask, 
                      ...updates, 
                      attempts: activeTask.attempts + 1,
                      history: [...activeTask.history, updates.report?.howToHelp || ''] 
                  };
                  
                  if (activeTask.targetPhoneme) {
                      const oldStars = calculateStars(memory, activeTask.targetPhoneme);

                      setMemory(prev => {
                          const currentStats = prev.phonemeStats?.[activeTask.targetPhoneme!] || { attempts: 0, success: 0 };
                          const isSuccess = updates.status === 'mastered'; 
                          
                          const newMemory = {
                              ...prev,
                              phonemeStats: {
                                  ...prev.phonemeStats,
                                  [activeTask.targetPhoneme!]: {
                                      attempts: currentStats.attempts + 1,
                                      success: currentStats.success + (isSuccess ? 1 : 0)
                                  }
                              },
                              speechTasks: prev.speechTasks?.map(t => t.id === taskId ? updatedTask : t)
                          };

                          const newStars = calculateStars(newMemory, activeTask.targetPhoneme!);
                          
                          if (newStars > oldStars) {
                              setNotifications(currentNotes => [
                                  ...currentNotes, 
                                  { title: "Level Up!", message: `You earned ${newStars} star${newStars > 1 ? 's' : ''} for the '${activeTask.targetPhoneme}' sound!`}
                              ]);
                          }

                          return newMemory;
                      });
                  } else {
                      setMemory(prev => ({
                          ...prev,
                          speechTasks: prev.speechTasks?.map(t => t.id === taskId ? updatedTask : t)
                      }));
                  }

                  setActiveTask(updatedTask);
              },
              finalMimeType // Explicitly pass the resolved mime type
          );
          
          await speakText(feedback);
      });
  };

  const handleSaveTherapyTask = (taskId: string) => {
      setMemory(prev => ({
          ...prev,
          speechTasks: prev.speechTasks?.map(t => t.id === taskId ? { ...t, isFavorite: true } : t)
      }));
      if (activeTask && activeTask.id === taskId) {
          setActiveTask(prev => prev ? { ...prev, isFavorite: true } : null);
      }
      setBaseMood(TeddyMood.EXCITED);
  };

  const handleLoadTask = (task: SpeechTask | null) => {
      if (activeTask && practiceAudioBuffers.current.length > 0) {
          downloadPracticeSession();
      }
      practiceAudioBuffers.current = [];
      
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
    
    setMemory(prev => {
        const unlocked = new Set(prev.achievements?.map(a => a.id) || []);
        if (!unlocked.has('memory_saved')) {
            setNotifications(prevN => [...prevN, { title: "Achievement Unlocked!", message: "You earned the 'Time Traveler' badge!" }]);
            return {
                ...prev,
                achievements: [...(prev.achievements || []), { id: 'memory_saved', unlockedAt: Date.now() }]
            };
        }
        return prev;
    });
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
          setHasPlayedGreeting(true); 
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
      
      handleApiOperation(async () => {
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
      });
  };

  // --- Tab Switch Logic ---
  const handleTabChange = (targetMode: AppMode) => {
    if (mode === 'therapy' && targetMode !== 'therapy' && activeTask && practiceAudioBuffers.current.length > 0) {
        downloadPracticeSession();
        practiceAudioBuffers.current = [];
    }
    
    setMode(targetMode);
    stopCurrentAudio();

    if (targetMode === 'chat' && !hasPlayedGreeting && messages.length > 0) {
        setHasPlayedGreeting(true);
        speakText(messages[0].text);
    }
  };

  const isLanding = mode === 'landing';
  const isCompactMode = !isLanding && ((mode === 'therapy' && !!activeTask) || (mode === 'story' && storyState.hasStarted) || mode === 'achievements');

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

      {/* Notification Queue */}
      {notifications.length > 0 && (
          <NotificationModal 
            title={notifications[0].title}
            message={notifications[0].message}
            onClose={() => setNotifications(prev => prev.slice(1))}
          />
      )}

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

      {/* Flex container for the main body */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl mx-auto w-full min-h-0 overflow-hidden relative gap-0 lg:gap-8 lg:p-6 lg:items-start">
        
        {/* Avatar Pane */}
        <div className={`
            flex justify-center items-center transition-all duration-500 relative z-10 lg:sticky lg:top-0
            ${isLanding ? 'w-full flex-1' : 'w-full lg:w-[400px] lg:h-auto flex-shrink-0'}
            ${isCompactMode && !isLanding ? 'h-32 pt-2' : 'h-64 sm:h-80 lg:h-full'}
        `}>
           <div className={`transition-all duration-500 origin-top ${isCompactMode && !isLanding ? 'scale-50' : 'scale-100'}`}>
              <CharacterAvatar mood={displayMood} type={character.type} style={character.style} />
           </div>
        </div>

        {/* Content Pane */}
        <div className={`
            flex flex-col min-h-0 transition-all duration-500 relative w-full
            ${isLanding ? 'h-0 overflow-hidden lg:h-[85vh] lg:flex-1' : 'flex-1 h-full lg:h-[85vh]'}
            lg:bg-white/40 lg:backdrop-blur-sm lg:rounded-3xl lg:border lg:border-amber-100
        `}>
            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto w-full scrollbar-hide flex flex-col items-center">
                 
                 {/* API Error Overlay - Injected at top of content area */}
                 {apiError && retryAction && (
                     <div className="w-full max-w-lg px-4 pt-4 sticky top-0 z-50">
                         <ApiStatusMessage error={apiError} onRetry={retryAction} />
                     </div>
                 )}

                 {isLanding && (
                    <div className="hidden lg:flex flex-col items-center justify-center h-full p-8 overflow-y-auto scrollbar-hide">
                        <div className="max-w-2xl w-full text-center space-y-8 animate-fade-in-up">
                            
                            {/* Hero Header */}
                            <div className="bg-gradient-to-r from-amber-400 to-orange-400 p-8 rounded-3xl shadow-lg text-white relative overflow-hidden transform hover:scale-[1.02] transition-transform">
                                <div className="absolute top-0 left-0 w-full h-full opacity-20 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]"></div>
                                <h1 className="text-4xl font-black mb-2 drop-shadow-md">Welcome, Friend!</h1>
                                <p className="text-amber-100 text-xl font-medium">I am so excited to play with you!</p>
                            </div>

                            <p className="text-xl text-amber-800 font-bold">What do you want to do today?</p>

                            {/* Feature Grid */}
                            <div className="grid grid-cols-2 gap-4">
                                <button 
                                    onClick={() => handleTabChange('chat')}
                                    className="bg-white p-6 rounded-2xl border-2 border-sky-100 shadow-sm hover:shadow-md hover:border-sky-300 transition-all group cursor-pointer text-left relative overflow-hidden"
                                >
                                    <div className="absolute top-0 right-0 p-2 opacity-10 text-6xl group-hover:scale-110 transition-transform">💬</div>
                                    <div className="text-5xl mb-3 group-hover:scale-110 transition-transform relative z-10">💬</div>
                                    <h3 className="text-lg font-bold text-sky-600 mb-1 relative z-10">Chat</h3>
                                    <p className="text-gray-500 text-sm relative z-10">Talk to me about anything! I love to listen.</p>
                                </button>
                                <button 
                                    onClick={() => handleTabChange('story')}
                                    className="bg-white p-6 rounded-2xl border-2 border-purple-100 shadow-sm hover:shadow-md hover:border-purple-300 transition-all group cursor-pointer text-left relative overflow-hidden"
                                >
                                    <div className="absolute top-0 right-0 p-2 opacity-10 text-6xl group-hover:scale-110 transition-transform">📚</div>
                                    <div className="text-5xl mb-3 group-hover:scale-110 transition-transform relative z-10">📚</div>
                                    <h3 className="text-lg font-bold text-purple-600 mb-1 relative z-10">Story</h3>
                                    <p className="text-gray-500 text-sm relative z-10">Let's make a magic adventure together.</p>
                                </button>
                                <button 
                                    onClick={() => handleTabChange('therapy')}
                                    className="bg-white p-6 rounded-2xl border-2 border-green-100 shadow-sm hover:shadow-md hover:border-green-300 transition-all group cursor-pointer text-left relative overflow-hidden"
                                >
                                    <div className="absolute top-0 right-0 p-2 opacity-10 text-6xl group-hover:scale-110 transition-transform">🗣️</div>
                                    <div className="text-5xl mb-3 group-hover:scale-110 transition-transform relative z-10">🗣️</div>
                                    <h3 className="text-lg font-bold text-green-600 mb-1 relative z-10">Practice</h3>
                                    <p className="text-gray-500 text-sm relative z-10">Play fun word games to get strong!</p>
                                </button>
                                <button 
                                    onClick={() => handleTabChange('achievements')}
                                    className="bg-white p-6 rounded-2xl border-2 border-yellow-100 shadow-sm hover:shadow-md hover:border-yellow-300 transition-all group cursor-pointer text-left relative overflow-hidden"
                                >
                                    <div className="absolute top-0 right-0 p-2 opacity-10 text-6xl group-hover:scale-110 transition-transform">🏆</div>
                                    <div className="text-5xl mb-3 group-hover:scale-110 transition-transform relative z-10">🏆</div>
                                    <h3 className="text-lg font-bold text-yellow-600 mb-1 relative z-10">Awards</h3>
                                    <p className="text-gray-500 text-sm relative z-10">See all the shiny stars you earned.</p>
                                </button>
                            </div>

                            <div className="inline-block bg-amber-100 text-amber-800 px-6 py-2 rounded-full font-bold text-sm animate-bounce">
                                👆 Click a button above to start! 👆
                            </div>
                        </div>
                    </div>
                 )}

                 {mode === 'chat' && (
                     <div className="w-full h-full max-w-2xl flex flex-col items-center p-2 sm:p-4">
                       <div className="bg-gradient-to-r from-sky-400 to-blue-500 w-full p-6 rounded-3xl shadow-lg text-white mb-6 text-center relative overflow-hidden flex-shrink-0">
                            <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]"></div>
                            <h2 className="text-3xl font-black mb-1 drop-shadow-md">Chat with {character.name}</h2>
                            <p className="text-sky-100 font-medium">Your Best Friend</p>
                       </div>

                       <div className="w-full max-w-3xl px-4 pb-4 space-y-4 pt-4">
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
                        isSpeaking={isSpeaking} 
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
                        onStartNew={() => handleStartTherapyTask()}
                        isLoading={activity === 'thinking'}
                        isSpeaking={isSpeaking}
                        onPlayTarget={() => activeTask && speakText(activeTask.word)}
                        onSaveTask={handleSaveTherapyTask}
                        onLoadTask={handleLoadTask}
                        memory={memory}
                        onUpdateMemory={updateMemoryState}
                    />
                )}

                {mode === 'achievements' && (
                    <AchievementsPanel memory={memory} onPracticeSound={handlePracticeSound} />
                )}
            </div>

             {/* Chat Controls */}
             {mode === 'chat' && (
                <div className="flex-shrink-0 w-full p-4 bg-gradient-to-t from-[#fdf6e3] via-[#fdf6e3] to-transparent lg:rounded-b-3xl">
                    <div className="max-w-3xl mx-auto flex gap-3 items-center">
                      <button
                        onClick={toggleListening}
                        disabled={!!pendingHistory || !!apiError || isSpeaking} 
                        className={`h-14 w-14 shrink-0 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 ${
                          isListening
                            ? 'bg-red-500 text-white animate-pulse ring-4 ring-red-200'
                            : 'bg-white text-amber-500 border-2 border-amber-200 hover:bg-amber-50'
                        } ${pendingHistory || apiError || isSpeaking ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
                      >
                        {isListening ? <div className="w-4 h-4 bg-white rounded-sm" /> : <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>}
                      </button>

                      {lastAiMessage && (
                        <button
                            onClick={() => handleManualPlay(lastAiMessage)}
                            disabled={isSpeaking}
                            className={`h-14 w-14 shrink-0 rounded-full flex items-center justify-center shadow-md bg-amber-100 text-amber-600 border border-amber-200 hover:bg-amber-200 transition-colors ${isSpeaking ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                          placeholder={isListening ? "Listening..." : (isSpeaking ? "Shhh, I'm talking..." : `Say something...`)}
                          className={`w-full h-14 pl-6 pr-4 rounded-full border-2 bg-white focus:outline-none text-lg shadow-lg placeholder-amber-300 transition-all ${
                             isListening ? 'border-red-300 ring-2 ring-red-100' : 'border-amber-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-200'
                          }`}
                          disabled={isTyping || !!pendingHistory || !!apiError || isSpeaking}
                        />
                      </div>
                     
                      <button
                        onClick={handleSendMessage}
                        disabled={!inputText.trim() || isTyping || !!pendingHistory || !!apiError || isSpeaking}
                        className={`h-14 w-14 shrink-0 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 ${
                          !inputText.trim() || isTyping || !!pendingHistory || !!apiError || isSpeaking
                            ? 'bg-amber-200 cursor-not-allowed' 
                            : 'bg-amber-500 hover:bg-amber-600 text-white'
                        }`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="transform rotate-45 ml-[-4px]"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
                      </button>
                    </div>
                </div>
             )}
        </div>
      </div>

      {/* Input / Tabs Area - Fixed Bottom for Tabs */}
      <div className="flex-shrink-0 z-20 pb-4 w-full bg-[#fdf6e3] lg:bg-transparent lg:fixed lg:bottom-4 lg:left-0 lg:w-auto lg:pl-10">
          {/* Mode Tabs */}
          <div className="flex justify-center gap-4 mb-2 lg:flex-col lg:gap-4 lg:bg-white/80 lg:backdrop-blur-sm lg:p-2 lg:rounded-2xl lg:shadow-md lg:border lg:border-amber-100">
              <button 
                onClick={() => handleTabChange('chat')} 
                disabled={isSpeaking}
                className={`flex items-center gap-2 px-6 py-2 rounded-full font-bold transition-all ${mode === 'chat' ? 'bg-white text-amber-600 shadow-md ring-2 ring-amber-100 lg:ring-0 lg:bg-amber-100' : 'text-gray-400 hover:bg-amber-50'} ${isSpeaking ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                  <span className="text-xl">💬</span> <span className="lg:hidden">Chat</span>
              </button>
               <button 
                onClick={() => handleTabChange('story')} 
                disabled={isSpeaking}
                className={`flex items-center gap-2 px-6 py-2 rounded-full font-bold transition-all ${mode === 'story' ? 'bg-white text-amber-600 shadow-md ring-2 ring-amber-100 lg:ring-0 lg:bg-amber-100' : 'text-gray-400 hover:bg-amber-50'} ${isSpeaking ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                  <span className="text-xl">📚</span> <span className="lg:hidden">Story</span>
              </button>
              <button 
                onClick={() => handleTabChange('therapy')}
                disabled={isSpeaking}
                className={`flex items-center gap-2 px-6 py-2 rounded-full font-bold transition-all ${mode === 'therapy' ? 'bg-white text-amber-600 shadow-md ring-2 ring-amber-100 lg:ring-0 lg:bg-amber-100' : 'text-gray-400 hover:bg-amber-50'} ${isSpeaking ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                  <span className="text-xl">🗣️</span> <span className="lg:hidden">Practice</span>
              </button>
              <button 
                onClick={() => handleTabChange('achievements')}
                disabled={isSpeaking}
                className={`flex items-center gap-2 px-6 py-2 rounded-full font-bold transition-all ${mode === 'achievements' ? 'bg-white text-amber-600 shadow-md ring-2 ring-amber-100 lg:ring-0 lg:bg-amber-100' : 'text-gray-400 hover:bg-amber-50'} ${isSpeaking ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                  <span className="text-xl">🏆</span> <span className="lg:hidden">Awards</span>
              </button>
          </div>
      </div>
      
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
    </div>
  );
};

export default App;