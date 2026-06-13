# 👁️ Oneblink — AI Screen Reader for Indian Languages

**Describe any screen in Hindi, Telugu, Tamil, and 8 more Indian languages — powered by on-device AI.**

Oneblink is a Chrome extension that helps blind and visually impaired users understand their screen. It captures a screenshot, describes it using **Gemini Nano** (fully on-device, private), auto-detects the user's spoken language, and reads the description aloud in their native Indian language using **Sarvam AI**.

> 🔒 **Privacy-first**: All AI vision processing happens on-device. No screenshots ever leave your computer.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 👁️ **Describe Screen** | One tap to capture and describe what's visible |
| 🎤 **Voice Questions** | Ask anything about your screen — in any Indian language |
| 🌐 **Auto Language Detection** | Speak in Hindi, Telugu, Tamil… it just works. No settings needed. |
| 🔊 **Indian-Language TTS** | Responses are spoken aloud in your language (Sarvam bulbul:v3) |
| 🔒 **On-Device AI** | Gemini Nano processes everything locally — nothing leaves your device |
| 📝 **Response Transcript** | See what was spoken (for partially sighted users) |

### Supported Languages (via Sarvam AI)

English · Hindi · Telugu · Tamil · Kannada · Malayalam · Marathi · Bengali · Gujarati · Punjabi · Odia

---

## 🏗️ Architecture

```
User speaks (any Indian language)
    │
    ▼
┌─────────────────────────────────┐
│  Sarvam STT-Translate (saaras)  │  ← Auto-detects language
│  Converts speech → English text │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Screenshot capture (Chrome API) │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Gemini Nano (on-device)        │  ← Multimodal: image + text
│  Describes screen in English    │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Sarvam Translate (mayura:v1)   │  ← English → User's language
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Sarvam TTS (bulbul:v3)         │  ← Speaks in user's language
│  30+ natural Indian voices      │
└─────────────────────────────────┘
```

---

## 📦 Structure

```
chrome-extension/
├── manifest.json        # Manifest V3 with languageModel permission
├── config.js            # API config + language map
├── popup.html           # Popup UI
├── popup.css            # Styles (ElevenLabs-inspired dark theme)
├── popup.js             # Core logic — multilingual AI pipeline
├── background.js        # Service worker (manages offscreen mic)
├── offscreen.html/js    # Offscreen document for mic recording
├── tts-client.js        # Standalone TTS client module
├── .env                 # API keys (gitignored)
├── .env.example         # Template for setup
└── icons/               # Extension icons
```

---

## 🚀 Installation

### Step 1 — Set Up API Key

1. Copy `.env.example` to `.env` inside the `chrome-extension/` folder.
2. Add your [Sarvam AI](https://www.sarvam.ai/) API key:
   ```
   SARVAM_API_KEY=your_key_here
   ```

### Step 2 — Enable Gemini Nano (Chrome 138+)

1. Open `chrome://flags` and search for `nano`.
2. Enable **Prompt API for Gemini Nano** → `Enabled`.
3. Enable **Enables optimization guide on device** → `Enabled BypassPerfRequirement`.
4. Restart Chrome.
5. Verify the model is ready at `chrome://on-device-internals`.

### Step 3 — Load the Extension

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right toggle).
3. Click **Load unpacked** and select the `chrome-extension/` folder.
4. The Oneblink icon appears in the toolbar. Press **Alt+O** to open.

---

## 🎯 Usage

1. **Describe screen**: Click the eye button — it captures, describes, and speaks what's on screen.
2. **Ask about screen**: Click the mic button and ask a question in any Indian language. Oneblink transcribes, understands, and answers in your language.
3. **Auto-language**: The first time you speak, Oneblink detects your language and remembers it. All future interactions (including "Describe screen") will use your language.

---

## 🛠️ Tech Stack

- **Gemini Nano** — On-device multimodal AI (Chrome LanguageModel API)
- **Sarvam AI** — Indian-language STT, TTS, and Translation
  - `saaras:v3` for speech-to-text (24 languages)
  - `bulbul:v3` for text-to-speech (30+ voices)
  - `mayura:v1` for translation (23 languages)
- **Chrome Extension Manifest V3** — Offscreen API for mic, storage for preferences

---

## 🤝 Why Oneblink?

> 400 million Indians have limited internet literacy. 50 million are visually impaired. Most screen readers only support English. Oneblink bridges this gap by bringing AI screen reading to Indian languages — with zero configuration, zero cloud vision processing, and zero data leaving the device.

---

## 📄 License

MIT
