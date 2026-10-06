(async() => {
  let {words = [], blocked = [], highlightStyle = 'tint'} =
    await chrome.storage.local.get(['words', 'blocked', 'highlightStyle']);
  let dict = LexiBridge.buildDictionary(words);
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
  }

  function removeEntries(shouldRemove) {
    entries = entries.filter(e => {
      if(shouldRemove(e)) {
	highlight.delete(e.range);
	return false;
      }
      return true;
    });
  }

  function setEnabled(on) {
    enabled = on;
    highlight.clear();
    entries = [];
    seen = new WeakSet();
    LexiBridgeUI.closeAll();
    if(on) scan(document.body);
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
	removeEntries(e => !e.range.startContainer.isConnected);
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
      applyStyle(changes.highlightStyle.newValue ?? 'tint');
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

  // Click a highlighted word: show its card.
  document.body.addEventListener("click", (e) => {
    if(!enabled || !window.getSelection().isCollapsed || e.target.closest?.('.lexibridge-ui')) {
      return;
    }
    const target = document.caretRangeFromPoint(e.clientX, e.clientY);
    if(!target) {
      return;
    }
    const entry = entries.find(i => i.range.isPointInRange(target.startContainer, target.startOffset));
    if(!entry) {
      return;
    }
    e.preventDefault();
    const {word, range} = entry;
    LexiBridgeUI.showCard({
      word,
      surface: range.toString(),
      definition: dict.get(word),
      anchor: () => range.getBoundingClientRect(),
      state: 'known',
      onSpeak: () => speak(word),
      // Highlights are removed by the storage.onChanged listener, in every tab.
      onKnown: async() => {
	const undo = await removeWord(word);
	LexiBridgeUI.toast(`已移出词库：${word}`, '撤销', undo);
      },
    });
  });

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
