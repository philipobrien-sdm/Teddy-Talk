import { GoogleGenAI, FunctionDeclaration, Type, Tool, Modality, Part, Content } from "@google/genai";
import { Memory, ChatMessage, CharacterProfile, TeddyMood, SpeechTask } from "../types";
import { getSystemInstruction, THERAPY_SYSTEM_INSTRUCTION, STORY_SYSTEM_INSTRUCTION, SPEECH_TREE } from "../constants";

// Custom Error Class for API handling
export class GeminiError extends Error {
  public retryDelay: number;
  public isQuotaError: boolean;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "GeminiError";
    
    // Heuristic for backoff based on status
    if (status === 429) {
       this.retryDelay = 60000; // 60s for quota limits (Tier 1 is often 15 RPM)
       this.isQuotaError = true;
       this.message = "I'm thinking too fast! I need a short nap.";
    } else if (status === 503) {
       this.retryDelay = 10000; // 10s for service overload
       this.isQuotaError = false;
       this.message = "My brain is a bit foggy. Give me a moment.";
    } else {
       this.retryDelay = 5000; // 5s default for transient errors
       this.isQuotaError = false;
       this.message = message || "Something went wrong. Let's try again.";
    }
  }
}

// Helper to wrap API calls
async function withErrorHandling<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error: any) {
        console.error("Gemini API Error details:", error);
        
        // Extract status if available (GoogleGenAI often puts it in 'status' or inside 'response')
        let status = error.status || error.response?.status;
        let message = error.message;

        // Check for common 429 patterns in message if status is missing
        if (!status && message && (message.includes("429") || message.includes("quota"))) {
            status = 429;
        }
        if (!status && message && (message.includes("503") || message.includes("overloaded"))) {
            status = 503;
        }

        throw new GeminiError(message, status);
    }
}

// Tool: Update Memory
const updateMemoryTool: FunctionDeclaration = {
  name: "updateMemory",
  description: "Updates the long-term memory about the child. Use this to save facts (name, age) AND inferred preferences.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      key: {
        type: Type.STRING,
        description: "The category of information (e.g., 'childName', 'favoriteColor', 'inferred_mood_pattern')."
      },
      value: {
        type: Type.STRING,
        description: "The specific information to save."
      },
      action: {
        type: Type.STRING,
        description: "Either 'set' to overwrite or 'add' to append to a list.",
        enum: ["set", "add"]
      }
    },
    required: ["key", "value", "action"]
  }
};

// Tool: Update Character Name
const updateCharacterNameTool: FunctionDeclaration = {
  name: "updateCharacterName",
  description: "Updates YOUR own name based on what the child decides to call you.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      newName: {
        type: Type.STRING,
        description: "The name the child has given you."
      }
    },
    required: ["newName"]
  }
};

// Tool: Set Mood
const setMoodTool: FunctionDeclaration = {
  name: "setMood",
  description: "Sets your facial expression/mood. Use this to react emotionally to what the child says.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      mood: {
        type: Type.STRING,
        description: "The mood to switch to.",
        enum: ["happy", "sad", "excited", "surprised", "neutral"]
      }
    },
    required: ["mood"]
  }
};

// Tool: Manage Speech Task
const manageSpeechTaskTool: FunctionDeclaration = {
  name: "manageSpeechTask",
  description: "Updates the status of a speech therapy task and generates a report for parents.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      taskId: { type: Type.STRING },
      status: { type: Type.STRING, enum: ['mastered', 'review_needed', 'in_progress'] },
      urgency: { type: Type.STRING, enum: ['high', 'medium', 'low'], description: "How urgent is practice needed for this word?" },
      strengths: { type: Type.STRING, description: "What the child did well (for Parent Report)." },
      needsWork: { type: Type.STRING, description: "Specific sounds/areas needing work (for Parent Report)." },
      howToHelp: { type: Type.STRING, description: "One simple actionable tip for the parent." },
      feedback: { type: Type.STRING, description: "Short summary of the issue (internal use)." }
    },
    required: ["taskId", "status"]
  }
};

const chatTools: Tool[] = [
  {
    functionDeclarations: [updateMemoryTool, updateCharacterNameTool, setMoodTool]
  }
];

