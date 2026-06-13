// popup.js — Screen Reader AI Extension
// Two modes:
//   1. Screenshot → Gemini Nano describes screen → ElevenLabs speaks it
//   2. Mic → STT (server) → Gemini Nano answers with screenshot context → ElevenLabs speaks it
'use strict';

const SERVER = 'http://localhost:3030';

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

// ── State ─────────────────────────────────────────────────────────────────────
let session    = null;
let API        = null;
let isBusy     = false;   // true while any pipeline is running
let isRecording = false;

// ── System prompt for Gemini Nano ─────────────────────────────────────────────
const SYSTEM_PROMPT =
  'You are an accessibility assistant helping a blind or visually impaired user understand their screen. ' +
  'Describe what you see clearly and concisely in 2-3 sentences. ' +
  'Focus on the most important content: text, actions available, and context. ' +
  'Never add greetings or sign-offs.';

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
  processingView.style.display = 'flex';
  processingLabel.textContent = label;
  errorBanner.style.display = 'none';
}

function showIdle() {
  processingView.style.display = 'none';
  idleView.style.display = 'flex';
  screenshotBtn.disabled = false;
  micBtn.disabled = false;
}

function showError(msg) {
  errorText.textContent = msg;
  errorBanner.style.display = 'flex';
  showIdle();
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
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
    console.error('[Screen Reader]', err);
    setStatus('error', 'error');
    showError(`Init error: ${err.message}`);
  }
}

// ── Capture screenshot → returns Blob ────────────────────────────────────────
function captureTab() {
  return new Promise((resolve, reject) => {
    // Small delay so the popup doesn't appear in the capture
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

// ── Send text to server TTS → play audio ─────────────────────────────────────
async function speakText(text) {
  if (!text) return;

  const response = await fetch(`${SERVER}/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    let msg = `TTS error ${response.status}`;
    try { const j = await response.json(); msg += `: ${j.error ?? ''}`; } catch {}
    throw new Error(msg);
  }

  const blob    = await response.blob();
  const blobUrl = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const audio = new Audio(blobUrl);
    audio.addEventListener('ended',  () => { URL.revokeObjectURL(blobUrl); resolve(); });
    audio.addEventListener('error',  (e) => { URL.revokeObjectURL(blobUrl); reject(e); });
    audio.play().catch(reject);
  });
}

// ── Send audio to server for STT only → returns transcript ───────────────────
async function transcribeAudio(audioBlob, mimeType) {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');

  const response = await fetch(`${SERVER}/transcribe`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let msg = `Transcription error ${response.status}`;
    try { const j = await response.json(); msg += `: ${j.error ?? ''}`; } catch {}
    throw new Error(msg);
  }

  const data = await response.json();
  return (data.transcript ?? '').trim();
}

// ── FLOW 1: Screenshot → describe → speak ────────────────────────────────────
async function handleScreenshot() {
  if (isBusy) return;
  isBusy = true;
  screenshotBtn.classList.add('capturing');
  showProcessing('Capturing screen…');

  try {
    // 1. Capture
    showProcessing('Capturing screen…');
    const imageBlob = await captureTab();

    // 2. Gemini Nano describes it
    showProcessing('Reading screen…');
    setStatus('loading', 'reading…');
    const description = await askGeminiNano(imageBlob, null);

    if (!description) throw new Error('No description returned from model.');

    // 3. TTS → play
    showProcessing('Speaking…');
    setStatus('loading', 'speaking…');
    await speakText(description);

  } catch (err) {
    console.error('[Screenshot flow]', err);
    showError(err.message);
  } finally {
    screenshotBtn.classList.remove('capturing');
    isBusy = false;
    if (processingView.style.display !== 'none') showIdle();
    setStatus('ready', 'ready');
  }
}

// ── FLOW 2: Mic → STT → Gemini Nano + screenshot → speak ─────────────────────
async function handleMicToggle() {
  if (isBusy && !isRecording) return;

  if (isRecording) {
    // Stop recording
    stopRecording();
  } else {
    // Start recording
    startRecording();
  }
}

function startRecording() {
  micBtn.disabled = true;
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

    // 2. STT via server
    const transcript = await transcribeAudio(audioBlob, mimeType);
    if (!transcript) throw new Error('No speech detected in recording.');

    // 3. Capture current screen
    showProcessing('Capturing screen…');
    const imageBlob = await captureTab();

    // 4. Gemini Nano: answer question with screenshot context
    showProcessing('Thinking…');
    setStatus('loading', 'thinking…');
    const answer = await askGeminiNano(imageBlob, transcript);

    if (!answer) throw new Error('No answer returned from model.');

    // 5. TTS → play
    showProcessing('Speaking…');
    setStatus('loading', 'speaking…');
    await speakText(answer);

  } catch (err) {
    console.error('[Voice query flow]', err);
    showError(err.message);
  } finally {
    isBusy = false;
    if (processingView.style.display !== 'none') showIdle();
    setStatus('ready', 'ready');
  }
}

// ── Events ────────────────────────────────────────────────────────────────────
screenshotBtn.addEventListener('click', handleScreenshot);
micBtn.addEventListener('click', handleMicToggle);

// ── Boot ──────────────────────────────────────────────────────────────────────
init();
