(async() => {
  const {t} = LexiBridgeI18n;
  let {words = [], blocked = [], pack, highlightStyle = 'underline'} =
    await chrome.storage.local.get(['words', 'blocked', 'pack', 'highlightStyle']);
  let dict = LexiBridge.buildDictionary(words);
  let defLang = LexiBridgePacks.getPack(pack).defLang;
  words = null;
  let enabled = !blocked.includes(location.hostname);

  // Each style is a separately named highlight, styled in app.css.
  const highlight = new Highlight();
  let highlightName = null;
  function applyStyle(style) {
    if(highlightName) CSS.highlights.delete(highlightName);
    highlightName = `lexibridge-${style}`;
    CSS.highlights.set(highlightName, highlight);
  }
  applyStyle(highlightStyle);

  let entries = []; // [{word, range}]
  let seen = new WeakSet();
  const excluded = 'meta, style, script, noscript, head, input, textarea, select, pre, code, kbd, svg, .lexibridge-ui';

  function acceptText(node) {
    const parent = node.parentElement;
    if(!parent || !node.data.trim()) {
      return false;
    }
    return !parent.closest(excluded) && !parent.isContentEditable;
  }

  // only: highlight just these words (newly added ones) in already seen text.
  function highlightText(node, only) {
    seen.add(node);
    for(const m of LexiBridge.findMatches(node.data, dict)) {
      if(only && !only.has(m.word)) continue;
      const range = document.createRange();
      range.setStart(node, m.start);
      range.setEnd(node, m.end);
      entries.push({word: m.word, range});
      highlight.add(range);
    }
  }

  function scan(root, only) {
    // Unseen nodes with `only` are left to the full scan of pending mutations.
    const accept = (n) => acceptText(n) && (only ? seen.has(n) : !seen.has(n));
    if(root.nodeType === Node.TEXT_NODE) {
      if(accept(root)) highlightText(root, only);
      return;
    }
    if(root.nodeType !== Node.ELEMENT_NODE || root.closest(excluded)) {
      return;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => accept(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    });
    while(walker.nextNode()) {
      highlightText(walker.currentNode, only);
    }
    report();
  }

  function removeEntries(shouldRemove) {
    entries = entries.filter(e => {
      if(shouldRemove(e)) {
	highlight.delete(e.range);
	return false;
      }
      return true;
    });
    report();
  }

  // The toolbar badge shows how many distinct words are highlighted here.
  // Sent once things settle, and only when the number changes.
  let reported = null;
  let reportTimer = null;
  function report() {
    clearTimeout(reportTimer);
    reportTimer = setTimeout(() => {
      const count = enabled ? new Set(entries.map(e => e.word)).size : 0;
      if(count === reported) return;
      reported = count;
      try {
	chrome.runtime.sendMessage({action: 'badge', data: {count}}).catch(() => {});
      } catch {} // extension reloaded: this page keeps an orphaned script
    }, 500);
  }
  // Pages restored from the back/forward cache lost their badge.
  addEventListener('pageshow', (e) => {
    if(e.persisted) {
      reported = null;
      report();
    }
  });

  function setEnabled(on) {
    enabled = on;
    highlight.clear();
    entries = [];
    seen = new WeakSet();
    LexiBridgeUI.closeAll();
    if(on) scan(document.body);
    report();
  }

  if(enabled) scan(document.body);

  // Content added later (SPA navigation, infinite scroll, lazy loading).
  let pending = [];
  let timer = null;
  new MutationObserver((mutations) => {
    if(!enabled) return;
    for(const m of mutations) {
      pending.push(...m.addedNodes);
    }
    if(!timer) {
      timer = setTimeout(() => {
	const nodes = pending;
	pending = [];
	timer = null;
	// Ranges in removed text are moved out of it by the browser and collapse.
	removeEntries(e => e.range.collapsed);
	nodes.forEach(n => n.isConnected && scan(n));
      }, 300);
    }
  }).observe(document.body, {childList: true, subtree: true});

  // Settings changed here, in another tab, the popup or the options page.
  chrome.storage.onChanged.addListener((changes, area) => {
    if(area !== 'local') {
      return;
    }
    if(changes.highlightStyle) {
      applyStyle(changes.highlightStyle.newValue ?? 'underline');
    }
    if(changes.pack) {
      defLang = LexiBridgePacks.getPack(changes.pack.newValue).defLang;
    }
    if(changes.blocked) {
      const on = !(changes.blocked.newValue ?? []).includes(location.hostname);
      if(on !== enabled) setEnabled(on);
    }
    if(changes.words) {
      const old = dict;
      dict = LexiBridge.buildDictionary(changes.words.newValue ?? []);
      if(!enabled) return;
      removeEntries(e => !dict.has(e.word));
      const added = new Set([...dict.keys()].filter(k => !old.has(k)));
      if(added.size) {
	scan(document.body, added);
      }
    }
  });

  // The popup asks how many distinct words are highlighted on this page.
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if(request.action === 'page-stats') {
      sendResponse({enabled, count: new Set(entries.map(e => e.word)).size});
    }
  });

  async function getWords() {
    return (await chrome.storage.local.get(['words'])).words ?? [];
  }

  async function addWord(word, definition) {
    const rest = (await getWords()).filter(i => LexiBridge.normalizeWord(i[0]) !== word);
    await chrome.storage.local.set({'words': [[word, definition], ...rest]});
  }

  // Returns a function that puts the word back where it was.
  async function removeWord(word) {
    const words = await getWords();
    const index = words.findIndex(i => LexiBridge.normalizeWord(i[0]) === word);
    if(index < 0) return async() => {};
    const row = words[index];
    await chrome.storage.local.set({'words': words.filter((_, i) => i !== index)});
    return async() => {
      const now = await getWords();
      if(now.some(i => LexiBridge.normalizeWord(i[0]) === word)) return;
      now.splice(Math.min(index, now.length), 0, row);
      await chrome.storage.local.set({'words': now});
    };
  }

  const speak = (word) => chrome.runtime.sendMessage({action: 'speak', data: {word}});
  const band = (word) => chrome.runtime.sendMessage({action: 'band', data: {word}});

  // The highlighted word under the pointer, if any.
  function entryAt(x, y) {
    const target = document.caretRangeFromPoint(x, y);
    if(!target) {
      return null;
    }
    // caretRangeFromPoint also answers for blank space next to a word.
    const inside = (r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    return entries.find(i => i.range.isPointInRange(target.startContainer, target.startOffset) &&
      [...i.range.getClientRects()].some(inside)) ?? null;
  }

  // Words inside links and buttons keep their click; their card opens on hover.
  const interactive = 'a[href], button, [role="button"], [role="link"]';
  const inInteractive = (entry) => !!entry.range.startContainer.parentElement?.closest(interactive);

  function showWordCard(entry) {
    const {word, range} = entry;
    return LexiBridgeUI.showCard({
      word,
      surface: range.toString(),
      definition: dict.get(word),
      lang: defLang,
      band: band(word),
      anchor: () => range.getBoundingClientRect(),
      state: 'known',
      onSpeak: () => speak(word),
      // Highlights are removed by the storage.onChanged listener, in every tab.
      onKnown: async() => {
	const undo = await removeWord(word);
	LexiBridgeUI.toast(t('card_removed', word), t('common_undo'), undo);
      },
    });
  }

  // Click a highlighted word: show its card.
  document.body.addEventListener("click", (e) => {
    if(!enabled || !window.getSelection().isCollapsed || e.target.closest?.('.lexibridge-ui')) {
      return;
    }
    const entry = entryAt(e.clientX, e.clientY);
    if(!entry || inInteractive(entry)) {
      return;
    }
    e.preventDefault();
    showWordCard(entry);
  });

  // Hover a highlighted word in a link: show its card after a pause, and
  // close it once the pointer has left both the word and the card.
  const HOVER_OPEN_MS = 500, HOVER_CLOSE_MS = 300;
  let hoverEntry = null, hoverCard = null, openTimer = null, closeTimer = null;

  function onPointer(e) {
    const overCard = !!e.target.closest?.('.lexibridge-ui');
    const entry = overCard || !e.target.closest?.(interactive) ? null : entryAt(e.clientX, e.clientY);
    const candidate = entry && inInteractive(entry) ? entry : null;

    if(hoverCard?.isConnected) {
      const stay = overCard || candidate === hoverEntry;
      if(stay) {
	clearTimeout(closeTimer);
	closeTimer = null;
      } else if(!closeTimer) {
	closeTimer = setTimeout(() => {
	  hoverCard?.hidePopover();
	  hoverCard = hoverEntry = closeTimer = null;
	}, HOVER_CLOSE_MS);
      }
      return;
    }
    if(candidate === hoverEntry) {
      return;
    }
    clearTimeout(openTimer);
    hoverEntry = candidate;
    if(candidate) {
      openTimer = setTimeout(() => {
	if(enabled && hoverEntry === candidate) hoverCard = showWordCard(candidate);
      }, HOVER_OPEN_MS);
    }
  }
  let pointerFrame = null;
  document.addEventListener("mousemove", (e) => {
    if(!enabled || pointerFrame) return;
    pointerFrame = requestAnimationFrame(() => {
      pointerFrame = null;
      onPointer(e);
    });
  }, {passive: true});

  // Select a word that is not in the list yet: offer to add it.
  document.addEventListener("mouseup", (e) => {
    if(!enabled || e.target.closest?.('.lexibridge-ui')) {
      return;
    }
    // Let the browser finish updating the selection first.
    setTimeout(() => {
      LexiBridgeUI.hidePill();
      const selection = window.getSelection();
      const text = selection.toString().trim();
      if(selection.isCollapsed || !LexiBridge.isWord(text) || LexiBridge.lookup(dict, LexiBridge.normalizeWord(text))) {
	return;
      }
      const node = selection.anchorNode;
      const parent = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      if(!parent || parent.closest('input, textarea, .lexibridge-ui') || parent.isContentEditable) {
	return;
      }
      const range = selection.getRangeAt(0).cloneRange();
      LexiBridgeUI.showPill(range.getBoundingClientRect(), () => addFromSelection(text, range));
    });
  });
  document.addEventListener("mousedown", (e) => {
    if(!e.target.closest?.('.lexibridge-ui')) LexiBridgeUI.hidePill();
  });
  window.addEventListener("scroll", () => LexiBridgeUI.hidePill(), {passive: true});

  async function addFromSelection(text, range) {
    // Base form and definition from the bundled word lists, if known.
    const {word, definition} = await chrome.runtime.sendMessage({action: 'lookup', data: {word: text}});
    const card = {
      word,
      surface: text,
      lang: defLang,
      band: band(word),
      anchor: () => range.getBoundingClientRect(),
      onSpeak: () => speak(word),
    };
    if(definition) {
      // One click: add it and show what it means, with a way back. The
      // selection goes so the new highlight shows.
      await addWord(word, definition);
      window.getSelection().removeAllRanges();
      LexiBridgeUI.showCard({...card, definition, state: 'added', onUndoAdd: () => removeWord(word)});
    } else {
      LexiBridgeUI.showCard({...card, definition: '', state: 'new', onSave: async(value) => {
	await addWord(word, value);
	window.getSelection().removeAllRanges();
      }});
    }
  }
})();
