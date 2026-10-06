(async() => {
  const $ = (id) => document.getElementById(id);
  const {el, icon, toast} = Page;
  const PAGE_SIZE = 50;
  const fmt = (n) => n.toLocaleString('en-US');
  const isMac = navigator.platform.startsWith('Mac');

  let {words = [], level} = await chrome.storage.local.get(['words', 'level']);
  const params = new URL(window.location.href).searchParams;
  let query = (params.get('search') ?? '').trim();
  let page = Math.max(1, parseInt(params.get('page')) || 1);
  $("search").value = query;

  const save = (list) => chrome.storage.local.set({words: list});
  const sameWord = (a, b) => LexiBridge.normalizeWord(a) === LexiBridge.normalizeWord(b);

  function showLevel() {
    const name = LexiBridgeLevels.getLevel(level)?.name;
    $("level-info").hidden = !name;
    $("level-name").textContent = name ?? '';
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
      box.append(el('b', '', '词库是空的'), el('div', '', '选择一个英语水平来生成词库，或在网页上选中生词加入。'));
      const actions = el('div', 'actions');
      const lv = el('a', 'btn primary', '选择英语水平');
      lv.href = 'level.html';
      lv.style.textDecoration = 'none';
      const add = el('button', 'btn secondary', '添加单词');
      add.type = 'button';
      add.addEventListener('click', () => openWordDialog());
      actions.append(lv, add);
      box.appendChild(actions);
    } else {
      box.append(el('b', '', `没有找到「${query}」`), el('div', '', '换个拼写试试，或者直接把它加入词库。'));
      if(LexiBridge.isWord(query)) {
        const actions = el('div', 'actions');
        const add = el('button', 'btn secondary', `添加「${query}」`);
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
    $("total").textContent = fmt(words.length);
    $("result-count").textContent = query ? ` · 找到 ${fmt(rows.length)} 个` : '';
    $("list").replaceChildren(...(rows.length
      ? rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(rowFor)
      : [emptyState()]));
    $("pager").hidden = pages <= 1;
    const first = (page - 1) * PAGE_SIZE;
    $("page-info").textContent = `${fmt(first + 1)}–${fmt(Math.min(first + PAGE_SIZE, rows.length))}，共 ${fmt(rows.length)}`;
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
    if(changes.level) {
      level = changes.level.newValue;
      showLevel();
    }
  });

  async function removeWord(word) {
    const index = words.findIndex(w => w[0] === word);
    if(index < 0) return;
    const row = words[index];
    await save(words.filter((_, i) => i !== index));
    toast(`已删除：${word}`, '撤销', async() => {
      const now = (await chrome.storage.local.get(['words'])).words ?? [];
      if(now.some(w => sameWord(w[0], word))) return;
      now.splice(Math.min(index, now.length), 0, row);
      await save(now);
    });
  }

  // Add / edit dialog

  const wordDialog = $("word-dialog"), wordForm = $("word-form");
  const wordInput = wordForm.elements.word, defInput = wordForm.elements.definition, hint = $("definition-hint");
  const HINT = '输入单词后，会自动从内置词库填入释义';
  let editing = null, defTouched = false, lookupTimer = null;
  $("save-shortcut").textContent = isMac ? '⌘ + Enter 保存' : 'Ctrl + Enter 保存';

  function openWordDialog(word = null, definition = '', prefill = '') {
    editing = word;
    defTouched = !!word;
    $("word-dialog-title").textContent = word ? '编辑单词' : '添加单词';
    wordInput.value = word ?? prefill;
    defInput.value = definition;
    hint.textContent = HINT;
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
    hint.replaceChildren(res.definition ? '已从内置词库填入释义，可修改' : '内置词库中没有这个词，请输入释义');
    if(res.definition && res.word !== LexiBridge.normalizeWord(text)) {
      const use = el('button', 'btn', `改用原形 ${res.word}`);
      use.type = 'button';
      use.addEventListener('click', () => { wordInput.value = res.word; use.remove(); });
      hint.append('。网页上的变形词会按原形识别，', use);
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
    toast(editing ? `已更新：${word}` : `已添加：${word}`);
  });

  $("add-open").addEventListener("click", () => openWordDialog());
  Page.menu($("more-open"), $("more-menu"));

  // Import

  const importDialog = $("import-dialog"), fileInput = $("file"), drop = $("drop");
  function resetImport() {
    fileInput.value = '';
    $("file-name").textContent = '选择 JSON 文件，或拖到这里';
    $("import-error").textContent = '';
    $("import-btn").disabled = true;
  }
  $("import-open").addEventListener("click", () => { resetImport(); importDialog.showModal(); });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    $("file-name").textContent = file ? file.name : '选择 JSON 文件，或拖到这里';
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

  // Valid rows of an imported file, keys normalized; null if not a word list.
  function parseWords(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return null;
    }
    if(!Array.isArray(data)) return null;
    const rows = new Map();
    for(const i of data) {
      if(!Array.isArray(i) || typeof i[0] !== 'string') continue;
      const key = LexiBridge.normalizeWord(i[0]);
      if(key && !rows.has(key)) rows.set(key, String(i[1] ?? ''));
    }
    return [...rows];
  }

  $("import-form").addEventListener("submit", async(e) => {
    if(e.submitter?.value !== 'import') return;
    e.preventDefault();
    const file = fileInput.files[0];
    if(!file) return;
    const imported = parseWords(await file.text());
    if(!imported) {
      $("import-error").textContent = '文件格式不对：需要 [["word", "释义"], ...] 格式的 JSON';
      return;
    }
    let next = imported;
    if(!$("replace").checked) {
      // Merge: imported definitions win, existing order is kept.
      const keys = new Set(imported.map(i => i[0]));
      next = [...words.filter(i => !keys.has(LexiBridge.normalizeWord(i[0]))), ...imported];
    }
    const before = words;
    await save(next);
    importDialog.close();
    toast(`已导入 ${imported.length} 个单词，词库共 ${next.length} 个`, '撤销', () => save(before));
  });

  // Export

  function exportWords() {
    const blob = new Blob([JSON.stringify(words)], {type: 'application/json'});
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
    $("clear-count").textContent = words.length;
    clearDialog.returnValue = '';
    clearDialog.showModal();
  });
  clearDialog.addEventListener("close", async() => {
    if(clearDialog.returnValue === 'export') {
      exportWords();
    } else if(clearDialog.returnValue === 'clear') {
      const before = words;
      await save([]);
      toast(`已清空 ${before.length} 个单词`, '撤销', () => save(before));
    }
  });

  showLevel();
  render();
})();
