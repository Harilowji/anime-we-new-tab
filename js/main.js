(function (global) {
  'use strict';

  const AnimeWE = global.AnimeWE || (global.AnimeWE = {});

  function bootstrap() {
    const config = AnimeWE.CONFIG;
    if (!config) {
      return;
    }

    const cleanups = [
      typeof AnimeWE.initClock === 'function' ? AnimeWE.initClock() : null,
      typeof AnimeWE.initSearch === 'function' ? AnimeWE.initSearch(config) : null,
      typeof AnimeWE.initBookmarks === 'function' ? AnimeWE.initBookmarks(config) : null,
      typeof AnimeWE.initWallpaper === 'function' ? AnimeWE.initWallpaper(config) : null
    ].filter(Boolean);

    global.addEventListener(
      'pagehide',
      function teardownAll() {
        for (const cleanup of cleanups) {
          try {
            cleanup();
          } catch {
            // Ensure remaining cleanups run cleanly
          }
        }
      },
      { once: true }
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})(window);