const therapyTools: Tool[] = [
    {
        functionDeclarations: [manageSpeechTaskTool, setMoodTool]
    }
]

export class GeminiService {
  private ai: GoogleGenAI;
  private chatModelId: string = "gemini-2.5-flash";
  private ttsModelId: string = "gemini-2.5-flash-preview-tts";

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  // --- Baseline Analysis ---
  async analyzeBaseline(
    recordings: { word: string; phoneme: string; audioBase64: string; mimeType?: string }[],
    defaultMimeType: string = 'audio/wav' 
  ): Promise<any> {
    return withErrorHandling(async () => {
        const parts: Part[] = [
          { 
            text: `
            SYSTEM: Speech Therapy Baseline Analysis.
            
            TASK:
            You will receive audio clips of a child saying 10 specific diagnostic words.
            Your goal is to establish a 'Speech Tree Baseline' for the child.
            
            INPUTS:
            I will provide the audio clips and their corresponding target words below.
            
            WORDS & TARGET PHONEMES:
            ${recordings.map((r, i) => `${i+1}. "${r.word}" (Target: ${r.phoneme})`).join('\n')}
            
            INSTRUCTIONS:
            1. Listen to EACH audio clip.
            2. Determine if the target phoneme was produced correctly (approximations are okay for age, but clear substitutions like 'W' for 'R' should be noted).
            3. Identify the "Break Point": The developmental level where the child begins to struggle (Early 8 vs Middle 8 vs Late 8).
            4. Generate a 'recommendedStartingPoint' (e.g., "Middle 8").
            5. Write a short, encouraging summary for the parent.

            OUTPUT FORMAT (JSON):
            {
              "results": [
                { "word": "Baby", "phoneme": "B", "isCorrect": true, "notes": "Clear production" },
                ...
              ],
              "summary": "...",
              "recommendedStartingPoint": "..."
            }
            ` 
          }
        ];

        // Append audio parts
        recordings.forEach((rec, index) => {
           parts.push({ text: `Audio #${index + 1} for word "${rec.word}":` });
           parts.push({ 
               inlineData: { 
                   mimeType: rec.mimeType || defaultMimeType, 
                   data: rec.audioBase64 
               } 
           });
        });

        const result = await this.ai.models.generateContent({
            model: this.chatModelId,
            contents: { role: 'user', parts: parts },
            config: { responseMimeType: 'application/json' }
        });
        
        return JSON.parse(result.text || '{}');
    });
  }

  // --- Chat Logic ---

