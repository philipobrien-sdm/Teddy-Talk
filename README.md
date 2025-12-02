# Teddy Talk - AI Speech & Story Companion

## Overview
Teddy Talk is a safe, playful, and educational web application designed to help children develop speech confidence and social skills through interaction with a charming AI character.

Powered by Google's **Gemini 2.5 Flash** models, the app provides real-time conversation, gamified speech therapy exercises, and interactive storytelling.

![IMG_0307](https://github.com/user-attachments/assets/86073113-e0a7-49f9-bb39-cef52596220d)


## 🧸 Key Features

### 🗣️ Interactive Chat
*   **Customizable Friends**: Choose between a Teddy, Frog, Unicorn, or Dragon.
*   **Personalized Memory**: The AI remembers the child's name, favorite things, and past conversations to build a meaningful connection.
*   **Safe Interaction**: Strict system prompts ensure the AI remains child-friendly, pivoting away from sensitive topics.

### 🎤 Speech Therapy Engine
*   **Baseline Assessment**: A 10-word diagnostic checkup (using Gemini's multimodal audio capabilities) to estimate the child's phonetic development level (Early, Middle, or Late 8).
*   **Gamified Practice**: A "Word Game" where children practice specific sounds. The AI acts as a speech pathologist, listening to audio and providing encouraging, specific feedback.
*   **Phoneme Tracking**: Tracks attempts and mastery of specific sounds (e.g., "R", "S", "TH").

### 📚 Magic Story Mode
*   **Co-Creation**: The AI generates story premises based on the child's interests.
*   **Interactive Choices**: Stories pause to let the child use "items" to solve problems, fostering critical thinking.
*   **Audiobooks**: Completed stories can be downloaded as WAV files (generated via Gemini TTS).

### 🛡️ Parent Dashboard
*   **Progress Reports**: View mastery of specific sounds and AI-generated summaries of practice sessions.
*   **Settings**: Configure voice engine (High-quality AI vs. Fast Browser TTS) and target practice words.
*   **Safeguarding**: Review the AI's safety protocols.

## 🚀 Setup & Installation

### Prerequisites
1.  **Google AI Studio API Key**: You need a valid API key from [Google AI Studio](https://aistudio.google.com/).
2.  **Microphone Access**: The app requires microphone permissions for speech interaction.

### Running the App
1.  Clone or download the repository.
2.  Ensure you have an environment capable of running the React/Vite stack (or upload to an online IDE like StackBlitz/CodeSandbox).
3.  **Important**: The application expects the API key to be available via `process.env.API_KEY`.

## 🔒 Privacy & Architecture
*   **Local Storage**: All chat history, memory, and progress are stored locally in the browser's `localStorage`. No database required.
*   **Privacy**: Audio is processed by the Gemini API for immediate analysis and response generation but is not stored for model training by default (subject to Google's API terms).
*   **Exportable Data**: Parents can export the entire memory state to a JSON file for backup or transfer.

## ⚙️ Tech Stack
*   **Frontend**: React 19, Tailwind CSS
*   **AI Model**: Google Gemini 2.5 Flash (for Chat, Audio Analysis) & Gemini 2.5 Flash TTS (for Speech)
*   **Audio**: Web Audio API for recording and processing.
