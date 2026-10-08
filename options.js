(async() => {
  const $ = (id) => document.getElementById(id);
  const {el, icon, toast} = Page;
  const {t, num, tNodes} = LexiBridgeI18n;
  const P = LexiBridgePacks;
  const PAGE_SIZE = 50;
  const isMac = navigator.platform.startsWith('Mac');

  let {words = [], pack, level} = await chrome.storage.local.get(['words', 'pack', 'level']);
  const params = new URL(window.location.href).searchParams;
  let query = (params.get('search') ?? '').trim();
  let page = Math.max(1, parseInt(params.get('page')) || 1);
  $("search").value = query;

  const save = (list) => chrome.storage.local.set({words: list});
  const sameWord = (a, b) => LexiBridge.normalizeWord(a) === LexiBridge.normalizeWord(b);

  // Definitions are in the pack's language, which may differ from the UI's.
  function showLevel() {
    const name = P.getLevel(pack, level)?.name;
    const link = el('a', '', name ?? '');
    link.href = 'level.html';
    link.lang = P.getPack(pack).defLang;
    $("level-info").replaceChildren(...tNodes('words_levelInfo', link));
    $("level-info").hidden = !name;
    $("list").lang = defInput.lang = P.getPack(pack).defLang;
  }

  // List

  function filtered() {
    if(!query) return words;
    const q = query.toLowerCase();
    return words.filter(([w, d]) => w.toLowerCase().includes(q) || String(d).toLowerCase().includes(q));
  }

  function syncUrl() {
    const p = new URLSearchParams();
    if(query) p.set('search', query);
    if(page > 1) p.set('page', page);
    history.replaceState(null, '', p.size ? `?${p}` : window.location.pathname);
  }

  function rowFor([word, definition]) {
    const row = document.importNode($("row").content, true).firstElementChild;
    row.querySelector(".word").append(Page.highlighted(word, query));
    const {phonetic} = LexiBridge.parseDefinition(definition);
    const ph = row.querySelector(".phonetic");
    if(phonetic) ph.textContent = `/${phonetic}/`; else ph.remove();
    const def = Page.definition(definition, query);
    def.title = def.textContent;
    row.querySelector(".def-slot").replaceWith(def);
    row.querySelector(".edit").addEventListener("click", () => openWordDialog(word, definition));
    row.querySelector(".remove").addEventListener("click", () => removeWord(word));
    return row;
  }

  function emptyState() {
    const box = el('li', 'empty');
    if(!words.length) {
      box.append(el('b', '', t('words_emptyTitle')), el('div', '', t('words_emptyHint')));
      const actions = el('div', 'actions');
      const lv = el('a', 'btn primary', t('words_chooseLevel'));
      lv.href = 'level.html';
      lv.style.textDecoration = 'none';
      const add = el('button', 'btn secondary', t('words_add'));
      add.type = 'button';
      add.addEventListener('click', () => openWordDialog());
      actions.append(lv, add);
      box.appendChild(actions);
    } else {
      box.append(el('b', '', t('words_notFoundTitle', query)), el('div', '', t('words_notFoundHint')));
      if(LexiBridge.isWord(query)) {
        const actions = el('div', 'actions');
        const add = el('button', 'btn secondary', t('words_addQuery', query));
        add.type = 'button';
        add.prepend(icon('add'));
        add.addEventListener('click', () => openWordDialog(null, '', query));
        actions.appendChild(add);
        box.appendChild(actions);
      }
    }
    return box;
  }

  function render() {
    const rows = filtered();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    page = Math.min(page, pages);
    $("total").textContent = t('common_wordCount', num(words.length));
    $("result-count").textContent = query ? t('words_found', num(rows.length)) : '';
    $("list").replaceChildren(...(rows.length
      ? rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(rowFor)
      : [emptyState()]));
    $("pager").hidden = pages <= 1;
    const first = (page - 1) * PAGE_SIZE;
    $("page-info").textContent = t('words_pageInfo', num(first + 1), num(Math.min(first + PAGE_SIZE, rows.length)), num(rows.length));
    $("prev").disabled = page <= 1;
    $("next").disabled = page >= pages;
    $("clear-open").disabled = !words.length;
    $("export-btn").disabled = !words.length;
    syncUrl();
  }

  let searchTimer = null;
  $("search").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      query = $("search").value.trim();
      page = 1;
      render();
    }, 150);
  });
  // "/" jumps to search, like most list UIs.
  document.addEventListener("keydown", (e) => {
    if(e.key === '/' && !e.target.closest('input, textarea, dialog')) {
      e.preventDefault();
      $("search").focus();
    }
  });
  const turn = (delta) => {
    page += delta;
    render();
    window.scrollTo({top: 0});
  };
  $("prev").addEventListener("click", () => turn(-1));
  $("next").addEventListener("click", () => turn(1));

  // Changes from pages, the popup or other tabs.
  chrome.storage.onChanged.addListener((changes, area) => {
    if(area !== 'local') return;
    if(changes.words) {
      words = changes.words.newValue ?? [];
      render();
    }
    if(changes.level || changes.pack) {
      if(changes.level) level = changes.level.newValue;
      if(changes.pack) pack = changes.pack.newValue;
      showLevel();
    }
  });

  async function removeWord(word) {
    const index = words.findIndex(w => w[0] === word);
    if(index < 0) return;
    const row = words[index];
    await save(words.filter((_, i) => i !== index));
    toast(t('words_deleted', word), t('common_undo'), async() => {
      const now = (await chrome.storage.local.get(['words'])).words ?? [];
      if(now.some(w => sameWord(w[0], word))) return;
      now.splice(Math.min(index, now.length), 0, row);
      await save(now);
    });
  }

  // Add / edit dialog

  const wordDialog = $("word-dialog"), wordForm = $("word-form");
  const wordInput = wordForm.elements.word, defInput = wordForm.elements.definition, hint = $("definition-hint");
  let editing = null, defTouched = false, lookupTimer = null;
  $("save-shortcut").textContent = t(isMac ? 'common_saveShortcutMac' : 'common_saveShortcut');

  function openWordDialog(word = null, definition = '', prefill = '') {
    editing = word;
    defTouched = !!word;
    $("word-dialog-title").textContent = t(word ? 'words_editTitle' : 'words_add');
    wordInput.value = word ?? prefill;
    defInput.value = definition;
    hint.textContent = t('words_definitionHint');
    wordDialog.showModal();
    (word ? defInput : wordInput).focus();
    if(prefill) lookup();
  }

  // Fill the definition from the bundled lists until the user types their own.
  async function lookup() {
    const text = wordInput.value.trim();
    if(defTouched || !LexiBridge.isWord(text)) return;
    const res = await chrome.runtime.sendMessage({action: 'lookup', data: {word: text}});
    if(defTouched || wordInput.value.trim() !== text) return;
    defInput.value = res.definition;
    if(!res.definition) {
      hint.textContent = t('common_notInDictionary');
    } else if(res.word !== LexiBridge.normalizeWord(text)) {
      const use = el('button', 'btn', t('words_useBase', res.word));
      use.type = 'button';
      use.addEventListener('click', () => { wordInput.value = res.word; use.remove(); });
      hint.replaceChildren(...tNodes('words_filledBase', use));
    } else {
      hint.textContent = t('words_filled');
    }
  }
  wordInput.addEventListener("input", () => {
    clearTimeout(lookupTimer);
    lookupTimer = setTimeout(lookup, 250);
  });
  defInput.addEventListener("input", () => { defTouched = true; });
  defInput.addEventListener("keydown", (e) => {
    if(e.key === 'Enter' && (e.metaKey || e.ctrlKey)) wordForm.requestSubmit(wordForm.querySelector('[value=save]'));
  });

  wordForm.addEventListener("submit", async(e) => {
    if(e.submitter?.value !== 'save') return;
    e.preventDefault();
    const word = LexiBridge.normalizeWord(wordInput.value);
    const definition = defInput.value.trim();
    if(!word || !definition) return;
    // Editing keeps the word where it was; a new word goes first.
    const at = editing ? Math.max(0, words.findIndex(w => w[0] === editing)) : 0;
    const rest = words.filter(w => w[0] !== editing && !sameWord(w[0], word));
    rest.splice(Math.min(at, rest.length), 0, [word, definition]);
    await save(rest);
    wordDialog.close();
    toast(t(editing ? 'words_updated' : 'words_added', word));
  });

  $("add-open").addEventListener("click", () => openWordDialog());
  Page.menu($("more-open"), $("more-menu"));

  // Import

  const importDialog = $("import-dialog"), fileInput = $("file"), drop = $("drop");
  function resetImport() {
    fileInput.value = '';
    $("file-name").textContent = t('words_importDrop');
    $("import-error").textContent = '';
    $("import-btn").disabled = true;
  }
  $("import-open").addEventListener("click", () => { resetImport(); importDialog.showModal(); });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    $("file-name").textContent = file ? file.name : t('words_importDrop');
    $("import-error").textContent = '';
    $("import-btn").disabled = !file;
  });
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("is-over");
    fileInput.files = e.dataTransfer.files;
    fileInput.dispatchEvent(new Event("change"));
  });

  // An imported file: an export ({format: "lexibridge", pack, words}) or a plain
  // [["word", "definition"], ...] list. Returns {pack, rows} with keys normalized,
  // pack null for a plain list; null if the file is neither.
  function parseFile(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return null;
    }
    const list = Array.isArray(data) ? data : data?.format === 'lexibridge' && Array.isArray(data.words) ? data.words : null;
    if(!list) return null;
    const rows = new Map();
    for(const i of list) {
      if(!Array.isArray(i) || typeof i[0] !== 'string') continue;
      const key = LexiBridge.normalizeWord(i[0]);
      if(key && !rows.has(key)) rows.set(key, String(i[1] ?? ''));
    }
    return {pack: Array.isArray(data) ? null : data.pack ?? null, rows: [...rows]};
  }
  const packLabel = (id) => P.PACKS.find(p => p.id === id)?.label ?? id;

  $("import-form").addEventListener("submit", async(e) => {
    if(e.submitter?.value !== 'import') return;
    e.preventDefault();
    const file = fileInput.files[0];
    if(!file) return;
    const parsed = parseFile(await file.text());
    if(!parsed) {
      $("import-error").textContent = t('words_importError');
      return;
    }
    const current = P.getPack(pack).id;
    if(parsed.pack && parsed.pack !== current &&
       !confirm(t('words_importOtherPack', packLabel(parsed.pack), packLabel(current)))) {
      return;
    }
    const imported = parsed.rows;
    let next = imported;
    if(!$("replace").checked) {
      // Merge: imported definitions win, existing order is kept.
      const keys = new Set(imported.map(i => i[0]));
      next = [...words.filter(i => !keys.has(LexiBridge.normalizeWord(i[0]))), ...imported];
    }
    const before = words;
    await save(next);
    importDialog.close();
    toast(t('words_imported', num(imported.length), num(next.length)), t('common_undo'), () => save(before));
  });

  // Export

  function exportWords() {
    const data = {format: 'lexibridge', version: 2, pack: P.getPack(pack).id, level: level ?? null,
      exportedAt: new Date().toISOString(), words};
    const blob = new Blob([JSON.stringify(data)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lexibridge-words-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  $("export-btn").addEventListener("click", exportWords);

  // Clear

  const clearDialog = $("clear-dialog");
  $("clear-open").addEventListener("click", () => {
    $("clear-text").replaceChildren(...tNodes('words_clearText', el('b', '', num(words.length))));
    clearDialog.returnValue = '';
    clearDialog.showModal();
  });
  clearDialog.addEventListener("close", async() => {
    if(clearDialog.returnValue === 'export') {
      exportWords();
    } else if(clearDialog.returnValue === 'clear') {
      const before = words;
      await save([]);
      toast(t('words_cleared', num(before.length)), t('common_undo'), () => save(before));
    }
  });

  showLevel();
  render();
})();
