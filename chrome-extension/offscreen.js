// offscreen.js — runs inside the hidden offscreen document
// Handles getUserMedia() and MediaRecorder away from the popup,
// so the permission prompt doesn't close the popup window.

'use strict';

let mediaRecorder = null;
let audioChunks   = [];
let stream        = null;

function getSupportedMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.target !== 'offscreen') return;

  if (message.type === 'start-recording') {
    startRecording();
  } else if (message.type === 'stop-recording') {
    stopRecording();
  }
});

async function startRecording() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    // Send error back to popup
    chrome.runtime.sendMessage({
      target: 'popup',
      type: 'recording-error',
      error: err.message,
    });
    return;
  }

  audioChunks = [];
  const mimeType = getSupportedMimeType();
  mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    stream.getTracks().forEach(t => t.stop());

    const finalMime = mediaRecorder.mimeType || 'audio/webm';
    const blob      = new Blob(audioChunks, { type: finalMime });
    audioChunks     = [];

    // Convert blob to base64 to send through the message channel
    const arrayBuffer = await blob.arrayBuffer();
    const uint8       = new Uint8Array(arrayBuffer);
    const base64      = btoa(String.fromCharCode(...uint8));

    chrome.runtime.sendMessage({
      target: 'popup',
      type: 'recording-complete',
      audio: base64,
      mimeType: finalMime,
    });
  };

  mediaRecorder.start(100);

  chrome.runtime.sendMessage({
    target: 'popup',
    type: 'recording-started',
  });
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}
