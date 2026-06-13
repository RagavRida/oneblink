import { config, loadConfig, LANGUAGES } from './config.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const screenshotBtn   = document.getElementById('screenshot-btn');
const micBtn          = document.getElementById('mic-btn');
const micLabel        = document.getElementById('mic-title');
const micSub          = document.getElementById('mic-sub');
const statusDot       = document.getElementById('status-dot');
const statusText      = document.getElementById('status-text');
const unsupportedEl   = document.getElementById('unsupported');
const idleView        = document.getElementById('idle-view');
const processingView  = document.getElementById('processing-view');
const processingLabel = document.getElementById('processing-label');
const errorBanner     = document.getElementById('error-toast');
const errorText       = document.getElementById('error-text');
const responseView    = document.getElementById('response-view');
const responseText    = document.getElementById('response-text');
const responseLang    = document.getElementById('response-lang');
const responseBack    = document.getElementById('response-back');
const speakingBars    = document.getElementById('speaking-bars');

// ── State ─────────────────────────────────────────────────────────────────────
let session       = null;
let API           = null;
let isBusy        = false;
let isRecording   = false;
let userLanguage  = 'en-IN';   // auto-detected from voice, persisted
let currentAudio  = null;      // track playing audio for stop

// ── System prompt for Gemini Nano ─────────────────────────────────────────────
const SYSTEM_PROMPT =
  'You are an accessibility assistant helping a blind or visually impaired user understand their screen. ' +
  'Describe what you see clearly and concisely in 2-3 sentences. ' +
  'Focus on the most important content: text, actions available, and context. ' +
  'Always respond in English. Never add greetings or sign-offs.';

// ── Load persisted language ───────────────────────────────────────────────────
async function loadUserLanguage() {
  try {
    const stored = await chrome.storage.local.get('userLanguage');
    if (stored.userLanguage && LANGUAGES[stored.userLanguage]) {
      userLanguage = stored.userLanguage;
    }
  } catch {}
}

async function saveUserLanguage(lang) {
  userLanguage = lang;
  try { await chrome.storage.local.set({ userLanguage: lang }); } catch {}
}

// ── API resolution ────────────────────────────────────────────────────────────
function resolveAPI() {
  if (typeof LanguageModel !== 'undefined') return LanguageModel;
  if (window.ai && window.ai.languageModel) return window.ai.languageModel;
  return null;
}

async function checkAvailability(api) {
  if (typeof api.availability === 'function') {
    const r = await api.availability();
    if (r === 'available' || r === 'readily') return 'ready';
    if (r === 'after-download' || r === 'downloadable' || r === 'downloading') return 'download';
    return 'no';
  }
  if (typeof api.capabilities === 'function') {
    const caps = await api.capabilities();
    if (caps.available === 'readily') return 'ready';
    if (caps.available === 'after-download') return 'download';
    return 'no';
  }
  throw new Error('No availability/capabilities method found');
}

async function createSession() {
  const opts = {
    systemPrompt: SYSTEM_PROMPT,
    expectedInputs: [{ type: 'image' }],
  };
  try {
    return await API.create({
      ...opts,
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          setStatus('loading', `downloading ${Math.round(e.loaded * 100)}%`);
        });
      }
    });
  } catch {
    return await API.create(opts);
  }
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function setStatus(state, text) {
  statusDot.className = 'status-dot ' + state;
  statusText.textContent = text;
}

function showProcessing(label) {
  idleView.style.display = 'none';
  responseView.style.display = 'none';
  processingView.style.display = 'flex';
  processingLabel.textContent = label;
  errorBanner.style.display = 'none';
  speakingBars.style.display = 'none';
}

function showIdle() {
  processingView.style.display = 'none';
  responseView.style.display = 'none';
  idleView.style.display = 'flex';
  speakingBars.style.display = 'none';
  screenshotBtn.disabled = false;
  micBtn.disabled = false;
}

