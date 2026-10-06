(() => {
  // const manifest = chrome.runtime.getManifest();
  // document.getElementById("version").textContent = 'v' + manifest.version;


  const totalSpan = document.getElementById("total-words");
  loadData();

  // Add a click event on buttons to open a specific modal
  const modal = document.getElementById("import-modal");
  const importBtn = document.getElementById("import-btn");
  const fileInput = document.getElementById("id-file");
  const searchInput = document.getElementById("search-input");
  document.getElementById("open-modal").addEventListener("click", () => {
    modal.show();
  });
  document.getElementById("cancel-btn").addEventListener("click", () => {
    importBtn.disabled = true;
    fileInput.value = null;	
    modal.close();
  });
  fileInput.addEventListener("change", () => {
    importBtn.disabled = false;
  });
  
  function pageUrl(search, page) {
    const params = new URLSearchParams();
    if(search) params.set('search', search);
    params.set('page', page);
    return '?' + params;
  }

  async function loadData() {
    const params = new URL(window.location.href).searchParams;
    const page = Math.max(1, parseInt(params.get('page')) || 1);
    const search = (params.get('search') ?? '').trim();
    const limit = 100;
    let res = await chrome.storage.local.get(["words"])
    res = res.words ? res.words : []
    // search word or definition
    if(search) {
      const q = search.toLowerCase();
      res = res.filter(i => i[0].toLowerCase().includes(q) || String(i[1]).includes(search))
      searchInput.value = search;
    }
    totalSpan.textContent = res.length;

    const pagination = document.getElementById("pagination");
    pagination.content.querySelector(".current-page").textContent = page;
    if(page > 1) {
      pagination.content.querySelector(".previous-page").href = pageUrl(search, page-1);
    } else {
      pagination.content.querySelector(".previous-page").remove();
    }
    if(res.length > page * limit) {
      pagination.content.querySelector(".next-page").href = pageUrl(search, page+1);
    } else {
      pagination.content.querySelector(".next-page").remove();
    }
    document.querySelector("table").closest("main").appendChild(pagination.content);
    
    const tb = document.querySelector("table tbody");
    res.slice((page-1)*limit, page*limit).map(i => {
      const t = document.getElementById("row");
      const td = t.content.querySelectorAll("td");
      td[0].textContent = i[0];
      td[1].textContent = i[1];

      const clone = document.importNode(t.content, true);
      clone.querySelector("md-text-button").addEventListener("click", async(e) => {
	e.target.closest("tr").remove();
	let words = await chrome.storage.local.get(['words']);
	words = words.words ? words.words : [];
	chrome.storage.local.set({"words": words.filter(j => j[0] !== i[0])});
      });
      tb.appendChild(clone);
    });
  }
  const addModal = document.getElementById("add-modal");
  const keyInput = document.querySelector("[name=key]");
  const valueInput = document.querySelector("[name=value]");
  const addBtn = document.getElementById("add-btn");
  
  document.getElementById("open-add-modal").addEventListener("click", () => {
    addModal.show();
  });
  document.getElementById("cancel-add-btn").addEventListener("click", () => {
    keyInput.value = '';
    valueInput.value = '';
    addModal.close();
  });
  keyInput.addEventListener("input", (e) => {
    if(!valueInput.value || !keyInput.value) {
      addBtn.disabled = true;
    } else {
      addBtn.disabled = false;
    };
  });
  valueInput.addEventListener("input", (e) => {
    if(!valueInput.value || !keyInput.value) {
      addBtn.disabled = true;
    } else {
      addBtn.disabled = false;
    };
  });  
  addBtn.addEventListener("click", async() => {
    const key = LexiBridge.normalizeWord(keyInput.value);
    const value = valueInput.value.trim();
    if(!key || !value) {
      alert('Error');
      return;
    }
    let words = await chrome.storage.local.get(["words"])
    words = words.words ? words.words : [];
    // re-adding an existing word replaces its definition
    words = words.filter(i => LexiBridge.normalizeWord(i[0]) !== key);
    await chrome.storage.local.set({"words": [[key,value], ...words ]});
    keyInput.value = '';
    valueInput.value = '';
    addModal.close();
    window.location.reload();
  });
  // Valid rows of an imported file, keys normalized; null if not a word list.
  function parseWords(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return null;
    }
    if(!Array.isArray(data)) {
      return null;
    }
    const words = new Map();
    for(const i of data) {
      if(!Array.isArray(i) || typeof i[0] !== 'string') continue;
      const key = LexiBridge.normalizeWord(i[0]);
      if(key && !words.has(key)) words.set(key, String(i[1] ?? ''));
    }
    return [...words];
  }

  importBtn.addEventListener("click", async(e) => {
    e.preventDefault();
    const file = fileInput.files[0];
    if(!file) {
      return;
    }
    const imported = parseWords(await file.text());
    if(!imported) {
      alert('文件格式错误，应为 [["word", "释义"], ...] 格式的 JSON');
      return;
    }
    let words = imported;
    if(!document.getElementById("replace-checkbox").checked) {
      // merge: imported definitions win, existing order is kept
      const res = await chrome.storage.local.get(["words"]);
      const existing = res.words ? res.words : [];
      const keys = new Set(imported.map(i => i[0]));
      words = [...existing.filter(i => !keys.has(LexiBridge.normalizeWord(i[0]))), ...imported];
    }
    await chrome.storage.local.set({"words": words});
    alert(`已导入 ${imported.length} 个单词，词库共 ${words.length} 个单词`);
    window.location.reload();
  });
  document.getElementById("clear-btn").addEventListener("click", async(e) => {
    if(window.confirm('确定清空词库吗?')) {
      e.target.classList.add("is-loading");
      e.preventDefault();
      await chrome.storage.local.set({"words":[]})
      window.location.reload();
    }
  });
  document.getElementById("export-btn").addEventListener("click", async(e) => {
    const res = await chrome.storage.local.get(['words']);
    const blob = new Blob([JSON.stringify(res.words ?? [])], {type: 'application/json'});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = 'my_words.json'
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  const doSearch = () => {
    window.location.href = pageUrl(searchInput.value.trim(), 1);
  };
  document.getElementById("search-btn").addEventListener("click", doSearch);
  searchInput.addEventListener("keydown", (e) => {
    if(e.key === 'Enter') doSearch();
  });
})();