  private async executeChat(
    history: ChatMessage[],
    prompt: string | Part[],
    memory: Memory,
    character: CharacterProfile,
    onMemoryUpdate: (key: string, value: any, action: 'set' | 'add') => void,
    onCharacterUpdate: (newName: string) => void,
    onMoodUpdate: (mood: TeddyMood) => void
  ): Promise<string> {
    return withErrorHandling(async () => {
        const isNameSet = character.name.toLowerCase() !== character.type.toLowerCase();
        
        const systemInstruction = getSystemInstruction(character.name, character.type, character.style, isNameSet) + "\n\nMEMORY:\n" + JSON.stringify(memory);

        const contents: Content[] = history.map(h => ({
            role: h.role,
            parts: [{ text: (h.text && h.text.trim().length > 0) ? h.text : "..." }] 
        }));

        const newParts: Part[] = typeof prompt === 'string' ? [{ text: prompt }] : prompt;
        contents.push({ role: 'user', parts: newParts });

        let finalResponseText = "";
        let turnCount = 0;
        const MAX_TURNS = 5; 

        while (turnCount < MAX_TURNS) {
            turnCount++;
            
            const result = await this.ai.models.generateContent({
                model: this.chatModelId,
                contents: contents,
                config: {
                    systemInstruction: systemInstruction,
                    tools: chatTools,
                    temperature: 0.7,
                },
            });

            const responseContent = result.candidates?.[0]?.content;
            
            if (!responseContent || !responseContent.parts) {
                console.warn("Received empty content from model.");
                if (turnCount === 1) finalResponseText = "I'm sorry, I got distracted by a butterfly. What did you say?";
                break;
            }

            const validResponseParts = responseContent.parts.filter(p => {
                 if (p.text !== undefined) return p.text.trim().length > 0;
                 return !!p.functionCall || !!p.inlineData;
            });

            if (validResponseParts.length === 0) {
                 if (!finalResponseText) finalResponseText = "I can't talk about that right now, but let's play!";
                 break;
            }

            contents.push({ role: 'model', parts: validResponseParts });

            const functionCalls = validResponseParts.filter(p => !!p.functionCall).map(p => p.functionCall);

            if (functionCalls.length > 0) {
               const functionResponseParts: Part[] = [];
               
               for (const call of functionCalls) {
                 if (!call) continue;
                 let toolResult = {};

                 if (call.name === 'updateMemory') {
                   const args = call.args as any;
                   onMemoryUpdate(args.key, args.value, args.action);
                   toolResult = { result: "Memory updated." };
                 } else if (call.name === 'updateCharacterName') {
                    const args = call.args as any;
                    onCharacterUpdate(args.newName);
                    toolResult = { result: `Name updated to ${args.newName}.` };
                 } else if (call.name === 'setMood') {
                    const args = call.args as any;
                    onMoodUpdate(args.mood as TeddyMood);
                    toolResult = { result: `Mood set to ${args.mood}.` };
                 } else {
                     toolResult = { result: "Function executed." };
                 }

                 functionResponseParts.push({
                   functionResponse: {
                     name: call.name,
                     response: toolResult,
                     id: call.id 
                   }
                 });
               }

               contents.push({ role: 'user', parts: functionResponseParts });
               continue; 

            } else {
              finalResponseText = validResponseParts.find(p => p.text)?.text || "";
              break;
            }
        }

        return finalResponseText || "...";
    });
  }

  // --- Audio Diagnostic ---
  async testAudioInput(audioBase64: string, mimeType: string = 'audio/wav'): Promise<{ text: string; quality: string; issues: string }> {
      return withErrorHandling(async () => {
          const prompt = `
            SYSTEM: Audio Quality & Transcription Test.
            ... (instructions)
            Return JSON format: { "text": "...", "quality": "...", "issues": "..." }
          `;

          const result = await this.ai.models.generateContent({
              model: this.chatModelId,
              contents: {
                  role: 'user',
                  parts: [
                      { text: prompt },
                      { inlineData: { mimeType: mimeType, data: audioBase64 } }
                  ]
              },
              config: { responseMimeType: 'application/json' }
          });
          
          return JSON.parse(result.text || '{ "text": "Error parsing response", "quality": "Unknown", "issues": "AI failed to respond" }');
      });
  }

  // --- Therapy Logic ---

  async generateTherapyTask(memory: Memory, excludeWord?: string, forcedPhoneme?: string): Promise<SpeechTask> {
    return withErrorHandling(async () => {
        const parentTargets = memory.targetWords || [];
        const tasks = memory.speechTasks || [];
        
        // Analyze Performance
        const phonemePerformance: Record<string, { attempts: number; mastered: number }> = {};
        tasks.forEach(t => {
            if (!t.targetPhoneme) return;
            if (!phonemePerformance[t.targetPhoneme]) phonemePerformance[t.targetPhoneme] = { attempts: 0, mastered: 0 };
            phonemePerformance[t.targetPhoneme].attempts++;
            if (t.status === 'mastered') phonemePerformance[t.targetPhoneme].mastered++;
        });

        const strugglePhonemes = Object.keys(phonemePerformance).filter(p => {
            const stats = phonemePerformance[p];
            return stats.attempts > 2 && (stats.mastered / stats.attempts) < 0.4;
        });

        const masteredPhonemes = Object.keys(phonemePerformance).filter(p => {
            const stats = phonemePerformance[p];
            return stats.mastered > 2;
        });
        
        let recommendedStart = memory.baseline?.recommendedStartingPoint;

        const prompt = `
          You are a Speech Therapist assistant...
          PHONETIC TREE: ${JSON.stringify(SPEECH_TREE)}
          CHILD PROFILE:
          - Struggling: ${strugglePhonemes.join(', ')}
          - Mastered: ${masteredPhonemes.join(', ')}
          - Baseline: ${recommendedStart}
          - Targets: ${JSON.stringify(parentTargets)}
          ${excludeWord ? `- EXCLUDE: "${excludeWord}".` : ''}
          ${forcedPhoneme ? `- **MANDATORY**: Pick a word for phoneme "${forcedPhoneme}".` : ''}
          
          Return strictly JSON: { "word": "Rabbit", "targetPhoneme": "R" }.
        `;

        const result = await this.ai.models.generateContent({
            model: this.chatModelId,
            contents: prompt,
            config: { responseMimeType: 'application/json' }
        });
        const data = JSON.parse(result.text || "{}");
        if (!data.word) throw new Error("Invalid format");
        
        return {
            id: Date.now().toString(),
            word: data.word,
            targetPhoneme: data.targetPhoneme || data.word.charAt(0).toUpperCase(),
            status: 'new',
            attempts: 0,
            lastPracticed: Date.now(),
            history: []
        };
    });
  }

