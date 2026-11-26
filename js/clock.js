(function (global) {
  'use strict';

  const AnimeWE = global.AnimeWE || (global.AnimeWE = {});

  /**
   * Minimalist digital clock that aligns updates to minute boundaries
   * and only touches the DOM when the displayed minute or date changes.
   */
  function initClock() {
    const timeEl = document.getElementById('clock-time');
    const dateEl = document.getElementById('clock-date');
    if (!timeEl || !dateEl) {
      return function noop() {};
    }

    const dateFormatter = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });

    let lastMinuteKey = '';
    let lastDateKey = '';
    let timerId = null;
    let destroyed = false;

    function pad2(n) {
      return n < 10 ? `0${n}` : String(n);
    }

    function renderIfChanged(now) {
      const hours = pad2(now.getHours());
      const minutes = pad2(now.getMinutes());
      const minuteKey = `${hours}:${minutes}`;

      if (minuteKey !== lastMinuteKey) {
        lastMinuteKey = minuteKey;
        timeEl.textContent = minuteKey;
        timeEl.setAttribute('datetime', minuteKey);
      }

      const dateKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
      if (dateKey !== lastDateKey) {
        lastDateKey = dateKey;
        const formatted = dateFormatter.format(now).replace(',', ' ·');
        dateEl.textContent = formatted;
      }
    }

    function clearScheduledTick() {
      if (timerId !== null) {
        global.clearTimeout(timerId);
        timerId = null;
      }
    }

    function scheduleNextMinute() {
      clearScheduledTick();
      if (destroyed || document.hidden) {
        return;
      }

      const now = new Date();
      renderIfChanged(now);

      const msUntilNextMinute =
        (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 25;

      timerId = global.setTimeout(scheduleNextMinute, Math.max(50, msUntilNextMinute));
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        clearScheduledTick();
      } else {
        scheduleNextMinute();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    scheduleNextMinute();

    return function destroyClock() {
      destroyed = true;
      clearScheduledTick();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }

  AnimeWE.initClock = initClock;
})(window);
