(function (global) {
  'use strict';

  const AnimeWE = global.AnimeWE || (global.AnimeWE = {});

  /**
   * Central configuration for Anime WE New Tab.
   * Change SERVER_HOST / SERVER_PORT to match your local Wallpaper Engine bridge server.
   */
  const SERVER_HOST = '127.0.0.1';
  const SERVER_PORT = 8765;

  const CONFIG = Object.freeze({
    SERVER_HOST,
    SERVER_PORT,
    HTTP_PROTOCOL: 'http',
    WS_PROTOCOL: 'ws',
    API_PATH: '/api/current-wallpaper',
    WS_PATH: '/ws',

    // Network & WebSocket resilience limits
    FETCH_TIMEOUT_MS: 1800,
    WS_MAX_RECONNECT_ATTEMPTS: 5,
    WS_RECONNECT_BASE_DELAY_MS: 1500,
    WS_RECONNECT_MAX_DELAY_MS: 15000,
    // Keep false to avoid redundant WebSocket console errors when Local Server is offline
    CONNECT_WS_ON_HTTP_ERROR: false,

    // Visual fallback & theme defaults
    FALLBACK_IMAGE: 'assets/fallback.jpg',
    DEFAULT_ACCENT_COLOR: '#7c74ff',

    // Chrome Bookmarks Bar node ID
    BOOKMARKS_BAR_ID: '1',

    // Search engines cycled with Tab inside the search box
    SEARCH_ENGINES: Object.freeze([
      Object.freeze({
        id: 'google',
        name: 'Google',
        url: 'https://www.google.com/search?q=',
        placeholder: 'Search Google...',
        color: '#6ea8ff'
      }),
      Object.freeze({
        id: 'youtube',
        name: 'YouTube',
        url: 'https://www.youtube.com/results?search_query=',
        placeholder: 'Search YouTube...',
        color: '#ff6b8b'
      }),
      Object.freeze({
        id: 'github',
        name: 'GitHub',
        url: 'https://github.com/search?q=',
        placeholder: 'Search GitHub...',
        color: '#a78bfa'
      }),
      Object.freeze({
        id: 'codeforces',
        name: 'Codeforces',
        url: 'https://codeforces.com/search?query=',
        placeholder: 'Search Codeforces...',
        color: '#5ce1e6'
      })
    ]),

    getServerOrigin() {
      return `${this.HTTP_PROTOCOL}://${this.SERVER_HOST}:${this.SERVER_PORT}`;
    },

    getApiUrl() {
      return `${this.getServerOrigin()}${this.API_PATH}`;
    },

    getWsUrl() {
      return `${this.WS_PROTOCOL}://${this.SERVER_HOST}:${this.SERVER_PORT}${this.WS_PATH}`;
    }
  });

  AnimeWE.CONFIG = CONFIG;
})(window);