  async assessPronunciation(
    audioBase64: string, 
    task: SpeechTask, 
    character: CharacterProfile,
    onMoodUpdate: (mood: TeddyMood) => void,
    onTaskUpdate: (taskId: string, updates: Partial<SpeechTask>) => void,
    mimeType: string = 'audio/wav'
  ): Promise<string> {
    return withErrorHandling(async () => {
        const prompt = `
          Target Word: "${task.word}"...
          Instructions: 1. Listen. 2. Call 'manageSpeechTask'. 3. Speak to child.
        `;

        const parts: Part[] = [{ text: prompt }];
        if (audioBase64 && audioBase64.length > 0) {
             parts.push({ inlineData: { mimeType: mimeType, data: audioBase64 } });
        }

        const response = await this.ai.models.generateContent({
            model: this.chatModelId,
            contents: { role: 'user', parts: parts },
            config: {
                systemInstruction: THERAPY_SYSTEM_INSTRUCTION,
                tools: therapyTools
            }
        });

        let finalText = "";
        const content = response.candidates?.[0]?.content;
        
        if (content && content.parts) {
            const calls = content.parts.filter(p => !!p.functionCall).map(p => p.functionCall);
            if (calls.length > 0) {
                for (const call of calls) {
                    if (!call) continue;
                    if (call.name === 'setMood') {
                        onMoodUpdate((call.args as any).mood);
                    }
                    if (call.name === 'manageSpeechTask') {
                        const args = call.args as any;
                        const updates: Partial<SpeechTask> = {
                            status: args.status,
                            urgency: args.urgency,
                        };
                        if (args.strengths || args.needsWork || args.howToHelp) {
                            updates.report = {
                                strengths: args.strengths,
                                needsWork: args.needsWork,
                                howToHelp: args.howToHelp
                            };
                        }
                        onTaskUpdate(args.taskId, updates);
                    }
                }
            }
            const textPart = content.parts.find(p => !!p.text);
            if (textPart) finalText = textPart.text || "";
        }
        
        return finalText || "I couldn't quite hear that. Can you try again?";
    });
  }

  // --- Story Logic (Interactive) ---
  
  async generateRandomStoryParams(memory: Memory, history: ChatMessage[]): Promise<{ theme: string; hero: string; animal: string; items: string[] }> {
      return withErrorHandling(async () => {
          const recentChat = history.slice(-5).map(m => m.text).join('\n');
          const prompt = `
            Invent a story concept based on Memory: ${JSON.stringify(memory)} and Chat: ${recentChat}.
            Return STRICT JSON: { "theme": "...", "hero": "...", "animal": "...", "items": ["...", "...", "..."] }
          `;

          const result = await this.ai.models.generateContent({
              model: this.chatModelId,
              contents: prompt,
              config: { responseMimeType: 'application/json' }
          });
          return JSON.parse(result.text || "{}");
      });
  }