function showResponse(text, langCode) {
  processingView.style.display = 'none';
  idleView.style.display = 'none';
  responseView.style.display = 'flex';
  responseText.textContent = '';
  const langName = LANGUAGES[langCode] || langCode;
  responseLang.textContent = `${langName}`;
  // Typewriter effect
  typewriterEffect(responseText, text);
}

function typewriterEffect(el, text, speed = 12) {
  let i = 0;
  el.textContent = '';
  function type() {
    if (i < text.length) {
      el.textContent += text[i];
      i++;
      // Auto-scroll to bottom
      el.scrollTop = el.scrollHeight;
      setTimeout(type, speed);
    }
  }
  type();
}

function showSpeaking() {
  speakingBars.style.display = 'flex';
}

function hideSpeaking() {
  speakingBars.style.display = 'none';
}

function showError(msg) {
  errorText.textContent = msg;
  errorBanner.style.display = 'flex';
  showIdle();
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  await loadConfig();
  await loadUserLanguage();
  API = resolveAPI();
  if (!API) {
    setStatus('error', 'unavailable');
    unsupportedEl.style.display = 'flex';
    return;
  }
  try {
    setStatus('loading', 'checking…');
    const avail = await checkAvailability(API);
    if (avail === 'no') {
      setStatus('error', 'no model');
      showError('Gemini Nano is not available on this device.');
      return;
    }
    if (avail === 'download') {
      setStatus('loading', 'downloading…');
    }
    setStatus('loading', 'loading model…');
    session = await createSession();
    setStatus('ready', 'ready');
    screenshotBtn.disabled = false;
    micBtn.disabled = false;
  } catch (err) {
    console.error('[Oneblink]', err);
    setStatus('error', 'error');
    showError(`Init error: ${err.message}`);
  }
}

// ── Capture screenshot → returns Blob ────────────────────────────────────────
function captureTab() {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 95 }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        fetch(dataUrl)
          .then(r => r.blob())
          .then(resolve)
          .catch(reject);
      });
    }, 150);
  });
}

// ── Ask Gemini Nano with image + optional question ────────────────────────────
async function askGeminiNano(imageBlob, question) {
  if (!session) throw new Error('Gemini Nano session not ready.');

  const prompt = question
    ? question
    : 'Describe what is on this screen for a blind user. Be brief and clear.';

  const payload = [{
    role: 'user',
    content: [
      { type: 'image', value: imageBlob },
      { type: 'text',  value: prompt },
    ],
  }];

  let fullText = '';
  const stream = session.promptStreaming(payload);
  for await (const chunk of stream) {
    fullText += chunk;
  }
  return fullText.trim();
}

// ── Sarvam: Translate text ────────────────────────────────────────────────────
async function translateText(text, sourceLang, targetLang) {
  if (sourceLang === targetLang) return text;

  const response = await fetch(`${config.SARVAM_BASE_URL}/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'API-Subscription-Key': config.SARVAM_API_KEY
    },
    body: JSON.stringify({
      input: text,
      source_language_code: sourceLang,
      target_language_code: targetLang,
      model: config.SARVAM_TRANSLATE_MODEL || 'mayura:v1',
      numerals_format: 'international'
    })
  });

  if (!response.ok) {
    console.warn(`Translation failed (${response.status}), using original text`);
    return text;
  }

  const data = await response.json();
  return data.translated_text || data.translatedText || data.output || text;
}

// ── Sarvam: Text-to-Speech ────────────────────────────────────────────────────
async function speakText(text, langCode) {
  if (!text) return;
  const targetLang = langCode || userLanguage || 'en-IN';

  const response = await fetch(`${config.SARVAM_BASE_URL}/text-to-speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'API-Subscription-Key': config.SARVAM_API_KEY
    },
    body: JSON.stringify({
      inputs: [text],
      target_language_code: targetLang,
      speaker: config.SARVAM_TTS_SPEAKER || 'meera',
      model: config.SARVAM_TTS_MODEL || 'bulbul:v3',
      enable_preprocessing: true,
      pace: 1.0,
      temperature: 0.6
    })
  });

  if (!response.ok) {
    let msg = `TTS error ${response.status}`;
    try { const j = await response.json(); msg += `: ${j.error ?? ''}`; } catch {}
    throw new Error(msg);
  }

  const contentType = response.headers.get("content-type") || "";
  let audioBlob;
  if (contentType.includes("application/json")) {
    const data = await response.json();
    const base64Str = data.audio_base64;
    if (!base64Str) throw new Error('No audio in TTS response');
    const binary = atob(base64Str);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    audioBlob = new Blob([bytes], { type: "audio/wav" });
  } else {
    audioBlob = await response.blob();
  }

  const blobUrl = URL.createObjectURL(audioBlob);

  return new Promise((resolve, reject) => {
    const audio = new Audio(blobUrl);
    currentAudio = audio;
    showSpeaking();
    audio.addEventListener('ended',  () => {
      URL.revokeObjectURL(blobUrl);
      currentAudio = null;
      hideSpeaking();
      resolve();
    });
    audio.addEventListener('error',  (e) => {
      URL.revokeObjectURL(blobUrl);
      currentAudio = null;
      hideSpeaking();
      reject(e);
    });
    audio.play().catch(reject);
  });
}

