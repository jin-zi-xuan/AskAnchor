# Platform Adapters

AskAnchor should not rely on broad global selectors for known AI platforms.
Known platform metadata is defined in `src/platforms.js`. Platform selectors are
defined in `src/adapters/platforms.js`; `contentScript.js` uses the active
adapter before falling back to generic detection.

## Adapter Responsibilities

Each platform adapter should define:

- `conversationRootSelectors`: the smallest stable container that owns the chat.
- `assistantSelectors`: AI response nodes inside the chat container.
- `userSelectors`: user message nodes inside the chat container.
- `messageSelectors`: ordered message nodes used by the timeline.
- `promptEditorSelectors`: the platform's prompt input.
- `sendButtonSelectors`: controls that send the current prompt.
- `roleFromNode`: optional role inference when the platform exposes mixed message nodes.
- `getStableMessageId`: optional stable id extraction from platform attributes.

## Selector Rules

- Prefer stable attributes such as `data-message-author-role`, `data-testid`,
  `data-content`, `data-role`, ids, and custom elements.
- Scope platform selectors to a chat root whenever possible.
- Avoid broad selectors such as `[class*='message']`, `[class*='answer']`, and
  `[class*='markdown']` for known platforms.
- Keep broad CSS class fallbacks only in the `fallback` adapter path.

## Adding a Platform

1. Add the platform id, label, hosts, and match patterns to `src/platforms.js`.
2. Add the host to `manifest.json` in `host_permissions`,
   `content_scripts.matches`, and `web_accessible_resources.matches`.
3. Add one adapter entry in `src/adapters/platforms.js`.
4. Confirm the platform appears in the settings page and can be disabled.
5. Update `README.md` and `STORE_LISTING.md` if the supported-site list changes.
6. Verify selection, prompt filling, send detection, anchor restore, timeline,
   and the disabled-platform early exit.
7. Run:

```bash
node scripts/build-browser-targets.js
```

The build copies `src/` into every browser target under `dist/`.
