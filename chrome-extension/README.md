# Chrome AI Chat — Extension

Minichat using the **LanguageModel API** (Gemini Nano on-device) as a Chrome extension.

## Structure

```
chrome-extension/
├── manifest.json          # Manifest V3
├── popup.html             # Popup UI
├── popup.css              # Styles
├── popup.js               # Chat logic
├── icons/
│   ├── generate-icons.html  # PNG icon generator
│   ├── icon16.png           # (generate in step 1)
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Installation

### Step 1 — Generate Icons

1. Open `icons/generate-icons.html` in Chrome.
2. `icon16.png`, `icon48.png`, and `icon128.png` will be downloaded automatically.
3. Move them into the `icons/` folder.

### Step 2 — Enable Prompt API

On Chrome 138+:

1. Open `chrome://flags` and search for `nano`.
2. Enable **Prompt API for Gemini Nano** → `Enabled`.
3. Enable **Enables optimization guide on device** → `Enabled BypassPerfRequirement`.
4. Restart Chrome.
5. Verify that the model is ready in `chrome://on-device-internals`.

### Step 3 — Load the Extension

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (toggle in the top right).
3. Click on **Load unpacked**.
4. Select the `chrome-extension/` folder.
5. The icon will appear in the toolbar.

## Usage

- Click the extension icon to open the popup.
- Type a message and press Enter or the send button.
- You can attach images using the image button (if the model supports it).
- The trash can icon clears the chat and resets the session.

## Technical Notes

- The extension declares the `"languageModel"` permission in the manifest, which grants direct access to the global `LanguageModel` without requiring additional flags in extension contexts.
- The session is automatically recreated with `expectedInputs: [{ type: 'image' }]` the first time an image is sent.
- All processing is local — no data leaves the device.
