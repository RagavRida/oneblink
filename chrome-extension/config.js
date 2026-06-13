// config.js — Configuration for Oneblink Chrome Extension
export const config = {
  SARVAM_API_KEY: "",
  SARVAM_BASE_URL: "https://api.sarvam.ai",
  SARVAM_STT_MODEL: "saaras:v3",
  SARVAM_TTS_MODEL: "bulbul:v3",
  SARVAM_TTS_SPEAKER: "meera",
  SARVAM_TRANSLATE_MODEL: "mayura:v1",
};

// Supported Indian languages (Sarvam AI)
export const LANGUAGES = {
  "en-IN": "English",
  "hi-IN": "Hindi",
  "te-IN": "Telugu",
  "ta-IN": "Tamil",
  "kn-IN": "Kannada",
  "ml-IN": "Malayalam",
  "mr-IN": "Marathi",
  "bn-IN": "Bengali",
  "gu-IN": "Gujarati",
  "pa-IN": "Punjabi",
  "od-IN": "Odia",
};

export async function loadConfig() {
  try {
    const response = await fetch(chrome.runtime.getURL('.env'));
    const text = await response.text();
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (key === 'SARVAM_API_KEY') {
        config.SARVAM_API_KEY = value;
      }
    }
  } catch (err) {
    console.warn('Could not load .env file:', err.message);
  }

  // Fallback: check chrome.storage.local
  if (!config.SARVAM_API_KEY && chrome?.storage?.local) {
    try {
      const stored = await chrome.storage.local.get('SARVAM_API_KEY');
      if (stored.SARVAM_API_KEY) {
        config.SARVAM_API_KEY = stored.SARVAM_API_KEY;
      }
    } catch {}
  }
}
