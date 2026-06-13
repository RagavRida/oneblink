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

import { config } from './config.js';

'use strict';

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
 * @param {string}  [options.voiceId]  - Override the default voice.
 * @param {string}  [options.modelId]  - Override the default model.
 * @param {boolean} [options.stream]   - Unused legacy parameter.
 * @returns {Promise<void>}  Resolves when playback finishes (or rejects on error).
 */
export async function speak(text, { voiceId, modelId, stream = true } = {}) {
  if (!text?.trim()) return;

  // Stop any previous playback
  stopSpeaking();

  const endpoint = `${config.SARVAM_BASE_URL}/text-to-speech`;

  const body = {
    inputs: [text],
    target_language_code: 'en-IN',
    speaker: voiceId || config.SARVAM_TTS_SPEAKER || 'meera',
    model: modelId || config.SARVAM_TTS_MODEL || 'bulbul:v3',
    enable_preprocessing: true,
    pace: 1.0,
    temperature: 0.6
  };

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Subscription-Key': config.SARVAM_API_KEY
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`TTS server unreachable at ${endpoint}. (${err.message})`);
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
  const contentType = response.headers.get("content-type") || "";
  let audioBlob;
  if (contentType.includes("application/json")) {
    const data = await response.json();
    const base64Str = data.audio_base64;
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
