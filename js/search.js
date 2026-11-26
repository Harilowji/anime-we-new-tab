(function (global) {
  'use strict';

  const AnimeWE = global.AnimeWE || (global.AnimeWE = {});

  /**
   * Centered search bar with Tab cycling through configured search engines.
   */
  function initSearch(config) {
    const form = document.getElementById('search-form');
    const input = document.getElementById('search-input');
    const badge = document.getElementById('engine-badge');
    const label = document.getElementById('engine-label');

    if (!form || !input || !badge || !label || !config?.SEARCH_ENGINES?.length) {
      return function noop() {};
    }

    const engines = config.SEARCH_ENGINES;
    let currentIndex = 0;

    function applyEngine(index) {
      const count = engines.length;
      currentIndex = ((index % count) + count) % count;
      const engine = engines[currentIndex];

      label.textContent = engine.name;
      input.placeholder = engine.placeholder;
      form.style.setProperty('--engine-color', engine.color);
      badge.setAttribute(
        'aria-label',
        `Current search engine: ${engine.name}. Click or press Tab to switch.`
      );
    }

    function cycleEngine(step) {
      applyEngine(currentIndex + step);
    }

    function handleKeyDown(event) {
      if (event.isComposing) {
        return;
      }

      if (
        event.key === 'Tab' &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey
      ) {
        event.preventDefault();
        cycleEngine(event.shiftKey ? -1 : 1);
      }
    }

    function handleBadgeClick() {
      cycleEngine(1);
      input.focus({ preventScroll: true });
    }

    function handleSubmit(event) {
      event.preventDefault();
      const query = input.value.trim();
      if (!query) {
        input.focus({ preventScroll: true });
        return;
      }

      const engine = engines[currentIndex];
      const targetUrl = `${engine.url}${encodeURIComponent(query)}`;
      global.location.assign(targetUrl);
    }

    applyEngine(0);
    input.addEventListener('keydown', handleKeyDown);
    badge.addEventListener('click', handleBadgeClick);
    form.addEventListener('submit', handleSubmit);

    // Ensure immediate keyboard readiness when the New Tab document gains focus
    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }

    return function destroySearch() {
      input.removeEventListener('keydown', handleKeyDown);
      badge.removeEventListener('click', handleBadgeClick);
      form.removeEventListener('submit', handleSubmit);
    };
  }

  AnimeWE.initSearch = initSearch;
})(window);
