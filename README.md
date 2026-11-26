# Anime WE New Tab

![Manifest V3](https://img.shields.io/badge/Manifest-V3-7c74ff?style=flat-square)
![Vanilla JS](https://img.shields.io/badge/Vanilla-HTML%20%2F%20CSS%20%2F%20JS-5ea8ff?style=flat-square)
![Wallpaper Engine Sync](https://img.shields.io/badge/Wallpaper%20Engine-Sync-a78bfa?style=flat-square)

A minimalist **Dark Anime** Chrome New Tab extension (Manifest V3) built with 100% Vanilla HTML, CSS, and JavaScript for sub-50ms startup, real-time **Wallpaper Engine** background synchronization, a custom **Bookmarks Bar**, and a keyboard-first **Search** bar.

![Preview](./assets/preview.png)

## Features

- **Real-Time Wallpaper Engine Sync (`js/wallpaper.js`):**
  - Fetches the active wallpaper state via `GET /api/current-wallpaper` (`video`, `image`, or `scene` + optional `accentColor`).
  - Connects via WebSocket (`/ws`) with bounded exponential-backoff reconnection to update backgrounds live without refreshing.
  - Automatically falls back to `assets/fallback.jpg` when the Local Server is offline, unreachable, or serving a non-video `scene`.
- **Custom Bookmarks Bar (`js/bookmarks.js`):**
  - Reads Chrome's Bookmarks Bar (`chrome.bookmarks.getTree()`) and renders crisp site icons via the MV3 `_favicon` API.
  - Supports folders and nested subfolders with a dark dropdown menu (closes on `Esc` or outside click) and live updates on bookmark changes.
  - Uses `textContent` exclusively (never `innerHTML`) to prevent XSS.
- **Keyboard-First Search & Minimalist Clock (`js/search.js`, `js/clock.js`):**
  - Centered search box auto-focused on tab open; press `Tab` (`Shift+Tab` to reverse) to cycle **Google → YouTube → GitHub → Codeforces**.
  - Digital clock aligned to minute boundaries so the DOM only updates when the minute changes.
- **GPU & Startup Performance:**
  - Inline `#0b0d17` anti-white-flash `<style>` in `<head>`.
  - Zero `backdrop-filter: blur()` — uses translucent dark surfaces (`rgba(11, 13, 23, 0.72)`) with luminous blue-violet borders.
  - Automatically calls `video.pause()` / `video.play()` via the Page Visibility API (`visibilitychange`) and `blur`/`focus` events to save GPU/RAM.

## Installation (Load Unpacked)

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the `anime-we-new-tab` folder.
5. Open a new tab (`Ctrl + T`) and click **Keep it** when prompted.

## Configuration

Edit [`js/config.js`](js/config.js) to change the Local Server host or port (defaults to `127.0.0.1:8765`):

```js
const SERVER_HOST = '127.0.0.1';
const SERVER_PORT = 8765;
```

### Expected Local Server Contract

- **`GET /api/current-wallpaper`** returns JSON:
  ```json
  {
    "type": "video",
    "url": "http://127.0.0.1:8765/media/wallpaper.mp4",
    "accentColor": "#7c74ff"
  }
  ```
- **WebSocket `/ws`** pushes the same JSON payload whenever the active wallpaper changes.

## Related Projects

- [spotify-wallpaper-engine-sync](https://github.com/Harilowji/spotify-wallpaper-engine-sync) — Companion ecosystem project for Wallpaper Engine synchronization.
