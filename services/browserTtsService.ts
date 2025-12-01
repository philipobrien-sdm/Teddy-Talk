import { CharacterType } from "../types";

interface VoiceProfile {
  pitch: number;
  rate: number;
}

const VOICE_PROFILES: Record<CharacterType, VoiceProfile> = {
  teddy: { pitch: 0.9, rate: 0.9 },   // Slightly deeper, slower, comforting
  frog: { pitch: 0.6, rate: 0.85 },   // Croaky (low pitch)
  unicorn: { pitch: 1.4, rate: 1.1 }, // High pitched, excited
  dragon: { pitch: 0.5, rate: 0.8 },  // Deep, rumbling
};

export class BrowserTtsService {
  private synth: SpeechSynthesis;
  private voice: SpeechSynthesisVoice | null = null;

  constructor() {
    this.synth = window.speechSynthesis;
    // Load voices immediately
    this.loadVoice();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = () => this.loadVoice();
    }
  }

  private loadVoice() {
    const voices = this.synth.getVoices();
    // Prioritize high quality English voices
    this.voice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Natural'))) 
              || voices.find(v => v.lang.startsWith('en')) 
              || null;
  }

  public stop() {
    if (this.synth.speaking) {
      this.synth.cancel();
    }
  }

  public speak(
    text: string, 
    characterType: CharacterType, 
    onStart?: () => void, 
    onEnd?: () => void
  ): void {
    if (!this.voice) this.loadVoice();
    
    // Cancel existing speech
    this.stop();

    const utterance = new SpeechSynthesisUtterance(text);
    if (this.voice) {
      utterance.voice = this.voice;
    }

    const profile = VOICE_PROFILES[characterType];
    utterance.pitch = profile.pitch;
    utterance.rate = profile.rate;
    utterance.volume = 1;

    utterance.onstart = () => {
      if (onStart) onStart();
    };

    utterance.onend = () => {
      if (onEnd) onEnd();
    };

    utterance.onerror = (e) => {
      console.error("TTS Error", e);
      if (onEnd) onEnd();
    };

    this.synth.speak(utterance);
  }
}

export const browserTtsService = new BrowserTtsService();