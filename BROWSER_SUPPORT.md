# Browser Support

AskAnchor is a Manifest V3 WebExtension. The same source supports Chrome, Edge,
Firefox, and Safari through target-specific build folders.

## Build

```bash
node scripts/build-browser-targets.js
```

The command creates:

- `dist/chrome`
- `dist/edge`
- `dist/firefox`
- `dist/safari`

## Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose Load unpacked.
4. Select `dist/chrome`.

For local development, loading the project root also works.

## Edge

1. Open `edge://extensions`.
2. Enable Developer mode.
3. Choose Load unpacked.
4. Select `dist/edge`.

## Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose Load Temporary Add-on.
3. Select `dist/firefox/manifest.json`.

Firefox uses the standard `browser.runtime` API. AskAnchor falls back to
`chrome.runtime` for Chromium browsers and Safari.

## Safari

Safari Web Extensions are distributed through a Safari app wrapper. Build the
Safari target first, then convert it with Apple's converter:

```bash
xcrun safari-web-extension-converter dist/safari
```

Open the generated Xcode project, run the app, then enable AskAnchor in Safari's
Extensions settings.

## Compatibility Notes

- Chrome and Edge use the same MV3 manifest shape.
- Firefox receives an additional Gecko extension id in its generated manifest.
- Safari should be converted from `dist/safari`; it cannot be loaded directly
  like Chrome, Edge, or Firefox.
- The content script avoids hard-coding the Chrome-only global and resolves
  extension assets through `browser.runtime` or `chrome.runtime`.
- Platform enablement is stored in extension local storage under
  `askAnchorSettings`. All supported platforms default to enabled.
- Disabling a platform stops AskAnchor from mounting UI or reading that
  platform page after refresh; already-open pages also receive the setting
  change and clean up injected AskAnchor UI.
- Site permissions remain declared in the manifest for Chrome, Edge, Firefox,
  and Safari. The settings page provides user control after install, but it does
  not reduce the first-install host permission prompt.
