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
  
  async function loadData() {
    const params = new URL(window.location.href).searchParams;
    const page = parseInt(params.get('page')??1);
    const search = params.get('search');
    const limit = 100;
    let res = await chrome.storage.local.get(["words"])
    res = res.words ? res.words : []
    // search
    if(search) {
      res = res.filter(i => i[0].includes(search))
      searchInput.value = search;
    }
    totalSpan.textContent = res.length;

    const pagination = document.getElementById("pagination");
    pagination.content.querySelector(".current-page").textContent = page;
    if(page > 1) {
      pagination.content.querySelector(".previous-page").href = `?search=${search}&page=${page-1}`;
    } else {
      pagination.content.querySelector(".previous-page").remove();
    }
    if(res.length > page * limit) {
      pagination.content.querySelector(".next-page").href = `?search=${search}&page=${page+1}`;
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
    const key = keyInput.value;
    const value = valueInput.value;
    if(!key || !value) {
      alert('Error');
      return;
    }
    let words = await chrome.storage.local.get(["words"])
    words = words.words ? words.words : [];
    const res = await chrome.storage.local.set({"words": [[key,value], ...words ]});

    // const tb = document.querySelector("table tbody");
    // const t = document.getElementById("row");
    // const td = t.content.querySelectorAll("td");
    // td[0].textContent = key.value;
    // td[1].textContent = value.value;

    // const clone = document.importNode(t.content, true);
    // clone.querySelector("md-text-button").addEventListener("click", async(e) => {
    //   e.target.closest("tr").remove();
    //   let words = await chrome.storage.local.get(['words']);
    //   words = words.words ? words.words : [];
    //   chrome.storage.local.set({"words": words.filter(j => j[0] !== key.value)});
    // });
    // //tb.insertBefore(clone, document.getElementById("add-form").nextSibling);
    // tb.appendChild(clone);
    keyInput.value = '';
    valueInput.value = '';
    addModal.close();
    window.location.reload();
  });
  importBtn.addEventListener("click", (e) => {
    //e.target.classList.add("is-loading");
    e.preventDefault();
    const files = document.querySelector("[name=source]").files;
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = async(e) => {
	const data = JSON.parse(e.target.result);
	await chrome.storage.local.set({"words":data})
	window.location.reload();
      }
      reader.readAsText(file);
    }
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
    const resStr = JSON.stringify(res.words);
    const a = document.createElement("a");
    a.href = `data:text/json;charset=utf-8,${resStr}`;	//
    a.download = 'my_words.json'
    a.click();
  });

  document.getElementById("search-btn").addEventListener("click", async(e) => {
    const value = searchInput.value;
    window.location.href = `?search=${value}`;
  });
})();
