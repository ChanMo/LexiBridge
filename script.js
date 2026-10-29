(async() => {
  const {t} = LexiBridgeI18n;
  if(!globalThis.Highlight || !CSS.highlights) return;
  let {words = [], blocked = [], pack, highlightStyle = 'underline'} =
    await chrome.storage.local.get(['words', 'blocked', 'pack', 'highlightStyle']);
  let dict = LexiBridge.buildDictionary(words);
  let defLang = LexiBridgePacks.getPack(pack).defLang;
  words = null;
  let enabled = !blocked.includes(location.hostname);

  const highlight = new Highlight();
  let highlightName = null;
  function applyStyle(style) {
    if(highlightName) CSS.highlights.delete(highlightName);
    highlightName = `lexibridge-${style}`;
    CSS.highlights.set(highlightName, highlight);
  }
  applyStyle(highlightStyle);

  // Keep matches by their source text node. Live Ranges can move to an
  // ancestor when a virtual list removes or reuses the original node.
  const records = new Map();
  const byWord = new Map();
  const excluded = 'meta, style, script, noscript, head, input, textarea, select, pre, code, kbd, svg, [hidden], [inert], [aria-hidden="true"], .lexibridge-ui';
  const pending = new Set();
  let iterator = null, scanTimer = null;
  let dictionaryVersion = 0;

  function acceptText(node) {
    const parent = node.parentElement;
    return node.isConnected && !!parent && !!node.data.trim() &&
      !parent.closest(excluded) && !parent.isContentEditable;
  }

  function clearNode(node) {
    const record = records.get(node);
    if(!record) return;
    for(const entry of record.entries) {
      highlight.delete(entry.range);
      const group = byWord.get(entry.word);
      group.delete(entry);
      if(!group.size) byWord.delete(entry.word);
    }
    records.delete(node);
  }

  function validEntry({node, text, word, range, start, end}) {
    return dict.has(word) && acceptText(node) && node.data === text &&
      range.startContainer === node && range.endContainer === node &&
      range.startOffset === start && range.endOffset === end;
  }

  function highlightText(node) {
    const old = records.get(node);
    if(!acceptText(node)) { clearNode(node); return; }
    if(old?.text === node.data && old.version === dictionaryVersion && old.entries.every(validEntry)) return;
    clearNode(node);
    const entries = LexiBridge.findMatches(node.data, dict).map(m => {
      const range = document.createRange();
      range.setStart(node, m.start);
      range.setEnd(node, m.end);
      const entry = {...m, node, range, text: node.data};
      highlight.add(range);
      if(!byWord.has(m.word)) byWord.set(m.word, new Set());
      byWord.get(m.word).add(entry);
      return entry;
    });
    // Unmatched nodes need no persistent record.
    if(entries.length) records.set(node, {text: node.data, entries, version: dictionaryVersion});
  }

  function* textNodes(root) {
    if(root.nodeType === Node.TEXT_NODE) { yield root; return; }
    if(root.nodeType !== Node.ELEMENT_NODE || root.closest(excluded) || root.isContentEditable) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: n => n.nodeType === Node.TEXT_NODE ? NodeFilter.FILTER_ACCEPT :
        n.matches(excluded) || n.isContentEditable ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP
    });
    while(walker.nextNode()) yield walker.currentNode;
  }

  function queueScan(root) {
    if(!enabled || !root?.isConnected) return;
    if(root.nodeType === Node.ELEMENT_NODE && root.closest(excluded)) return;
    for(const queued of pending) {
      if(queued.contains(root)) return;
      if(root.contains(queued)) pending.delete(queued);
    }
    pending.add(root);
    if(scanTimer === null) scanTimer = setTimeout(flush, 60);
  }

  function flush() {
    scanTimer = null;
    if(!enabled) return;
    const deadline = performance.now() + 6;
    do {
      if(!iterator) {
        const root = pending.values().next().value;
        if(!root) break;
        pending.delete(root);
        if(!root.isConnected) continue;
        iterator = textNodes(root);
      }
      const next = iterator.next();
      if(next.done) iterator = null;
      else highlightText(next.value);
    } while(performance.now() < deadline);
    report();
    if(iterator || pending.size) scanTimer = setTimeout(flush, 16);
  }

  let reported = null, reportTimer = null;
  function report() {
    clearTimeout(reportTimer);
    reportTimer = setTimeout(() => {
      const count = enabled ? byWord.size : 0;
      if(count === reported) return;
      reported = count;
      try {
        chrome.runtime.sendMessage({action: 'badge', data: {count}}).catch(() => {});
      } catch {} // A reloaded extension leaves an orphaned script in old pages.
    }, 500);
  }
  addEventListener('pageshow', e => {
    if(e.persisted) { reported = null; report(); LexiBridgeUI.refresh(); }
  });

  function setEnabled(on) {
    enabled = on;
    clearTimeout(scanTimer);
    scanTimer = null;
    iterator = null;
    pending.clear();
    highlight.clear();
    records.clear();
    byWord.clear();
    cancelHover();
    interactionVersion++;
    LexiBridgeUI.closeAll();
    if(on) queueScan(document.body);
    report();
  }

  new MutationObserver(mutations => {
    if(!enabled) return;
    const removed = new Set(), dirty = new Set();
    let changed = false;
    for(const m of mutations) {
      const parent = m.target.nodeType === Node.TEXT_NODE ? m.target.parentElement : m.target;
      if(parent?.closest('.lexibridge-ui')) continue;
      changed = true;
      if(m.type === 'characterData') {
        clearNode(m.target);
        queueScan(m.target);
      } else if(m.type === 'attributes') {
        dirty.add(m.target);
        queueScan(m.target);
      } else {
        m.removedNodes.forEach(n => removed.add(n));
        m.addedNodes.forEach(queueScan);
      }
    }
    // Clean once per batch, including a subtree removed and reinserted in the
    // same batch: its old Ranges may already have collapsed or moved.
    if(removed.size || dirty.size) {
      const roots = [...removed, ...dirty];
      for(const node of records.keys()) {
        if(!node.isConnected || roots.some(root => root.contains(node))) clearNode(node);
      }
    }
    if(changed) {
      if(hoverEntry && !validEntry(hoverEntry)) cancelHover();
      LexiBridgeUI.refresh();
      report();
    }
  }).observe(document.documentElement, {
    childList: true, characterData: true, subtree: true,
    attributes: true, attributeFilter: ['contenteditable', 'hidden', 'inert', 'aria-hidden']
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if(area !== 'local') return;
    if(changes.highlightStyle) applyStyle(changes.highlightStyle.newValue ?? 'underline');
    if(changes.pack) {
      defLang = LexiBridgePacks.getPack(changes.pack.newValue).defLang;
      LexiBridgeUI.closeAll();
    }
    if(changes.blocked) {
      const on = !(changes.blocked.newValue ?? []).includes(location.hostname);
      if(on !== enabled) setEnabled(on);
    }
    if(changes.words) {
      cancelHover();
      const old = dict;
      dict = LexiBridge.buildDictionary(changes.words.newValue ?? []);
      if(!enabled) return;
      // An added key can change a lemma match anywhere; a removed key only
      // affects nodes previously matched against it. Definition edits need no scan.
      const added = [...dict.keys()].some(k => !old.has(k));
      if(added) dictionaryVersion++;
      for(const [node, record] of records) {
        if(record.entries.some(e => !dict.has(e.word))) {
          clearNode(node);
          if(!added) queueScan(node);
        }
      }
      // Keep existing marks visible while new keys are scanned in slices.
      if(added) queueScan(document.body);
      LexiBridgeUI.refresh();
      report();
    }
  });
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if(request.action === 'page-stats') sendResponse({enabled, count: byWord.size});
  });

  async function changeWord(data) {
    const response = await chrome.runtime.sendMessage({action: 'change-word', data});
    if(!response?.ok) throw new Error('Word update failed');
    return response.result;
  }
  const speak = word => chrome.runtime.sendMessage({action: 'speak', data: {word}});
  const band = word => chrome.runtime.sendMessage({action: 'band', data: {word}});

  function entryAt(x, y) {
    const target = document.caretRangeFromPoint(x, y);
    if(!target) return null;
    const inside = r => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    return records.get(target.startContainer)?.entries.find(e => validEntry(e) &&
      e.range.isPointInRange(target.startContainer, target.startOffset) &&
      [...e.range.getClientRects()].some(inside)) ?? null;
  }

  const interactive = 'a[href], button, label, summary, [role="button"], [role="link"], article[tabindex], [role="article"][tabindex]';
  const inInteractive = entry => !!entry.node.parentElement?.closest(interactive);
  const inUI = e => e.composedPath().some(n => n.classList?.contains('lexibridge-ui'));

  // Snapshot source boundaries: never trust a live Range after a DOM update.
  function rangeAnchor(range) {
    const start = range.startContainer, end = range.endContainer;
    const a = range.startOffset, b = range.endOffset, text = range.toString();
    const startText = start.textContent, endText = end.textContent;
    return () => {
      if(!enabled || !start.isConnected || !end.isConnected || range.collapsed ||
         range.startContainer !== start || range.endContainer !== end ||
         range.startOffset !== a || range.endOffset !== b ||
         start.textContent !== startText || end.textContent !== endText || range.toString() !== text) return null;
      const parent = start.nodeType === Node.TEXT_NODE ? start.parentElement : start;
      if(!parent || parent.closest(excluded) || parent.isContentEditable) return null;
      if(parent.checkVisibility && getComputedStyle(parent).display !== 'contents' &&
         !parent.checkVisibility({checkVisibilityCSS: true})) return null;
      const rect = range.getBoundingClientRect();
      for(let p = parent; p && p !== document.body; p = p.parentElement) {
        const style = getComputedStyle(p), box = p.getBoundingClientRect();
        if(/hidden|clip|auto|scroll/.test(style.overflowY) && (rect.bottom <= box.top || rect.top >= box.bottom)) return null;
        if(/hidden|clip|auto|scroll/.test(style.overflowX) && (rect.right <= box.left || rect.left >= box.right)) return null;
      }
      return rect;
    };
  }

  let activeBox = null, activeEntry = null, activeMode = null;
  let interactionVersion = 0;
  function showWordCard(entry, mode = 'click') {
    if(!validEntry(entry)) return;
    cancelHover();
    interactionVersion++;
    const {word, range} = entry, definition = dict.get(word);
    const anchor = rangeAnchor(range);
    const box = LexiBridgeUI.showCard({
      word, surface: range.toString(), definition, lang: defLang, band: band(word),
      anchor: () => validEntry(entry) && dict.get(word) === definition ? anchor() : null,
      state: 'known', onSpeak: () => speak(word),
      onKnown: async() => {
        const version = interactionVersion;
        const removed = await changeWord({op: 'remove', word, markKnown: true});
        if(!removed.changed || !enabled || document.hidden || version !== interactionVersion) return;
        const rect = anchor();
        if(rect) LexiBridgeUI.erase([rect]);
        LexiBridgeUI.chip(anchor, t('card_knownDone'), t('card_removed', word), t('common_undo'),
          () => changeWord({op: 'restore', ...removed}));
      },
    });
    if(box) {
      activeBox = box; activeEntry = entry; activeMode = mode;
      box.addEventListener('lexibridge-close', () => {
        if(activeBox === box) { activeBox = activeEntry = activeMode = null; cancelHover(); }
      }, {once: true});
    }
    return box;
  }

  document.addEventListener('click', e => {
    if(e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.detail > 1 ||
       e.defaultPrevented || !enabled || !window.getSelection().isCollapsed || inUI(e)) return;
    const entry = entryAt(e.clientX, e.clientY);
    if(!entry || inInteractive(entry)) return;
    e.preventDefault();
    showWordCard(entry);
  });

  const HOVER_OPEN_MS = 500, HOVER_CLOSE_MS = 300;
  let hoverEntry = null, openTimer = null, closeTimer = null;
  function cancelHover() {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    if(pointerFrame !== null) { cancelAnimationFrame(pointerFrame); pointerFrame = null; }
    openTimer = closeTimer = null;
    hoverEntry = null;
  }
  function onPointer(e) {
    if(!enabled || e.buttons || !window.getSelection().isCollapsed) { cancelHover(); return; }
    if(activeBox?.isConnected && activeMode === 'click') return;
    const overCard = activeBox && !!e.target.closest?.('.lexibridge-ui');
    const entry = overCard || !e.target.closest?.(interactive) ? null : entryAt(e.clientX, e.clientY);
    if(overCard || (entry && entry === activeEntry)) { cancelHover(); return; }
    if(entry !== hoverEntry) {
      clearTimeout(openTimer);
      hoverEntry = entry;
      if(entry) openTimer = setTimeout(() => {
        if(enabled && hoverEntry === entry && validEntry(entry)) showWordCard(entry, 'hover');
      }, HOVER_OPEN_MS);
    }
    // Keep the existing preview while waiting for its replacement.
    if(!entry && activeBox?.isConnected && closeTimer === null) {
      const box = activeBox;
      closeTimer = setTimeout(() => LexiBridgeUI.closeCard(box), HOVER_CLOSE_MS);
    } else if(entry) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
  }
  let pointerFrame = null, lastPointer = null;
  document.addEventListener('pointermove', e => {
    if(!enabled || e.pointerType !== 'mouse') return;
    lastPointer = e;
    if(pointerFrame !== null) return;
    pointerFrame = requestAnimationFrame(() => { pointerFrame = null; onPointer(lastPointer); });
  }, {passive: true});
  window.addEventListener('scroll', e => {
    if(inUI(e)) return;
    cancelHover();
    interactionVersion++;
    if(activeMode === 'hover') LexiBridgeUI.closeCard(activeBox);
    LexiBridgeUI.hidePill();
  }, {capture: true, passive: true});
  document.addEventListener('pointerdown', e => {
    if(inUI(e)) return;
    cancelHover();
    interactionVersion++;
  }, true);
  document.addEventListener('keydown', e => {
    if(!e.isComposing && e.key === 'Escape') { cancelHover(); interactionVersion++; }
  }, true);
  document.addEventListener('selectionchange', () => {
    if(document.activeElement?.closest('.lexibridge-ui')) return;
    LexiBridgeUI.hidePill();
    interactionVersion++;
    if(!window.getSelection().isCollapsed) { cancelHover(); LexiBridgeUI.closeCard(); }
  });
  const navigated = () => { cancelHover(); interactionVersion++; LexiBridgeUI.closeAll(); };
  window.addEventListener('popstate', navigated);
  window.addEventListener('hashchange', navigated);
  document.addEventListener('visibilitychange', () => { if(document.hidden) navigated(); });
  document.addEventListener('pointerout', e => {
    if(e.relatedTarget) return;
    cancelHover();
    if(activeMode === 'hover') LexiBridgeUI.closeCard(activeBox);
  });

  document.addEventListener('mouseup', e => {
    if(!enabled || e.button !== 0 || inUI(e)) return;
    setTimeout(() => {
      LexiBridgeUI.hidePill();
      const selection = window.getSelection(), text = selection.toString().trim();
      if(selection.isCollapsed || !LexiBridge.isWord(text) || LexiBridge.lookup(dict, LexiBridge.normalizeWord(text))) return;
      const range = selection.getRangeAt(0).cloneRange(), anchor = rangeAnchor(range);
      if(!anchor()) return;
      LexiBridgeUI.showPill(anchor, () => addFromSelection(text, range));
    });
  });
  document.addEventListener('mousedown', e => {
    if(!inUI(e)) LexiBridgeUI.hidePill();
  });

  async function addFromSelection(text, range) {
    const version = ++interactionVersion, anchor = rangeAnchor(range);
    const {word, definition} = await chrome.runtime.sendMessage({action: 'lookup', data: {word: text}});
    if(version !== interactionVersion || !anchor()) return;
    const card = {word, surface: text, lang: defLang, band: band(word), anchor, onSpeak: () => speak(word)};
    if(definition) {
      await changeWord({op: 'add', word, definition});
      if(version !== interactionVersion || !anchor()) return;
      window.getSelection().removeAllRanges();
      LexiBridgeUI.showCard({...card, definition, state: 'added',
        onUndoAdd: () => changeWord({op: 'remove', word})});
    } else {
      LexiBridgeUI.showCard({...card, definition: '', state: 'new', onSave: async value => {
        await changeWord({op: 'add', word, definition: value});
        if(version === interactionVersion && anchor()) window.getSelection().removeAllRanges();
      }});
    }
  }
  if(enabled) queueScan(document.body);
})();
