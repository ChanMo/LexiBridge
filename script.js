(async() => {
  let {words = [], blocked = []} = await chrome.storage.local.get(['words', 'blocked']);
  if(blocked.includes(location.hostname)) {
    return;
  }
  let dict = LexiBridge.buildDictionary(words);
  words = null;

  const highlight = new Highlight();
  CSS.highlights.set('lexibridge', highlight);
  let entries = []; // [{word, range}]
  const seen = new WeakSet();
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

  // Words added or deleted here, in another tab or on the options page.
  chrome.storage.onChanged.addListener((changes, area) => {
    if(area !== 'local' || !changes.words) {
      return;
    }
    const old = dict;
    dict = LexiBridge.buildDictionary(changes.words.newValue ?? []);
    removeEntries(e => !dict.has(e.word));
    const added = new Set([...dict.keys()].filter(k => !old.has(k)));
    if(added.size) {
      scan(document.body, added);
    }
  });

  async function saveWord(word, definition) {
    const res = await chrome.storage.local.get(['words']);
    const rest = (res.words ?? []).filter(i => LexiBridge.normalizeWord(i[0]) !== word);
    await chrome.storage.local.set({'words': definition === null ? rest : [[word, definition], ...rest]});
  }

  function el(tag, text) {
    const e = document.createElement(tag);
    if(text) e.textContent = text;
    return e;
  }

  function showPopover(word, body, buttons) {
    const popover = el("div");
    popover.popover = "auto";
    popover.classList.add("lexibridge-popover", "lexibridge-ui");
    const title = el("h5", word);
    const speakBtn = el("span");
    speakBtn.innerHTML = '&#128264;';
    speakBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({action: 'speak', data: {word}});
    });
    title.appendChild(speakBtn);
    popover.append(title, ...body);
    const footer = el("div");
    for(const [label, onClick] of buttons) {
      const btn = el("button", label);
      btn.addEventListener("click", async() => {
	if(await onClick() !== false) popover.remove();
      });
      footer.appendChild(btn);
    }
    popover.appendChild(footer);
    popover.addEventListener("toggle", (e) => {
      if(e.newState === "closed") {
	popover.remove();
      }
    });
    document.body.appendChild(popover);
    popover.showPopover();
    return popover;
  }

  // Click a highlighted word: show its definition.
  document.body.addEventListener("click", (e) => {
    if(!window.getSelection().isCollapsed || e.target.closest?.('.lexibridge-ui')) {
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
    const word = entry.word;
    showPopover(word, [el("p", dict.get(word))], [
      ["关闭(ESC)", () => {}],
      // Highlights are removed by the storage.onChanged listener, in every tab.
      ["从词库删除", () => saveWord(word, null)],
    ]);
  });

  // Select a word that is not in the list yet: offer to add it.
  let addBtn = null;
  function hideAddButton() {
    addBtn?.remove();
    addBtn = null;
  }

  document.addEventListener("mouseup", (e) => {
    if(e.target.closest?.('.lexibridge-ui')) {
      return;
    }
    // Let the browser finish updating the selection first.
    setTimeout(() => {
      hideAddButton();
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
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      addBtn = el("button", "＋ 加入词库");
      addBtn.classList.add("lexibridge-add", "lexibridge-ui");
      addBtn.style.top = `${rect.bottom + 6}px`;
      addBtn.style.left = `${rect.left}px`;
      // Keep the selection while clicking the button.
      addBtn.addEventListener("mousedown", (ev) => ev.preventDefault());
      addBtn.addEventListener("click", () => {
	hideAddButton();
	showAddForm(text);
      });
      document.body.appendChild(addBtn);
    });
  });
  document.addEventListener("mousedown", (e) => {
    if(!e.target.closest?.('.lexibridge-ui')) hideAddButton();
  });
  window.addEventListener("scroll", hideAddButton, {passive: true});

  async function showAddForm(text) {
    // Base form and definition from the bundled word lists, if known.
    const {word, definition} = await chrome.runtime.sendMessage({action: 'lookup', data: {word: text}});
    const textarea = el("textarea");
    textarea.rows = 3;
    textarea.placeholder = "输入释义";
    textarea.value = definition;
    const hint = el("small", definition ? "释义来自内置词库，可修改" : "内置词库中没有这个词，请输入释义");
    const popover = showPopover(word, [textarea, hint], [
      ["加入词库", async() => {
	const value = textarea.value.trim();
	if(!value) {
	  textarea.focus();
	  return false;
	}
	await saveWord(word, value);
      }],
      ["取消", () => {}],
    ]);
    popover.classList.add("lexibridge-add-form");
    textarea.focus();
  }
})();
