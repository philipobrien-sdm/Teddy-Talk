export interface Memory {
  childName?: string;
  childAge?: string;
  childGender?: string;
  favoriteColor?: string;
  likes?: string[];
  dislikes?: string[];
  lastTopic?: string;
  // Speech Therapy specific memory
  speechTasks?: SpeechTask[]; 
  activeTaskId?: string;
  targetWords?: string[]; // Words the parent wants to focus on
  masteredWords?: string[]; // Words known to be easy (for confidence)
  // Settings
  ttsEngine?: 'gemini' | 'browser';
  [key: string]: any;
}

export interface SpeechTask {
  id: string;
  word: string;
  targetPhoneme?: string;
  status: 'new' | 'in_progress' | 'mastered' | 'review_needed';
  attempts: number;
  lastPracticed: number;
  isFavorite?: boolean; // New: allow saving words
  history: string[]; // Store previous feedback for context
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export type CharacterType = 'teddy' | 'frog' | 'unicorn' | 'dragon';
export type CharacterStyle = 'neutral' | 'bowtie' | 'hairbow';

export interface CharacterProfile {
  type: CharacterType;
  style: CharacterStyle;
  name: string; // "Teddy", "Sparkle", etc.
}

export interface StoryState {
  hasStarted: boolean;
  theme: string;
  hero: string;
  animal: string;
  items: { item1: string; item2: string; item3: string };
  availableItems: string[];
  segments: string[];
}

export interface AppState {
  memory: Memory;
  chatHistory: ChatMessage[];
  character: CharacterProfile;
  storyState: StoryState;
}

export enum TeddyMood {
  NEUTRAL = 'neutral',
  HAPPY = 'happy',
  THINKING = 'thinking',
  TALKING = 'talking',
  SURPRISED = 'surprised',
  SAD = 'sad',
  EXCITED = 'excited'
}

export type AppMode = 'landing' | 'chat' | 'story' | 'therapy';