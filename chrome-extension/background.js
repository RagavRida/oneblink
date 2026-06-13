// background.js — Service worker
// Manages the offscreen document used for microphone recording.
// The popup cannot call getUserMedia() directly because the permission
// prompt steals focus and closes the popup, cancelling the request.

const OFFSCREEN_URL = chrome.runtime.getURL('offscreen.html');

async function ensureOffscreenDocument() {
  const existing = await chrome.offscreen.hasDocument();
  if (!existing) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['USER_MEDIA'],
      justification: 'Recording microphone audio for voice chat transcription',
    });
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== 'background') return false;

  (async () => {
    switch (message.type) {

      case 'start-recording': {
        await ensureOffscreenDocument();
        // Forward the start command to the offscreen document
        chrome.runtime.sendMessage({ target: 'offscreen', type: 'start-recording' });
        sendResponse({ ok: true });
        break;
      }

      case 'stop-recording': {
        // Forward stop to offscreen; it will reply with the audio blob via a message
        chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop-recording' });
        sendResponse({ ok: true });
        break;
      }

      default:
        sendResponse({ error: `Unknown message type: ${message.type}` });
    }
  })();

  return true; // keep channel open for async sendResponse
});