// ── Sarvam: Speech-to-Text-Translate (auto-detects language → English) ───────
async function transcribeAndTranslate(audioBlob) {
  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.webm');
  formData.append('model', 'saaras:v2.5');

  const response = await fetch(`${config.SARVAM_BASE_URL}/speech-to-text-translate`, {
    method: 'POST',
    headers: {
      'API-Subscription-Key': config.SARVAM_API_KEY
    },
    body: formData
  });

  if (!response.ok) {
    let msg = `STT-Translate error ${response.status}`;
    try { const j = await response.json(); msg += `: ${j.error ?? ''}`; } catch {}
    throw new Error(msg);
  }

  const data = await response.json();
  return {
    transcript: (data.transcript ?? '').trim(),
    sourceLanguage: data.source_language_code || 'en-IN'
  };
}

// ── FLOW 1: Screenshot → describe → (translate) → speak ─────────────────────
async function handleScreenshot() {
  if (isBusy) return;
  isBusy = true;
  screenshotBtn.classList.add('capturing');
  errorBanner.style.display = 'none';

  try {
    // 1. Capture
    showProcessing('Capturing screen…');
    const imageBlob = await captureTab();

    // 2. Gemini Nano describes in English
    showProcessing('Reading screen…');
    setStatus('loading', 'reading…');
    const description = await askGeminiNano(imageBlob, null);
    if (!description) throw new Error('No description returned from model.');

    // 3. If user speaks a non-English language, translate
    let finalText = description;
    let finalLang = userLanguage;

    if (userLanguage !== 'en-IN') {
      showProcessing(`Translating to ${LANGUAGES[userLanguage] || userLanguage}…`);
      setStatus('loading', 'translating…');
      finalText = await translateText(description, 'en-IN', userLanguage);
    }

    // 4. Show response + TTS
    showResponse(finalText, finalLang);
    setStatus('loading', 'speaking…');
    await speakText(finalText, finalLang);

  } catch (err) {
    console.error('[Screenshot flow]', err);
    showError(err.message);
  } finally {
    screenshotBtn.classList.remove('capturing');
    isBusy = false;
    setStatus('ready', 'ready');
  }
}

