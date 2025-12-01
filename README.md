# Cerebrum Flux - Cognitive Agility Engine

## Overview
Cerebrum Flux is a specialized AI-powered assessment engine designed to measure Cognitive Agility—the ability to shift frameworks, generate novel connections, and integrate disparate types of reasoning.

Unlike standard IQ tests that measure processing speed or working memory within fixed rules, Cerebrum Flux acts as a Cognitive Mirror. Powered by Google's Gemini 2.5 Flash model, it evaluates users across 10 distinct dimensions of thought, analyzes their reasoning in real-time, and maps them to one of 16 comprehensive Cognitive Archetypes (e.g., The Explorer, The Systems Engineer, The Meta-Theorist).

## ⚡ Key Features

### 🧠 The 10-Dimension Cognitive Engine
The app guides users through 10 interactive modules, each probing a specific "muscle" of the mind:

*   **Creative Velocity**: Divergent thinking speed and variety.
*   **Systems Intuition**: Predicting cascades in dynamic systems.
*   **Cross-Domain Transfer**: Mapping metaphors between unrelated fields (e.g., Economics ↔ Baking).
*   **Conceptual Synthesis**: Merging opposing philosophies into stable new concepts.
*   **Reflective Depth**: Analyzing personal belief shifts and hidden assumptions.

### 📊 Dynamic Analysis & Scoring
*   **Flux Metric**: We do not use bell curves. Scores are calculated using a Raw Score (0-10) multiplied by an Integration Factor (0.5x - 1.5x), rewarding elegance and coherence over simple correctness.
*   **Real-Time Feedback**: The AI provides instant, philosophical analysis of every answer, acting as a mirror to the user's thought process.
*   **Flux Radar**: A dynamic SVG/Recharts visualization that maps the "shape" of the user's mind.

### 🧬 Archetype Profiling
*   **16 Unique Profiles**: Based on the interaction of Quadrants (Synthesist, Architect, Wanderer, Analyst) and Drivers (Curiosity, Creativity, Logic, Insight).
*   **Comprehensive Reports**: The final output includes a Narrative Summary, Cognitive Cluster analysis, and specific advice on leverage and growth.

### 📝 Exportable Artifacts
*   **Interactive HTML Reports**: Users can download a self-contained HTML file containing their full profile, interactive charts, and session transcript.
*   **JSON Data**: Full session history export for archival or re-analysis.

## 🚀 Installation and Setup in Google AI Studio
Follow these steps to download the code and run your own instance of the application in Google AI Studio.

### Prerequisites
*   **Google Account**: You need a Google account to use Google AI Studio.
*   **Gemini API Key**: The application requires your own Gemini API key to function.
    1.  Go to [Google AI Studio](https://aistudio.google.com/).
    2.  Click on "Get API key" in the top-left menu.
    3.  Create and copy your key.

### Step 1: Download the Project
Ensure you have the following file structure in your project folder:

*   index.html
*   index.tsx
*   App.tsx
*   types.ts
*   components/ (Folder containing TaskView, AnalysisView, etc.)
*   services/ (Folder containing geminiService.ts, htmlGenerator.ts)
*   data/ (Folder containing examples.ts)

### Step 2: Prepare the ZIP for AI Studio
AI Studio requires the index.html file to be at the root of the zip file.

1.  Select all the project files and folders.
2.  Right-click and compress them into a ZIP file (e.g., `cerebrum-flux.zip`).

### Step 3: Upload and Run
1.  Go to the Google AI Studio App Gallery.
2.  Click "Create new" and select "Zip upload".
3.  **Upload Your ZIP**: Select `cerebrum-flux.zip`.
4.  **Add Your API Key**:
    *   Locate the "Secrets" panel on the left (key icon 🔑).
    *   Click "Add new secret".
    *   **Name**: `API_KEY` (Must be exact).
    *   **Value**: Paste your Gemini API key.
    *   Click Save.
5.  The application will build and launch automatically.

## 🔒 Privacy & Architecture
*   **Client-Side Processing**: All state management and graph rendering happen in the browser via React.
*   **Stateless AI**: User inputs are sent to the Gemini API solely for scoring and analysis. No personal data is stored on external servers to train models.
*   **Local Persistence**: Session state is saved to localStorage to prevent data loss during a refresh, but stays on your device.

## ⚙️ Tech Stack
*   **Core**: React 19, TypeScript, Vite
*   **AI**: Google GenAI SDK (@google/genai) using gemini-2.5-flash
*   **Visualization**: Recharts (Radar/Spider diagrams), Custom SVG generation for exports
*   **Styling**: Tailwind CSS (via CDN)