(function (global) {
  'use strict';

  const AnimeWE = global.AnimeWE || (global.AnimeWE = {});
  const SVG_NS = 'http://www.w3.org/2000/svg';

  /**
   * Custom Bookmarks Bar backed by chrome.bookmarks + MV3 _favicon API.
   * Uses textContent exclusively (never innerHTML) to prevent XSS.
   */
  function initBookmarks(config) {
    const barEl = document.getElementById('bookmarks-bar');
    const dropdownLayer = document.getElementById('bookmark-dropdown-layer');
    if (!barEl || !dropdownLayer) {
      return function noop() {};
    }

    const bookmarksApi = global.chrome?.bookmarks;
    const runtimeApi = global.chrome?.runtime;
    const targetFolderId = config?.BOOKMARKS_BAR_ID || '1';

    let activeTriggerBtn = null;
    let refreshTimerId = null;
    let destroyed = false;

    function createSvgIcon(className, pathData, viewBox) {
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', viewBox || '0 0 16 16');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('class', className);

      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', pathData);
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '1.4');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(path);

      return svg;
    }

    function createFolderSvg() {
      return createSvgIcon(
        'bookmark-fallback-svg',
        'M1.75 4.25A1.25 1.25 0 0 1 3 3h2.85c.38 0 .74.17.98.47l.72.9c.14.18.36.28.59.28H13A1.25 1.25 0 0 1 14.25 5.9v5.85A1.25 1.25 0 0 1 13 13H3a1.25 1.25 0 0 1-1.25-1.25V4.25Z'
      );
    }

    function createGlobeSvg() {
      return createSvgIcon(
        'bookmark-fallback-svg',
        'M8 1.75a6.25 6.25 0 1 0 0 12.5 6.25 6.25 0 0 0 0-12.5ZM2.15 8h11.7M8 1.75c1.72 1.75 2.6 3.83 2.6 6.25S9.72 12.5 8 14.25C6.28 12.5 5.4 10.42 5.4 8S6.28 3.5 8 1.75Z'
      );
    }

    function createChevronSvg() {
      return createSvgIcon('bookmark-chevron', 'M4.5 6.25 8 9.75l3.5-3.5');
    }

    function isSafeHttpUrl(rawUrl) {
      if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
        return false;
      }
      try {
        const parsed = new URL(rawUrl);
        return (
          parsed.protocol === 'http:' ||
          parsed.protocol === 'https:' ||
          parsed.protocol === 'ftp:'
        );
      } catch {
        return false;
      }
    }

    function buildFaviconUrl(pageUrl) {
      if (!runtimeApi?.getURL || !isSafeHttpUrl(pageUrl)) {
        return null;
      }
      try {
        const url = new URL(runtimeApi.getURL('/_favicon/'));
        url.searchParams.set('pageUrl', pageUrl);
        url.searchParams.set('size', '32');
        return url.toString();
      } catch {
        return null;
      }
    }

    function createFaviconNode(pageUrl) {
      const iconUrl = buildFaviconUrl(pageUrl);
      if (!iconUrl) {
        return createGlobeSvg();
      }

      const img = document.createElement('img');
      img.className = 'bookmark-icon';
      img.width = 15;
      img.height = 15;
      img.alt = '';
      img.decoding = 'async';
      img.loading = 'lazy';
      img.src = iconUrl;
      img.addEventListener(
        'error',
        function onIconError() {
          if (img.parentNode) {
            img.replaceWith(createGlobeSvg());
          }
        },
        { once: true }
      );
      return img;
    }

    function getBookmarkLabel(node) {
      const rawTitle = typeof node.title === 'string' ? node.title.trim() : '';
      if (rawTitle) {
        return rawTitle;
      }
      if (typeof node.url === 'string' && node.url) {
        try {
          return new URL(node.url).hostname || node.url;
        } catch {
          return node.url;
        }
      }
      return 'Untitled';
    }

    function createBookmarkLink(node, className, titleClassName) {
      const link = document.createElement('a');
      link.className = className;

      const label = getBookmarkLabel(node);
      if (isSafeHttpUrl(node.url)) {
        link.href = node.url;
        link.title = node.title ? `${label}\n${node.url}` : node.url;
      } else {
        link.href = '#';
        link.title = `${label} (unsupported URL scheme)`;
        link.addEventListener('click', function preventUnsafe(event) {
          event.preventDefault();
        });
      }

      link.appendChild(createFaviconNode(node.url));

      const textSpan = document.createElement('span');
      textSpan.className = titleClassName;
      textSpan.textContent = label;
      link.appendChild(textSpan);

      return link;
    }

    function closeDropdown(restoreFocus) {
      if (activeTriggerBtn) {
        activeTriggerBtn.setAttribute('aria-expanded', 'false');
        if (restoreFocus) {
          activeTriggerBtn.focus({ preventScroll: true });
        }
      }
      activeTriggerBtn = null;
      dropdownLayer.hidden = true;
      dropdownLayer.replaceChildren();
    }

    function appendDropdownChildren(container, nodes) {
      if (!Array.isArray(nodes) || nodes.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'dropdown-empty';
        empty.textContent = 'Empty folder';
        container.appendChild(empty);
        return;
      }

      for (const child of nodes) {
        if (Array.isArray(child.children)) {
          const folderBtn = document.createElement('button');
          folderBtn.type = 'button';
          folderBtn.className = 'dropdown-entry dropdown-folder-toggle';
          folderBtn.setAttribute('aria-expanded', 'false');
          folderBtn.appendChild(createFolderSvg());

          const labelSpan = document.createElement('span');
          labelSpan.className = 'dropdown-entry-title';
          labelSpan.textContent = getBookmarkLabel(child);
          folderBtn.appendChild(labelSpan);
          folderBtn.appendChild(createChevronSvg());

          const nestedContainer = document.createElement('div');
          nestedContainer.className = 'dropdown-subfolder-children';
          nestedContainer.hidden = true;
          appendDropdownChildren(nestedContainer, child.children);

          folderBtn.addEventListener('click', function toggleNested(event) {
            event.stopPropagation();
            const isOpen = folderBtn.getAttribute('aria-expanded') === 'true';
            folderBtn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
            nestedContainer.hidden = isOpen;
          });

          container.appendChild(folderBtn);
          container.appendChild(nestedContainer);
        } else if (child.url) {
          const entry = createBookmarkLink(
            child,
            'dropdown-entry',
            'dropdown-entry-title'
          );
          entry.setAttribute('role', 'menuitem');
          container.appendChild(entry);
        }
      }
    }

    function positionDropdown(triggerBtn) {
      const rect = triggerBtn.getBoundingClientRect();
      const margin = 8;

      dropdownLayer.style.left = '0px';
      dropdownLayer.style.top = `${Math.round(rect.bottom + 6)}px`;
      dropdownLayer.hidden = false;

      const menuWidth = dropdownLayer.offsetWidth;
      const maxLeft = Math.max(margin, global.innerWidth - menuWidth - margin);
      const clampedLeft = Math.min(Math.max(margin, rect.left), maxLeft);
      dropdownLayer.style.left = `${Math.round(clampedLeft)}px`;
    }

    function openFolderDropdown(folderNode, triggerBtn) {
      const isSameTrigger = activeTriggerBtn === triggerBtn && !dropdownLayer.hidden;
      closeDropdown(false);
      if (isSameTrigger) {
        return;
      }

      activeTriggerBtn = triggerBtn;
      triggerBtn.setAttribute('aria-expanded', 'true');

      const fragment = document.createDocumentFragment();
      appendDropdownChildren(fragment, folderNode.children || []);
      dropdownLayer.replaceChildren(fragment);
      positionDropdown(triggerBtn);
    }

    function findNodeById(nodes, id) {
      if (!Array.isArray(nodes)) {
        return null;
      }
      for (const node of nodes) {
        if (node.id === id) {
          return node;
        }
        if (Array.isArray(node.children)) {
          const match = findNodeById(node.children, id);
          if (match) {
            return match;
          }
        }
      }
      return null;
    }

    function renderBar(nodes) {
      closeDropdown(false);

      if (!Array.isArray(nodes) || nodes.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'bookmarks-empty';
        empty.textContent = 'Bookmarks Bar is empty';
        barEl.replaceChildren(empty);
        return;
      }

      const fragment = document.createDocumentFragment();

      for (const node of nodes) {
        if (Array.isArray(node.children)) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'bookmark-item';
          btn.setAttribute('aria-expanded', 'false');
          btn.setAttribute('aria-haspopup', 'menu');
          btn.title = getBookmarkLabel(node);

          btn.appendChild(createFolderSvg());

          const titleSpan = document.createElement('span');
          titleSpan.className = 'bookmark-title';
          titleSpan.textContent = getBookmarkLabel(node);
          btn.appendChild(titleSpan);
          btn.appendChild(createChevronSvg());

          btn.addEventListener('click', function onFolderClick(event) {
            event.stopPropagation();
            openFolderDropdown(node, btn);
          });

          fragment.appendChild(btn);
        } else if (node.url) {
          fragment.appendChild(
            createBookmarkLink(node, 'bookmark-item', 'bookmark-title')
          );
        }
      }

      barEl.replaceChildren(fragment);
    }

    async function loadBookmarks() {
      if (destroyed) {
        return;
      }

      if (!bookmarksApi?.getTree) {
        const fallbackNote = document.createElement('span');
        fallbackNote.className = 'bookmarks-empty';
        fallbackNote.textContent = 'Bookmarks Bar available when loaded as Chrome Extension';
        barEl.replaceChildren(fallbackNote);
        return;
      }

      try {
        const tree = await bookmarksApi.getTree();
        if (destroyed) {
          return;
        }
        const barNode = findNodeById(tree, targetFolderId);
        renderBar(barNode?.children || []);
      } catch {
        if (!destroyed) {
          const errNote = document.createElement('span');
          errNote.className = 'bookmarks-empty';
          errNote.textContent = 'Unable to read bookmarks';
          barEl.replaceChildren(errNote);
        }
      }
    }

    function scheduleRefresh() {
      if (destroyed) {
        return;
      }
      if (refreshTimerId !== null) {
        global.clearTimeout(refreshTimerId);
      }
      refreshTimerId = global.setTimeout(function runRefresh() {
        refreshTimerId = null;
        loadBookmarks();
      }, 60);
    }

    function handleDocumentClick(event) {
      if (dropdownLayer.hidden) {
        return;
      }
      if (dropdownLayer.contains(event.target)) {
        return;
      }
      if (activeTriggerBtn && activeTriggerBtn.contains(event.target)) {
        return;
      }
      closeDropdown(false);
    }

    function handleDocumentKeyDown(event) {
      if (event.key === 'Escape' && !dropdownLayer.hidden) {
        event.preventDefault();
        closeDropdown(true);
      }
    }

    function handleWindowResize() {
      if (!dropdownLayer.hidden) {
        closeDropdown(false);
      }
    }

    function handleBarWheel(event) {
      if (barEl.scrollWidth <= barEl.clientWidth) {
        return;
      }
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        event.preventDefault();
        barEl.scrollLeft += event.deltaY;
      }
    }

    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleDocumentKeyDown);
    global.addEventListener('resize', handleWindowResize);
    barEl.addEventListener('wheel', handleBarWheel, { passive: false });

    const bookmarkEvents = [
      bookmarksApi?.onCreated,
      bookmarksApi?.onRemoved,
      bookmarksApi?.onChanged,
      bookmarksApi?.onMoved,
      bookmarksApi?.onChildrenReordered,
      bookmarksApi?.onImportEnded
    ];

    for (const evt of bookmarkEvents) {
      if (evt?.addListener) {
        evt.addListener(scheduleRefresh);
      }
    }

    loadBookmarks();

    return function destroyBookmarks() {
      destroyed = true;
      if (refreshTimerId !== null) {
        global.clearTimeout(refreshTimerId);
        refreshTimerId = null;
      }
      document.removeEventListener('click', handleDocumentClick);
      document.removeEventListener('keydown', handleDocumentKeyDown);
      global.removeEventListener('resize', handleWindowResize);
      barEl.removeEventListener('wheel', handleBarWheel);

      for (const evt of bookmarkEvents) {
        if (evt?.removeListener) {
          evt.removeListener(scheduleRefresh);
        }
      }

      closeDropdown(false);
    };
  }

  AnimeWE.initBookmarks = initBookmarks;
})(window);
