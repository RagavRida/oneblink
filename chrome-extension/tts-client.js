/**
 * tts-client.js
 *
 * Thin client used by popup.js to send text to the local TTS server
 * and play the returned audio in the browser.
 *
 * Usage:
 *   import { speak, stopSpeaking, isSpeaking } from './tts-client.js';
 *
 *   await speak('Hello world');
 *   stopSpeaking();
 */

'use strict';

const TTS_SERVER = 'http://localhost:3030';

// Single shared Audio element so we can stop/replace playback easily
let currentAudio = null;

/**
 * Returns true if audio is currently playing.
 */
export function isSpeaking() {
  return currentAudio !== null && !currentAudio.paused && !currentAudio.ended;
}

/**
 * Stop any currently playing audio immediately.
 */
export function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
}

/**
 * Send `text` to the TTS server and play the returned audio.
 *
 * @param {string}  text          - The text to synthesize.
 * @param {object}  [options]
 * @param {string}  [options.voiceId]  - Override the server's default voice.
 * @param {string}  [options.modelId]  - Override the server's default model.
 * @param {boolean} [options.stream]   - Use /speak-stream for lower latency (default: true).
 * @returns {Promise<void>}  Resolves when playback finishes (or rejects on error).
 */
export async function speak(text, { voiceId, modelId, stream = true } = {}) {
  if (!text?.trim()) return;

  // Stop any previous playback
  stopSpeaking();

  const endpoint = stream ? `${TTS_SERVER}/speak-stream` : `${TTS_SERVER}/speak`;

  const body = { text };
  if (voiceId) body.voiceId = voiceId;
  if (modelId) body.modelId = modelId;

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`TTS server unreachable at ${TTS_SERVER}. Is it running? (${err.message})`);
  }

  if (!response.ok) {
    let msg = `TTS server error ${response.status}`;
    try {
      const json = await response.json();
      msg += `: ${json.error ?? JSON.stringify(json)}`;
    } catch {}
    throw new Error(msg);
  }

  // Create a blob URL from the audio response and play it
  const blob    = await response.blob();
  const blobUrl = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const audio = new Audio(blobUrl);
    currentAudio = audio;

    audio.addEventListener('ended', () => {
      URL.revokeObjectURL(blobUrl);
      currentAudio = null;
      resolve();
    });

    audio.addEventListener('error', (e) => {
      URL.revokeObjectURL(blobUrl);
      currentAudio = null;
      reject(new Error(`Audio playback error: ${e.message ?? 'unknown'}`));
    });

    audio.play().catch((err) => {
      URL.revokeObjectURL(blobUrl);
      currentAudio = null;
      reject(err);
    });
  });
}
