import { GoogleGenAI, FunctionDeclaration, Type, Tool, Modality, Part, Content } from "@google/genai";
import { Memory, ChatMessage, CharacterProfile, TeddyMood, SpeechTask } from "../types";
import { getSystemInstruction, THERAPY_SYSTEM_INSTRUCTION, STORY_SYSTEM_INSTRUCTION } from "../constants";

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
  description: "Updates the status of a speech therapy task/word.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      taskId: { type: Type.STRING },
      status: { type: Type.STRING, enum: ['mastered', 'review_needed', 'in_progress'] },
      feedback: { type: Type.STRING, description: "Short summary of the issue (e.g. 'Struggled with R sound')" }
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
    
    const isNameSet = character.name.toLowerCase() !== character.type.toLowerCase();
    
    // Pass style to help with gender/appearance context
    const systemInstruction = getSystemInstruction(character.name, character.type, character.style, isNameSet) + "\n\nMEMORY:\n" + JSON.stringify(memory);

    // Build the initial content history from ChatMessages
    const contents: Content[] = history.map(h => ({
        role: h.role,
        parts: [{ text: (h.text && h.text.trim().length > 0) ? h.text : "..." }] 
    }));

    // Add the new user message
    const newParts: Part[] = typeof prompt === 'string' ? [{ text: prompt }] : prompt;
    contents.push({ role: 'user', parts: newParts });

    let finalResponseText = "";
    let turnCount = 0;
    const MAX_TURNS = 5; // Prevent infinite loops

    try {
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
        
        // Error handling: if responseContent is undefined, we simply break gracefully
        if (!responseContent || !responseContent.parts) {
            console.warn("Received empty content from model.");
            if (turnCount === 1) finalResponseText = "I'm sorry, I got distracted by a butterfly. What did you say?";
            break;
        }

        // Clean parts to avoid empty text parts in history
        const validResponseParts = responseContent.parts.filter(p => {
             if (p.text !== undefined) return p.text.trim().length > 0;
             return !!p.functionCall || !!p.inlineData;
        });

        if (validResponseParts.length === 0) {
             // Sometimes the model returns empty parts but has a finish reason like SAFETY
             // We can just break and return a default if it's the first turn, or the accumulated text
             if (!finalResponseText) finalResponseText = "I can't talk about that right now, but let's play!";
             break;
        }

        // Append the MODEL turn to history
        contents.push({ role: 'model', parts: validResponseParts });

        // Check for function calls
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
                 id: call.id // Pass back the ID from the call
               }
             });
           }

           // Append the FUNCTION response
           contents.push({ role: 'user', parts: functionResponseParts });
           
           // Loop again to let model generate text after function result
           continue; 

        } else {
          // No function calls, just text
          // Extract text for the UI
          finalResponseText = validResponseParts.find(p => p.text)?.text || "";
          break;
        }
      }

    } catch (error) {
      console.error("Gemini Interaction Error:", error);
      return "Oh no! My fluff got in a twist. Can you say that again? 🧸";
    }

    return finalResponseText || "...";
  }

  // --- Therapy Logic ---

  async generateTherapyTask(memory: Memory): Promise<SpeechTask> {
    const parentTargets = memory.targetWords || [];
    const parentMastered = memory.masteredWords || [];
    
    // Logic: 
    // 60% chance to pick a Target word (if available) to challenge.
    // 20% chance to pick a Mastered word (if available) to boost confidence.
    // 20% chance (or fallback) to pick a random new word suitable for age.
    
    const prompt = `
      You are a Speech Therapist assistant.
      
      CONTEXT:
      - Child's Age: ${memory.childAge || 'Unknown'}
      - Parent's TARGET list (Needs practice): ${JSON.stringify(parentTargets)}
      - Parent's MASTERED list (Good for confidence): ${JSON.stringify(parentMastered)}
      
      INSTRUCTIONS:
      1. Choose ONE word for the child to practice.
      2. Prioritize words from the 'TARGET' list (most important).
      3. Occasionally choose from 'MASTERED' list to build confidence.
      4. If lists are empty, choose a fun, simple word appropriate for the child's age (e.g. animals, colors, toys).
      
      Return strictly JSON: { "word": "Rabbit", "targetPhoneme": "R" }.
    `;

    try {
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
            targetPhoneme: data.targetPhoneme,
            status: 'new',
            attempts: 0,
            lastPracticed: Date.now(),
            history: []
        };
    } catch (e) {
        return { id: 'default', word: 'Sunshine', targetPhoneme: 'S', status: 'new', attempts: 0, lastPracticed: Date.now(), history: [] };
    }
  }

  async assessPronunciation(
    audioBase64: string, 
    task: SpeechTask, 
    character: CharacterProfile,
    onMoodUpdate: (mood: TeddyMood) => void,
    onTaskUpdate: (taskId: string, status: string, feedback: string) => void
  ): Promise<string> {
    
    // Logic updated to be less rigid. Just report the attempt count.
    const prompt = `
      Target Word: "${task.word}".
      Audio Context: The child was asked to say the word 3 times.
      This is Attempt #${task.attempts + 1} for this word session.
      Previous Feedback History: ${task.history.join('. ')}.
      
      Instructions:
      1. Listen to the audio.
      2. If ANY repetition is correct, celebrate! Set mood to EXCITED and task status to 'mastered'.
      3. If incorrect:
         - Provide simple, encouraging feedback on *how* to fix the sound.
         - Do NOT say "Game Over" or force them to stop.
         - Simply encourage them to "Try again!"
      4. If attempt count is high (>3), you can gently suggest: "We can try again, or you can pick a new word if you want!"
      
      Speak directly to the child. Keep it short.
    `;

    try {
        // Construct parts carefully to ensure no empty data is sent
        const parts: Part[] = [{ text: prompt }];
        if (audioBase64 && audioBase64.length > 0) {
             parts.push({ inlineData: { mimeType: 'audio/webm', data: audioBase64 } });
        } else {
             console.warn("Audio data was empty, sending only text prompt.");
        }

        const response = await this.ai.models.generateContent({
            model: this.chatModelId,
            contents: {
                role: 'user',
                parts: parts
            },
            config: {
                systemInstruction: THERAPY_SYSTEM_INSTRUCTION,
                tools: therapyTools
            }
        });

        // Handle tool calls
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
                        onTaskUpdate(args.taskId, args.status, args.feedback);
                    }
                }
            }
            
            const textPart = content.parts.find(p => !!p.text);
            if (textPart) finalText = textPart.text || "";
        }
        
        return finalText || "I couldn't quite hear that. Can you try again?";

    } catch (e) {
        console.error("Analysis Error", e);
        return "My ears are a bit fuzzy. One more time?";
    }
  }

  // --- Story Logic (Interactive) ---
  
  async generateRandomStoryParams(memory: Memory, history: ChatMessage[]): Promise<{ theme: string; hero: string; animal: string; items: string[] }> {
      const recentChat = history.slice(-5).map(m => m.text).join('\n');
      const prompt = `
        Based on the child's memory and recent chat, invent a creative story concept.
        Memory: ${JSON.stringify(memory)}
        Recent Chat: ${recentChat}

        Constraints:
        - Hero Name: Use child's name if known, else "Alex".
        - Theme: Magical, adventurous, or related to recent chat topics.
        - Items: 3 fun, slightly magical objects (e.g. "Glow Stone", "Tickle Feather").
        
        Return STRICT JSON: { "theme": "...", "hero": "...", "animal": "...", "items": ["...", "...", "..."] }
      `;

      try {
          const result = await this.ai.models.generateContent({
              model: this.chatModelId,
              contents: prompt,
              config: { responseMimeType: 'application/json' }
          });
          return JSON.parse(result.text || "{}");
      } catch (e) {
          return { theme: 'Hidden Treasure', hero: 'Explorer', animal: 'Parrot', items: ['Map', 'Key', 'Compass'] };
      }
  }

  async generateStoryIntro(
    inputs: { theme: string; hero: string; animal: string; items: string[] },
    memory: Memory
  ): Promise<string> {
    const childContext = `Child Name: ${memory.childName || 'Friend'}, Age: ${memory.childAge || 'Unknown'}, Gender: ${memory.childGender || 'Unknown'}`;
    const prompt = `
      Write the BEGINNING of a children's story (MAX 450 CHARACTERS).
      - Theme: ${inputs.theme}
      - Hero: ${inputs.hero}
      - Animal Companion: ${inputs.animal}
      - Available Items: ${inputs.items.join(', ')}.
      
      Context: ${childContext}
      
      INSTRUCTION: 
      1. Set the scene and introduce the characters. 
      2. Present a difficult obstacle.
      3. CRITICAL: End by listing the 3 available items verbally and asking which ONE to use.
    `;
    return this.callStoryModel(prompt);
  }

  async generateStoryChapter(
    storyContext: string,
    selectedItem: string,
    remainingItems: string[]
  ): Promise<string> {
    const prompt = `
      STORY SO FAR: ${storyContext}
      ACTION: The hero uses the ${selectedItem}.
      REMAINING ITEMS: ${remainingItems.join(', ')}.
      
      INSTRUCTION (MAX 450 CHARACTERS): 
      1. Describe how the ${selectedItem} solves the immediate problem.
      2. Have the characters continue until they face a NEW, different obstacle.
      3. CRITICAL: End by listing the remaining items verbally and asking which ONE to use.
    `;
    return this.callStoryModel(prompt);
  }

  async generateStoryConclusion(
    storyContext: string,
    selectedItem: string
  ): Promise<string> {
    const prompt = `
      STORY SO FAR: ${storyContext}
      ACTION: The hero uses the ${selectedItem} to solve the final problem.
      
      INSTRUCTION (MAX 450 CHARACTERS):
      1. Describe how the ${selectedItem} solves the final problem.
      2. Provide a warm, happy conclusion to the adventure.
    `;
    return this.callStoryModel(prompt);
  }

  private async callStoryModel(prompt: string): Promise<string> {
    try {
        const result = await this.ai.models.generateContent({
            model: this.chatModelId,
            contents: prompt,
            config: {
                systemInstruction: STORY_SYSTEM_INSTRUCTION
            }
        });
        return result.text || "The pages of the book got stuck! Let's try that again.";
    } catch (e) {
        console.error("Story Gen Error", e);
        return "Once upon a time... oh dear, I forgot the rest. Ask me again!";
    }
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
    const resumePrompt = "[SYSTEM EVENT]: The user has just loaded a saved session. Briefly welcome them back. Analyze the chat history to see what you were talking about last.";
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
    try {
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
    } catch (error) {
      console.error("Speech Generation Error:", error);
    }
    return null;
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