  async generateStoryIntro(
    inputs: { theme: string; hero: string; animal: string; items: string[] },
    memory: Memory
  ): Promise<string> {
    return withErrorHandling(async () => {
        const childContext = `Child Name: ${memory.childName || 'Friend'}, Age: ${memory.childAge || 'Unknown'}, Gender: ${memory.childGender || 'Unknown'}`;
        const prompt = `
          Write Story BEGINNING (MAX 450 CHARS).
          - Theme: ${inputs.theme}
          - Hero: ${inputs.hero}
          - Animal: ${inputs.animal}
          - Items: ${inputs.items.join(', ')}.
          Context: ${childContext}
          End by asking to pick an item.
        `;
        return this.callStoryModel(prompt);
    });
  }

  async generateStoryChapter(
    storyContext: string,
    selectedItem: string,
    remainingItems: string[]
  ): Promise<string> {
    return withErrorHandling(async () => {
        const prompt = `
          STORY SO FAR: ${storyContext}
          ACTION: Uses ${selectedItem}.
          REMAINING: ${remainingItems.join(', ')}.
          Write Next Chapter (MAX 450 CHARS). End by asking to pick remaining item.
        `;
        return this.callStoryModel(prompt);
    });
  }

  async generateStoryConclusion(
    storyContext: string,
    selectedItem: string
  ): Promise<string> {
    return withErrorHandling(async () => {
        const prompt = `
          STORY SO FAR: ${storyContext}
          ACTION: Uses ${selectedItem} to solve final problem.
          Write Conclusion (MAX 450 CHARS).
        `;
        return this.callStoryModel(prompt);
    });
  }

  private async callStoryModel(prompt: string): Promise<string> {
    const result = await this.ai.models.generateContent({
        model: this.chatModelId,
        contents: prompt,
        config: {
            systemInstruction: STORY_SYSTEM_INSTRUCTION
        }
    });
    return result.text || "The pages of the book got stuck! Let's try that again.";
  }

  // --- Public Wrappers ---

  async sendMessage(
    history: ChatMessage[],
    currentMessage: string,
    currentMemory: Memory,
    character: CharacterProfile,
    onMemoryUpdate: (key: string, value: any, action: 'set' | 'add') => void,
    onCharacterUpdate: (newName: string) => void,
    onMoodUpdate: (mood: TeddyMood) => void
  ): Promise<string> {
    return this.executeChat(history, currentMessage, currentMemory, character, onMemoryUpdate, onCharacterUpdate, onMoodUpdate);
  }

  async resumeSession(
    history: ChatMessage[],
    currentMemory: Memory,
    character: CharacterProfile,
    onMemoryUpdate: (key: string, value: any, action: 'set' | 'add') => void,
    onCharacterUpdate: (newName: string) => void,
    onMoodUpdate: (mood: TeddyMood) => void
  ): Promise<string> {
    const resumePrompt = "[SYSTEM EVENT]: The user has just loaded a saved session. Briefly welcome them back.";
    return this.executeChat(history, resumePrompt, currentMemory, character, onMemoryUpdate, onCharacterUpdate, onMoodUpdate);
  }

  async startNewSession(
    currentMemory: Memory,
    character: CharacterProfile,
    onMemoryUpdate: (key: string, value: any, action: 'set' | 'add') => void,
    onCharacterUpdate: (newName: string) => void,
    onMoodUpdate: (mood: TeddyMood) => void
  ): Promise<string> {
    const newSessionPrompt = "[SYSTEM EVENT]: The user has started a NEW session but kept their memory file. Greet them warmly.";
    return this.executeChat([], newSessionPrompt, currentMemory, character, onMemoryUpdate, onCharacterUpdate, onMoodUpdate);
  }

  async generateSpeech(text: string, voiceName: string = 'Puck', charLimit: number = 500): Promise<Uint8Array | null> {
    // Note: TTS usually doesn't have complex conversational logic, so we keep simple error logging,
    // but wrapping it allows catching 429s here too.
    return withErrorHandling(async () => {
        // Configurable limit
        const safeText = text.length > charLimit ? text.substring(0, charLimit) + "..." : text;
        
        const response = await this.ai.models.generateContent({
            model: this.ttsModelId,
            contents: [{ parts: [{ text: safeText }] }],
            config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voiceName } 
                }
            }
            }
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
            return this.base64ToBytes(base64Audio);
        }
        return null;
    });
  }

  private base64ToBytes(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const length = binaryString.length;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
}

export const geminiService = new GeminiService();
