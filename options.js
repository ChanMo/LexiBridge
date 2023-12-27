(() => {
  // const manifest = chrome.runtime.getManifest();
  // document.getElementById("version").textContent = 'v' + manifest.version;

  const totalSpan = document.getElementById("total-words");
  loadData();

  // Add a click event on buttons to open a specific modal
  const modal = document.getElementById("import-modal");
  const importBtn = document.getElementById("import-btn");
  const fileInput = document.getElementById("id-file");
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
    const page = parseInt(new URL(window.location.href).searchParams.get('page')??1);
    const limit = 100;
    let res = await chrome.storage.local.get(["words"])
    res = res.words ? res.words : []
    totalSpan.textContent = res.length;

    const pagination = document.getElementById("pagination");
    pagination.content.querySelector(".current-page").textContent = page;
    if(page > 1) {
      pagination.content.querySelector(".previous-page").href = `?page=${page-1}`;
    } else {
      pagination.content.querySelector(".previous-page").remove();
    }
    if(res.length > (page-1) * limit) {
      pagination.content.querySelector(".next-page").href = `?page=${page+1}`;
    } else {
      pagination.content.querySelector(".next-page").remove();
    }
    document.querySelector("table").parentNode.parentNode.appendChild(pagination.content);
    
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
  document.getElementById("add-btn").addEventListener("click", async() => {
    const key = document.querySelector("[name=key]");
    const value = document.querySelector("[name=value]");
    let words = await chrome.storage.local.get(["words"])
    words = words.words ? words.words : [];
    const res = await chrome.storage.local.set({"words": [[key.value,value.value], ...words ]});

    const tb = document.querySelector("table tbody");
    const t = document.getElementById("row");
    const td = t.content.querySelectorAll("td");
    td[0].textContent = key.value;
    td[1].textContent = value.value;

    const clone = document.importNode(t.content, true);
    clone.querySelector("md-text-button").addEventListener("click", async(e) => {
      e.target.closest("tr").remove();
      let words = await chrome.storage.local.get(['words']);
      words = words.words ? words.words : [];
      chrome.storage.local.set({"words": words.filter(j => j[0] !== key.value)});
    });
    tb.insertBefore(clone, document.getElementById("add-form").nextSibling);
    key.value = '';
    value.value = '';

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
})();
