import React, { useState, useEffect, useRef } from 'react';
import { geminiService, GeminiError } from '../services/geminiService';
import { Memory, ChatMessage, StoryState } from '../types';
import { ApiStatusMessage } from './ApiStatusMessage';

interface StoryPanelProps {
  onStartStory: (inputs: { theme: string; hero: string; animal: string; items: string[] }) => Promise<void>;
  onContinueStory: (item: string, remainingItems: string[]) => Promise<void>;
  onUpdateState: (updates: Partial<StoryState>) => void;
  onResetStory: () => void;
  onDownloadAudio: () => void;
  onSaveGame: () => void;
  isGenerating: boolean;
  isSpeaking: boolean;
  storyState: StoryState;
  memory: Memory;
  chatHistory: ChatMessage[];
}

export const StoryPanel: React.FC<StoryPanelProps> = ({ 
    onStartStory, 
    onContinueStory, 
    onUpdateState,
    onResetStory,
    onDownloadAudio,
    onSaveGame,
    isGenerating, 
    isSpeaking,
    storyState,
    memory,
    chatHistory
}) => {
  // Local input state (does not need to persist until Start is clicked)
  const [theme, setTheme] = useState(storyState.theme);
  const [hero, setHero] = useState(storyState.hero);
  const [animal, setAnimal] = useState(storyState.animal);
  const [items, setItems] = useState(storyState.items);
  
  // Local Error State for Surprise Me
  const [localError, setLocalError] = useState<GeminiError | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [storyState.segments]);

  // Sync props to local state if they change externally (e.g. load from file)
  useEffect(() => {
      setTheme(storyState.theme);
      setHero(storyState.hero);
      setAnimal(storyState.animal);
      setItems(storyState.items);
  }, [storyState.hasStarted]); // Only when mode switches significantly

  const handleStart = async () => {
    if (!theme || !hero || !animal) return;
    const itemsList = [items.item1, items.item2, items.item3].filter(i => !!i);
    if (itemsList.length === 0) {
        alert("Please enter at least one item!");
        return;
    }
    
    // Update parent state inputs immediately so they save
    onUpdateState({ theme, hero, animal, items: items });
    
    await onStartStory({
      theme,
      hero,
      animal,
      items: itemsList
    });
  };

  const handleSurpriseMe = async () => {
      setLocalError(null);
      try {
          const params = await geminiService.generateRandomStoryParams(memory, chatHistory);
          setTheme(params.theme);
          setHero(params.hero);
          setAnimal(params.animal);
          setItems({
              item1: params.items[0] || 'Magic Wand',
              item2: params.items[1] || 'Cookie',
              item3: params.items[2] || 'Key'
          });
          
          const itemsList = params.items || ['Magic Wand', 'Cookie', 'Key'];
          
          // Update state for persistence
          onUpdateState({ 
              theme: params.theme, 
              hero: params.hero, 
              animal: params.animal, 
              items: { 
                 item1: params.items[0], 
                 item2: params.items[1], 
                 item3: params.items[2] 
              }
          });

          await onStartStory({
              theme: params.theme,
              hero: params.hero,
              animal: params.animal,
              items: itemsList
          });
      } catch (error: any) {
          if (error.name === 'GeminiError') {
              setLocalError(error);
          } else {
              console.error("Surprise Me Failed", error);
          }
      }
  };

  const handleUseItem = async (item: string) => {
      const remaining = storyState.availableItems.filter(i => i !== item);
      await onContinueStory(item, remaining);
  };

  const isFinished = storyState.hasStarted && storyState.availableItems.length === 0 && !isGenerating && storyState.segments.length > 0;

  if (!storyState.hasStarted) {
      return (
        <div className="w-full h-full flex flex-col items-center p-2 sm:p-4 max-w-2xl mx-auto animate-fade-in-up overflow-y-auto scrollbar-hide">
            <div className="bg-gradient-to-r from-purple-400 to-pink-500 w-full p-6 rounded-3xl shadow-lg text-white mb-6 text-center relative overflow-hidden flex-shrink-0">
                <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]"></div>
                <h2 className="text-3xl font-black mb-1 drop-shadow-md">Magic Storybook</h2>
                <p className="text-purple-100 font-medium">Let's Create an Adventure</p>
            </div>

            <div className="bg-white w-full rounded-3xl shadow-lg border-2 border-amber-100 p-6 sm:p-8">
              {/* Local Error Display for Surprise Me */}
              {localError && (
                  <ApiStatusMessage error={localError} onRetry={handleSurpriseMe} />
              )}
              
              <button 
                  onClick={handleSurpriseMe}
                  disabled={isGenerating || isSpeaking || !!localError}
                  className={`w-full mb-6 py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-purple-400 to-amber-400 text-white shadow-md hover:shadow-lg hover:scale-[1.02] transition-all flex items-center justify-center gap-2 ${!!localError || isGenerating || isSpeaking ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                  ✨ Surprise Me with a Story!
              </button>

              <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-gray-200"></div>
                  <span className="flex-shrink-0 mx-4 text-gray-400 text-sm">OR CREATE YOUR OWN</span>
                  <div className="flex-grow border-t border-gray-200"></div>
              </div>

              <div className="space-y-4 mt-4">
                <div>
                  <label className="block text-sm font-bold text-amber-700 mb-1">What's the story about?</label>
                  <input 
                    type="text" 
                    placeholder="e.g., Space, Pirates, Magic Forest" 
                    className="w-full px-4 py-3 rounded-xl border border-amber-200 focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none transition-all"
                    value={theme}
                    onChange={e => setTheme(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-amber-700 mb-1">Who is the Hero?</label>
                    <input 
                      type="text" 
                      placeholder="Name" 
                      className="w-full px-4 py-3 rounded-xl border border-amber-200 focus:ring-2 focus:ring-amber-300 outline-none"
                      value={hero}
                      onChange={e => setHero(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-amber-700 mb-1">Favorite Animal?</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Dragon" 
                      className="w-full px-4 py-3 rounded-xl border border-amber-200 focus:ring-2 focus:ring-amber-300 outline-none"
                      value={animal}
                      onChange={e => setAnimal(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-amber-700 mb-1">3 Special Items to use:</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input 
                      type="text" 
                      placeholder="Item 1" 
                      className="w-full px-3 py-3 rounded-xl border border-amber-200 focus:ring-2 focus:ring-amber-300 outline-none"
                      value={items.item1}
                      onChange={e => setItems(prev => ({...prev, item1: e.target.value}))}
                    />
                     <input 
                      type="text" 
                      placeholder="Item 2" 
                      className="w-full px-3 py-3 rounded-xl border border-amber-200 focus:ring-2 focus:ring-amber-300 outline-none"
                      value={items.item2}
                      onChange={e => setItems(prev => ({...prev, item2: e.target.value}))}
                    />
                     <input 
                      type="text" 
                      placeholder="Item 3" 
                      className="w-full px-3 py-3 rounded-xl border border-amber-200 focus:ring-2 focus:ring-amber-300 outline-none"
                      value={items.item3}
                      onChange={e => setItems(prev => ({...prev, item3: e.target.value}))}
                    />
                  </div>
                </div>

                <button 
                  onClick={handleStart}
                  disabled={isGenerating || isSpeaking || !theme || !hero}
                  className={`w-full mt-6 py-4 rounded-full font-bold text-xl shadow-lg transition-all transform active:scale-95 ${
                      isGenerating || isSpeaking || !theme || !hero 
                      ? 'bg-gray-200 text-gray-400' 
                      : 'bg-amber-500 text-white hover:bg-amber-600 hover:-translate-y-1'
                  }`}
                >
                  Start Adventure!
                </button>
              </div>
            </div>
        </div>
      );
  }

  return (
    <div className="w-full h-full max-h-full flex flex-col relative overflow-hidden bg-white/50 rounded-3xl border-2 border-amber-100">
         {/* Header */}
         <div className="p-4 border-b border-amber-100 flex justify-between items-center bg-amber-50 flex-shrink-0">
             <button onClick={onResetStory} className="text-amber-600 font-bold text-sm hover:text-amber-800">← Back</button>
             <h2 className="font-bold text-amber-800 truncate px-2">The Adventure of {hero}</h2>
             <div className="w-8"></div>
         </div>
         
         {/* Story Content */}
         <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scrollbar-hide">
             {storyState.segments.map((segment, index) => (
                 <div key={index} className="animate-fade-in-up bg-white p-4 rounded-2xl shadow-sm border border-amber-50">
                     <p className="text-lg text-slate-700 leading-relaxed font-medium">
                        {segment}
                     </p>
                 </div>
             ))}
             {isGenerating && (
                 <div className="flex justify-center p-4">
                     <div className="animate-bounce bg-amber-100 text-amber-600 px-4 py-2 rounded-full text-sm font-bold">
                         Writing the next part... 🖊️
                     </div>
                 </div>
             )}
         </div>

         {/* Controls */}
         <div className="p-4 bg-white border-t border-amber-100 flex-shrink-0">
             {isFinished ? (
                 <div className="text-center flex flex-col gap-3">
                     <h3 className="text-xl font-bold text-amber-600 mb-2">The End!</h3>
                     <div className="flex justify-center gap-3 flex-wrap">
                         <button 
                            onClick={onDownloadAudio}
                            className="bg-blue-500 text-white px-6 py-2 rounded-full font-bold shadow-md hover:bg-blue-600 flex items-center gap-2"
                         >
                             🎧 Download Audiobook
                         </button>
                         <button 
                            onClick={onSaveGame}
                            className="bg-amber-100 text-amber-800 px-6 py-2 rounded-full font-bold shadow-sm hover:bg-amber-200 border border-amber-200"
                         >
                             💾 Save Story
                         </button>
                         <button 
                            onClick={onResetStory}
                            className="bg-amber-500 text-white px-6 py-2 rounded-full font-bold shadow-md hover:bg-amber-600"
                         >
                             Tell Another Story
                         </button>
                     </div>
                 </div>
             ) : (
                <div className="w-full">
                    {!isGenerating && storyState.segments.length > 0 && (
                        <>
                            <p className="text-center text-amber-800 font-bold mb-3">Oh no! A problem! What should {hero} use?</p>
                            <div className="flex flex-wrap gap-2 justify-center">
                                {storyState.availableItems.map((item) => (
                                    <button
                                        key={item}
                                        onClick={() => handleUseItem(item)}
                                        disabled={isSpeaking}
                                        className={`bg-white border-2 border-amber-300 text-amber-700 px-4 py-3 rounded-xl font-bold shadow-sm hover:bg-amber-50 hover:scale-105 transition-all active:scale-95 ${isSpeaking ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        ✨ Use {item}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
             )}
         </div>
    </div>
  );
};