(function (global) {
  'use strict';

  const AnimeWE = global.AnimeWE || (global.AnimeWE = {});

  const VIDEO_EXT_RE = /\.(mp4|webm|ogg|ogv|m4v|mov)(?:[?#].*)?$/i;
  const IMAGE_EXT_RE = /\.(jpg|jpeg|png|webp|gif|avif|bmp)(?:[?#].*)?$/i;
  const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  const RGB_COLOR_RE = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i;

  /**
   * Synchronizes live Wallpaper Engine backgrounds (video / image / scene fallback)
   * with GPU/RAM pause-on-hide controls and bounded WebSocket reconnection.
   */
  function initWallpaper(config) {
    const fallbackEl = document.getElementById('bg-fallback');
    const imageEl = document.getElementById('bg-image');
    const videoEl = document.getElementById('bg-video');
    const statusBtn = document.getElementById('we-status');
    const statusTextEl = document.getElementById('we-status-text');

    if (!fallbackEl || !imageEl || !videoEl || !config) {
      return function noop() {};
    }

    let activeMode = 'fallback';
    let currentPayloadKey = '';
    let mediaToken = 0;
    let isWindowBlurred = false;
    let destroyed = false;

    let ws = null;
    let wsAttempts = 0;
    let wsReconnectTimer = null;
    let fetchController = null;
    let activeImageCleanup = null;
    let activeVideoCleanup = null;

    function setStatus(state, label, tooltip) {
      if (!statusBtn || !statusTextEl) {
        return;
      }
      statusBtn.dataset.state = state;
      statusTextEl.textContent = label;
      statusBtn.title = tooltip;
    }

    function parseColorToRgbTuple(colorStr) {
      if (typeof colorStr !== 'string') {
        return null;
      }
      const trimmed = colorStr.trim();

      if (HEX_COLOR_RE.test(trimmed)) {
        const hex = trimmed.slice(1);
        if (hex.length === 3 || hex.length === 4) {
          const r = parseInt(hex[0] + hex[0], 16);
          const g = parseInt(hex[1] + hex[1], 16);
          const b = parseInt(hex[2] + hex[2], 16);
          return { css: `#${hex.slice(0, 3)}`, rgb: `${r}, ${g}, ${b}` };
        }
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return { css: `#${hex.slice(0, 6)}`, rgb: `${r}, ${g}, ${b}` };
      }

      const rgbMatch = RGB_COLOR_RE.exec(trimmed);
      if (rgbMatch) {
        const r = Math.min(255, Number(rgbMatch[1]));
        const g = Math.min(255, Number(rgbMatch[2]));
        const b = Math.min(255, Number(rgbMatch[3]));
        return { css: `rgb(${r}, ${g}, ${b})`, rgb: `${r}, ${g}, ${b}` };
      }

      return null;
    }

    function applyAccentColor(rawColor) {
      const parsed =
        parseColorToRgbTuple(rawColor) ||
        parseColorToRgbTuple(config.DEFAULT_ACCENT_COLOR);

      if (parsed) {
        document.documentElement.style.setProperty('--accent-color', parsed.css);
        document.documentElement.style.setProperty('--accent-rgb', parsed.rgb);
      }
    }

    function resolveMediaUrl(rawUrl) {
      if (typeof rawUrl !== 'string') {
        return null;
      }
      const trimmed = rawUrl.trim();
      if (!trimmed) {
        return null;
      }
      try {
        const base = trimmed.startsWith('/')
          ? config.getServerOrigin()
          : global.location.href;
        const resolved = new URL(trimmed, base);
        if (
          resolved.protocol === 'http:' ||
          resolved.protocol === 'https:' ||
          resolved.protocol === 'chrome-extension:' ||
          resolved.protocol === 'blob:'
        ) {
          return resolved.toString();
        }
        return null;
      } catch {
        return null;
      }
    }

    function canPlayVideoNow() {
      return !destroyed && activeMode === 'video' && !document.hidden && !isWindowBlurred;
    }

    function pauseVideoSafely() {
      if (!videoEl.paused) {
        videoEl.pause();
      }
    }

    function playVideoSafely() {
      if (!canPlayVideoNow() || !videoEl.getAttribute('src')) {
        return;
      }
      const playPromise = videoEl.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(function ignorePlayRejection() {});
      }
    }

    function syncVideoPlayback() {
      if (activeMode !== 'video') {
        return;
      }
      if (document.hidden || isWindowBlurred) {
        pauseVideoSafely();
        setStatus(
          'paused',
          'Paused',
          'Video paused while tab is hidden or unfocused to save GPU/RAM'
        );
      } else {
        playVideoSafely();
        setStatus('live', 'WE Live', 'Connected to Wallpaper Engine Local Server');
      }
    }

    function clearActiveImageListeners() {
      if (activeImageCleanup) {
        activeImageCleanup();
        activeImageCleanup = null;
      }
    }

    function clearActiveVideoListeners() {
      if (activeVideoCleanup) {
        activeVideoCleanup();
        activeVideoCleanup = null;
      }
    }

    function releaseVideoElement() {
      clearActiveVideoListeners();
      videoEl.classList.remove('is-visible');
      pauseVideoSafely();
      if (videoEl.hasAttribute('src')) {
        videoEl.removeAttribute('src');
        delete videoEl.dataset.activeSrc;
        videoEl.load();
      }
    }

    function releaseImageElement() {
      clearActiveImageListeners();
      imageEl.classList.remove('is-visible');
      if (imageEl.hasAttribute('src')) {
        imageEl.removeAttribute('src');
        delete imageEl.dataset.activeSrc;
      }
    }

    function showFallback(reasonLabel) {
      mediaToken += 1;
      activeMode = 'fallback';
      currentPayloadKey = '';

      releaseVideoElement();
      releaseImageElement();

      if (fallbackEl.getAttribute('src') !== config.FALLBACK_IMAGE) {
        fallbackEl.src = config.FALLBACK_IMAGE;
      }
      fallbackEl.classList.add('is-visible');
      applyAccentColor(config.DEFAULT_ACCENT_COLOR);

      setStatus(
        'fallback',
        'Fallback',
        reasonLabel || 'Using static Dark Anime fallback (click to reconnect)'
      );
    }

    function showImage(url, accentColor) {
      const token = ++mediaToken;
      activeMode = 'image';

      releaseVideoElement();
      clearActiveImageListeners();
      applyAccentColor(accentColor);

      if (imageEl.dataset.activeSrc === url && imageEl.complete) {
        imageEl.classList.add('is-visible');
        fallbackEl.classList.remove('is-visible');
        setStatus('live', 'WE Image', 'Displaying static image from Wallpaper Engine');
        return;
      }

      function onLoad() {
        clearActiveImageListeners();
        if (destroyed || token !== mediaToken) {
          return;
        }
        imageEl.classList.add('is-visible');
        fallbackEl.classList.remove('is-visible');
        setStatus('live', 'WE Image', 'Displaying static image from Wallpaper Engine');
      }

      function onError() {
        clearActiveImageListeners();
        if (destroyed || token !== mediaToken) {
          return;
        }
        showFallback('Image failed to load; reverted to fallback');
      }

      activeImageCleanup = function cleanupImage() {
        imageEl.removeEventListener('load', onLoad);
        imageEl.removeEventListener('error', onError);
      };

      imageEl.addEventListener('load', onLoad);
      imageEl.addEventListener('error', onError);
      imageEl.dataset.activeSrc = url;
      imageEl.src = url;
    }

    function showVideo(url, accentColor) {
      const token = ++mediaToken;
      activeMode = 'video';

      releaseImageElement();
      clearActiveVideoListeners();
      applyAccentColor(accentColor);

      if (videoEl.dataset.activeSrc === url && videoEl.readyState >= 2) {
        videoEl.classList.add('is-visible');
        fallbackEl.classList.remove('is-visible');
        syncVideoPlayback();
        return;
      }

      function onReady() {
        clearActiveVideoListeners();
        if (destroyed || token !== mediaToken) {
          return;
        }
        videoEl.classList.add('is-visible');
        fallbackEl.classList.remove('is-visible');
        syncVideoPlayback();
      }

      function onError() {
        clearActiveVideoListeners();
        if (destroyed || token !== mediaToken || !videoEl.getAttribute('src')) {
          return;
        }
        showFallback('Video stream unavailable; reverted to fallback');
      }

      activeVideoCleanup = function cleanupVideo() {
        videoEl.removeEventListener('canplay', onReady);
        videoEl.removeEventListener('error', onError);
      };

      videoEl.addEventListener('canplay', onReady);
      videoEl.addEventListener('error', onError);
      videoEl.dataset.activeSrc = url;
      videoEl.src = url;

      if (canPlayVideoNow()) {
        playVideoSafely();
      } else {
        pauseVideoSafely();
      }
    }

    function applyWallpaperPayload(rawPayload) {
      if (destroyed || !rawPayload || typeof rawPayload !== 'object') {
        return;
      }

      const payload =
        rawPayload.data && typeof rawPayload.data === 'object'
          ? rawPayload.data
          : rawPayload.wallpaper && typeof rawPayload.wallpaper === 'object'
          ? rawPayload.wallpaper
          : rawPayload;

      const type =
        typeof payload.type === 'string' ? payload.type.trim().toLowerCase() : '';
      const resolvedUrl = resolveMediaUrl(payload.url);
      const resolvedVideoUrl = resolveMediaUrl(payload.videoUrl || payload.video);
      const resolvedPreviewUrl = resolveMediaUrl(payload.previewUrl || payload.preview);
      const accentColor =
        typeof payload.accentColor === 'string' ? payload.accentColor : '';

      const nextKey = `${type}|${resolvedUrl || ''}|${resolvedVideoUrl || ''}|${accentColor}`;
      if (nextKey === currentPayloadKey && activeMode !== 'fallback') {
        return;
      }
      currentPayloadKey = nextKey;

      if (type === 'video') {
        if (resolvedUrl) {
          showVideo(resolvedUrl, accentColor);
        } else {
          showFallback('Video URL missing; reverted to fallback');
        }
        return;
      }

      if (type === 'image') {
        if (resolvedUrl) {
          showImage(resolvedUrl, accentColor);
        } else {
          showFallback('Image URL missing; reverted to fallback');
        }
        return;
      }

      if (type === 'scene') {
        const videoCandidate =
          resolvedVideoUrl ||
          (resolvedUrl && VIDEO_EXT_RE.test(resolvedUrl) ? resolvedUrl : null);

        if (videoCandidate) {
          showVideo(videoCandidate, accentColor);
          return;
        }

        const imageCandidate =
          resolvedPreviewUrl ||
          (resolvedUrl && IMAGE_EXT_RE.test(resolvedUrl) ? resolvedUrl : null);

        if (imageCandidate) {
          showImage(imageCandidate, accentColor);
          return;
        }

        // Scene without video/image preview -> smoothly hide video and show fallback.jpg
        showFallback('Wallpaper Engine scene has no video stream; showing fallback');
        applyAccentColor(accentColor);
        return;
      }

      showFallback('Unsupported wallpaper type; showing fallback');
    }

    function clearWsReconnect() {
      if (wsReconnectTimer !== null) {
        global.clearTimeout(wsReconnectTimer);
        wsReconnectTimer = null;
      }
    }

    function closeWebSocket() {
      clearWsReconnect();
      if (!ws) {
        return;
      }
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      ws = null;
    }

    function scheduleWsReconnect() {
      if (destroyed || wsReconnectTimer !== null) {
        return;
      }
      if (wsAttempts >= config.WS_MAX_RECONNECT_ATTEMPTS) {
        return;
      }

      const delay = Math.min(
        config.WS_RECONNECT_BASE_DELAY_MS * Math.pow(2, wsAttempts),
        config.WS_RECONNECT_MAX_DELAY_MS
      );
      wsAttempts += 1;

      wsReconnectTimer = global.setTimeout(function retryWs() {
        wsReconnectTimer = null;
        connectWebSocket();
      }, delay);
    }

    function connectWebSocket() {
      if (destroyed || ws || typeof global.WebSocket !== 'function') {
        return;
      }

      clearWsReconnect();
      let socket;
      try {
        socket = new global.WebSocket(config.getWsUrl());
      } catch {
        scheduleWsReconnect();
        return;
      }

      ws = socket;

      socket.onopen = function handleWsOpen() {
        if (destroyed || ws !== socket) {
          return;
        }
        wsAttempts = 0;
      };

      socket.onmessage = function handleWsMessage(event) {
        if (destroyed || ws !== socket || typeof event.data !== 'string') {
          return;
        }
        try {
          const parsed = JSON.parse(event.data);
          applyWallpaperPayload(parsed);
        } catch {
          // Ignore non-JSON heartbeat/control frames silently
        }
      };

      socket.onerror = function handleWsError() {
        // Handled silently on close without polluting console
      };

      socket.onclose = function handleWsClose() {
        if (ws === socket) {
          ws = null;
        }
        if (!destroyed) {
          scheduleWsReconnect();
        }
      };
    }

    async function fetchCurrentWallpaper() {
      if (destroyed) {
        return;
      }

      if (fetchController) {
        fetchController.abort();
      }

      const controller = new AbortController();
      fetchController = controller;
      const timeoutId = global.setTimeout(function abortFetch() {
        controller.abort();
      }, config.FETCH_TIMEOUT_MS);

      setStatus('connecting', 'Syncing', 'Connecting to Wallpaper Engine Local Server...');

      let serverReachable = false;
      try {
        const response = await global.fetch(config.getApiUrl(), {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal
        });

        serverReachable = true;
        if (!response.ok) {
          showFallback(`Local Server returned HTTP ${response.status}`);
        } else {
          const data = await response.json();
          applyWallpaperPayload(data);
        }
      } catch {
        showFallback('Local Server offline; using fallback wallpaper');
      } finally {
        global.clearTimeout(timeoutId);
        if (fetchController === controller) {
          fetchController = null;
        }
      }

      if (!destroyed && (serverReachable || config.CONNECT_WS_ON_HTTP_ERROR)) {
        wsAttempts = 0;
        connectWebSocket();
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        pauseVideoSafely();
        if (activeMode === 'video') {
          setStatus(
            'paused',
            'Paused',
            'Video paused while tab is hidden to save GPU/RAM'
          );
        }
      } else {
        if (document.hasFocus()) {
          isWindowBlurred = false;
        }
        syncVideoPlayback();
      }
    }

    function handleWindowBlur() {
      isWindowBlurred = true;
      if (activeMode === 'video') {
        pauseVideoSafely();
        setStatus(
          'paused',
          'Paused',
          'Video paused while window is unfocused to save GPU/RAM'
        );
      }
    }

    function handleWindowFocus() {
      isWindowBlurred = false;
      syncVideoPlayback();
    }

    function handleStatusClick() {
      closeWebSocket();
      wsAttempts = 0;
      currentPayloadKey = '';
      fetchCurrentWallpaper();
    }

    function handleVideoRuntimeError() {
      if (activeMode === 'video' && videoEl.getAttribute('src')) {
        showFallback('Video playback error; reverted to fallback');
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    global.addEventListener('blur', handleWindowBlur);
    global.addEventListener('focus', handleWindowFocus);
    videoEl.addEventListener('error', handleVideoRuntimeError);
    if (statusBtn) {
      statusBtn.addEventListener('click', handleStatusClick);
    }

    applyAccentColor(config.DEFAULT_ACCENT_COLOR);
    fetchCurrentWallpaper();

    return function destroyWallpaper() {
      destroyed = true;
      if (fetchController) {
        fetchController.abort();
        fetchController = null;
      }
      closeWebSocket();
      releaseVideoElement();
      releaseImageElement();

      document.removeEventListener('visibilitychange', handleVisibilityChange);
      global.removeEventListener('blur', handleWindowBlur);
      global.removeEventListener('focus', handleWindowFocus);
      videoEl.removeEventListener('error', handleVideoRuntimeError);
      if (statusBtn) {
        statusBtn.removeEventListener('click', handleStatusClick);
      }
    };
  }

  AnimeWE.initWallpaper = initWallpaper;
})(window);
