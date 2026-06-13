// config.js — Configuration for Oneblink Chrome Extension
export const config = {
  SARVAM_API_KEY: "",
  SARVAM_BASE_URL: "https://api.sarvam.ai",
  SARVAM_STT_MODEL: "saaras:v3", // 24 languages, transliteration, code-mixed
  SARVAM_TTS_MODEL: "bulbul:v3",
  SARVAM_TTS_SPEAKER: "meera"    // Default voice
};

export async function loadConfig() {
  try {
    const response = await fetch(chrome.runtime.getURL('.env'));
    const text = await response.text();
    const lines = text.split('\n');
    for (const line of lines) {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        if (key === 'SARVAM_API_KEY') {
          config.SARVAM_API_KEY = value;
        }
      }
    }
  } catch (err) {
    console.warn('Could not load .env file. Falling back to default or chrome.storage.', err);
  }

  // Also check chrome.storage.local as a fallback
  if (!config.SARVAM_API_KEY && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    const stored = await chrome.storage.local.get('SARVAM_API_KEY');
    if (stored.SARVAM_API_KEY) {
      config.SARVAM_API_KEY = stored.SARVAM_API_KEY;
    }
  }
}