// ── FLOW 2: Mic → STT-Translate → Gemini Nano + screenshot → translate → speak
async function handleMicToggle() {
  if (isBusy && !isRecording) return;

  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

function startRecording() {
  micBtn.disabled = true;
  errorBanner.style.display = 'none';
  setStatus('loading', 'starting mic…');
  chrome.runtime.sendMessage({ target: 'background', type: 'start-recording' })
    .catch(err => {
      micBtn.disabled = false;
      setStatus('ready', 'ready');
      showError(`Mic error: ${err.message}`);
    });
}

function stopRecording() {
  isRecording = false;
  micBtn.classList.remove('recording');
  micBtn.querySelector('.icon-mic').style.display        = 'block';
  micBtn.querySelector('.icon-mic-active').style.display = 'none';
  micLabel.textContent = 'Ask about screen';
  micSub.textContent   = 'Tap to speak';
  chrome.runtime.sendMessage({ target: 'background', type: 'stop-recording' });
  showProcessing('Processing voice…');
}

// Handle messages from offscreen recorder
chrome.runtime.onMessage.addListener((message) => {
  if (message.target !== 'popup') return;

  if (message.type === 'recording-started') {
    isRecording = true;
    isBusy = true;
    micBtn.disabled = false;
    micBtn.classList.add('recording');
    micBtn.querySelector('.icon-mic').style.display        = 'none';
    micBtn.querySelector('.icon-mic-active').style.display = 'block';
    micLabel.textContent = 'Tap to stop';
    micSub.textContent   = 'Listening…';
    screenshotBtn.disabled = true;
    setStatus('loading', 'recording…');
  } else if (message.type === 'recording-error') {
    isRecording = false;
    isBusy = false;
    micBtn.classList.remove('recording');
    micBtn.querySelector('.icon-mic').style.display        = 'block';
    micBtn.querySelector('.icon-mic-active').style.display = 'none';
    micLabel.textContent = 'Ask about screen';
    micSub.textContent   = 'Tap to speak';
    micBtn.disabled = false;
    showError(`Mic unavailable: ${message.error}`);
    setStatus('ready', 'ready');

  } else if (message.type === 'recording-complete') {
    processVoiceQuery(message.audio, message.mimeType);
  }
});

async function processVoiceQuery(base64Audio, mimeType) {
  showProcessing('Transcribing…');
  setStatus('loading', 'transcribing…');

  try {
    // 1. Decode base64 → Blob
    const binary    = atob(base64Audio);
    const bytes     = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const audioBlob = new Blob([bytes], { type: mimeType || 'audio/webm' });

    // 2. STT-Translate: auto-detects language, returns English transcript
    const { transcript, sourceLanguage } = await transcribeAndTranslate(audioBlob);
    if (!transcript) throw new Error('No speech detected in recording.');

    // 3. Auto-detect: save the user's spoken language for future interactions
    if (sourceLanguage && LANGUAGES[sourceLanguage]) {
      await saveUserLanguage(sourceLanguage);
      console.log(`[Oneblink] Auto-detected language: ${LANGUAGES[sourceLanguage]} (${sourceLanguage})`);
    }

    // 4. Capture current screen
    showProcessing('Capturing screen…');
    const imageBlob = await captureTab();

    // 5. Gemini Nano: answer question (in English) with screenshot context
    showProcessing('Thinking…');
    setStatus('loading', 'thinking…');
    const answer = await askGeminiNano(imageBlob, transcript);
    if (!answer) throw new Error('No answer returned from model.');

    // 6. Translate answer to user's language if not English
    let finalText = answer;
    let finalLang = userLanguage;

    if (userLanguage !== 'en-IN') {
      showProcessing(`Translating to ${LANGUAGES[userLanguage] || userLanguage}…`);
      setStatus('loading', 'translating…');
      finalText = await translateText(answer, 'en-IN', userLanguage);
    }

    // 7. Show response + TTS in user's language
    showResponse(finalText, finalLang);
    setStatus('loading', 'speaking…');
    await speakText(finalText, finalLang);

  } catch (err) {
    console.error('[Voice query flow]', err);
    showError(err.message);
  } finally {
    isBusy = false;
    setStatus('ready', 'ready');
  }
}

// ── Response back button ─────────────────────────────────────────────────────
responseBack.addEventListener('click', () => {
  stopAudio();
  showIdle();
});

function stopAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
    hideSpeaking();
  }
}

// ── Events ────────────────────────────────────────────────────────────────────
screenshotBtn.addEventListener('click', handleScreenshot);
micBtn.addEventListener('click', handleMicToggle);

// ── Boot ──────────────────────────────────────────────────────────────────────
init();
