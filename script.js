(async() => {
  let {words = [], blocked = []} = await chrome.storage.local.get(['words', 'blocked']);
  if(blocked.includes(location.hostname) || words.length <= 0) {
    return;
  }
  let dict = LexiBridge.buildDictionary(words);
  words = null;

  const highlight = new Highlight();
  CSS.highlights.set('lexibridge', highlight);
  let entries = []; // [{word, range}]
  const seen = new WeakSet();
  const excluded = 'meta, style, script, noscript, head, input, textarea, select, pre, code, kbd, svg, .lexibridge-popover';

  function acceptText(node) {
    const parent = node.parentElement;
    if(!parent || seen.has(node) || !node.data.trim()) {
      return false;
    }
    return !parent.closest(excluded) && !parent.isContentEditable;
  }

  function highlightText(node) {
    seen.add(node);
    for(const m of LexiBridge.findMatches(node.data, dict)) {
      const range = document.createRange();
      range.setStart(node, m.start);
      range.setEnd(node, m.end);
      entries.push({word: m.word, range});
      highlight.add(range);
    }
  }

  function scan(root) {
    if(root.nodeType === Node.TEXT_NODE) {
      if(acceptText(root)) highlightText(root);
      return;
    }
    if(root.nodeType !== Node.ELEMENT_NODE || root.closest(excluded)) {
      return;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => acceptText(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    });
    while(walker.nextNode()) {
      highlightText(walker.currentNode);
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

  scan(document.body);

  // Content added later (SPA navigation, infinite scroll, lazy loading).
  let pending = [];
  let timer = null;
  new MutationObserver((mutations) => {
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

  // Words deleted here, in another tab or on the options page.
  chrome.storage.onChanged.addListener((changes, area) => {
    if(area !== 'local' || !changes.words) {
      return;
    }
    dict = LexiBridge.buildDictionary(changes.words.newValue ?? []);
    removeEntries(e => !dict.has(e.word));
  });

  document.body.addEventListener("click", (e) => {
    if(!window.getSelection().isCollapsed) {
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
    showPopover(entry.word, dict.get(entry.word));
  });

  function showPopover(word, value) {
    const popover = document.createElement("div");
    popover.popover = "auto";
    popover.classList.add("lexibridge-popover");
    const title = document.createElement("h5");
    title.textContent = word;
    popover.appendChild(title);
    const speakBtn = document.createElement("span");
    speakBtn.innerHTML = '&#128264;';
    speakBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({
	action: 'speak',
	data: {word}
      });
    });
    title.appendChild(speakBtn);
    const p = document.createElement("p");
    p.textContent = value;
    popover.appendChild(p);
    const buttons = document.createElement("div");
    const btn = document.createElement("button");
    btn.textContent = "关闭(ESC)";
    btn.addEventListener("click", () => {
      popover.remove();
    });
    buttons.appendChild(btn);
    const delBtn = document.createElement("button");
    delBtn.textContent = "从词库删除";
    delBtn.addEventListener("click", async() => {
      // Highlights are removed by the storage.onChanged listener, in every tab.
      const res = await chrome.storage.local.get(['words']);
      const rest = (res.words ?? []).filter(i => LexiBridge.normalizeWord(i[0]) !== word);
      await chrome.storage.local.set({'words': rest});
      popover.remove();
    });
    buttons.appendChild(delBtn);
    popover.appendChild(buttons);
    popover.addEventListener("toggle", (e) => {
      if(e.newState === "closed") {
	popover.remove();
      }
    });
    document.body.appendChild(popover);
    popover.showPopover();
  }
})();
