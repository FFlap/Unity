# Unity

Unity is a browser extension that makes the internet clearer, more accessible, and more intentional. It enhances how users search, read, and interact online by adding intelligent ranking, distraction free reading, and explainable content analysis, all without disrupting the original website. With built-in accesssibility tools like color blind mode, reduced motion support, and audio playback, Unity ensures content is easier to process for different needs and preferences. From refining Google search results to simplifying cluttered articles and helping users understand what a page actually says, Unity acts as a lightweight clarity layer on top of the web.

## What It Does

- Works on regular webpages and YouTube videos.
- Builds local tab context by extracting visible text (and YouTube transcript when available).
- Lets you ask questions in a chat UI.
- Returns answers grounded only in the current tab's extracted context.
- Provides source chips per answer that jump to supporting text:
  - Webpages: inline highlight + scroll to matching text.
  - YouTube: seek to transcript timestamp when available.
- Enhances Google search results based on your intent
- Distraction-free Reader Mode for cleaner articles
- Text-to-speech Audio Mode with adjustable speed
- Smart content summaries and tone analysis
- One-click Autofill for common form fields
- Built-in Color Blind Mode for improved contrast
- Reduced Motion Mode for a calmer experience
- Lightweight, non-intrusive design that works on top of existing sites

## How we built it
Unity is a Chrome extension built with TypeScript, React, and WXT. The background service handles scanning, grounded chat, and per-tab session state. Content scripts handle on-page accessibility behaviors like Reader Mode, selection simplify/summarize actions, audio follow mode, and in-page YouTube controls. The popup provides unified controls for chat, reader, audio, profile, and autofill.

For trust and accessibility together, Unity extracts context from the current tab (article text or transcript), ranks evidence snippets, and generates answers constrained to that evidence. If evidence is weak, it avoids confident guessing.

## What’s next for Unity
Expand dyslexia-focused reading modes with more granular language-level controls. Improve color-blind presets with user-tunable contrast and pattern cues. Strengthen keyboard-first navigation and screen-reader semantics across pop-up and in-page UI. Add deeper transcript navigation tools for long videos. Add privacy-first controls for stored context and retention, so accessibility support stays safe by default.



## Setup

1. Install dependencies:

```bash
npm install
```

2. Run extension dev server:

```bash
npm run dev:stable
```

3. Add your OpenRouter API key in Unity settings inside the popup.
4. Ensure microphone permissions are set to **Allow** for voice dictation:
   - `chrome-extension://<your-extension-id>` for popup voice input.
   - `youtube.com` for in-page YouTube voice input.

## Build

```bash
npm run build
```

## Notes

- Answers are intentionally constrained to tab-local context.
- If context is insufficient, Unity returns an insufficient-evidence style answer instead of fabricating details.
- Voice dictation requires microphone permission set to **Allow**.

