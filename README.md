# Window Manager — Safari Extension

Group Safari windows and collectively minimize, restore, or focus them.

## Features

- Create named window groups with optional color labels
- Click the toolbar icon to open the popup
- Toggle the current window's membership in any group
- **Minimize** / **Restore** all windows in a group
- **Focus This Group** — minimizes every window *not* in the chosen group
- **Minimize All Groups** — minimizes every grouped window at once

## Build & Install

### Requirements

- macOS 13 Ventura or later
- Xcode 15 or later
- Apple Developer account (free tier works for local development)

### Steps

1. Open `WindowManagerExtension/WindowManagerExtension.xcodeproj` in Xcode.
2. Select the **WindowManagerExtension** scheme and your Mac as the run destination.
3. In **Signing & Capabilities** for both targets, select your Apple ID team.
4. Press **⌘R** to build and run the host app.
5. The host app shows a button — click **Open Safari Extensions Preferences…** and enable **Window Manager**.
6. The toolbar icon appears in Safari. Click it to start grouping windows.

### Editing Web Extension Files

All JavaScript, HTML, CSS, and the manifest live in `web-extension/`. Edit them there; Xcode includes that directory as a folder reference so changes are picked up on the next build automatically.

## Architecture

### Data model

Window groups are persisted in `browser.storage.local`. Window IDs (assigned by Safari) are session-scoped: they are stored as a best-effort recovery mechanism but cleared on every service worker startup. If Safari restarts, all groups retain their names and colors but window membership resets to zero. The user re-assigns windows to groups for the new session.

### Message passing

The popup sends messages to the background service worker and re-renders from the response. No state is held in the popup. The background service worker holds an in-memory `Map<groupId, Set<windowId>>` and flushes it to storage with a 100 ms debounce.

### Safari-specific notes

- `browser.windows.update(id, { state: 'minimized' })` requires Safari 17+.
- All window operations use `Promise.allSettled` so a single failed window does not abort the batch.
- The service worker may be terminated when idle (MV3 behavior). The storage flush ensures membership survives restarts within a session.
