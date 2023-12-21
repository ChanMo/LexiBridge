(() => {
  loadData();
  const totalSpan = document.getElementById("total-words");
  
  async function loadData() {
    let res = await chrome.storage.local.get(["words"])
    res = res.words ? res.words : []
    totalSpan.textContent = res.length;
    const tb = document.querySelector("table tbody");
    res.map(i => {
      const t = document.getElementById("row");
      const td = t.content.querySelectorAll("td");
      td[0].textContent = i[0];
      td[1].textContent = i[1];

      const clone = document.importNode(t.content, true);
      clone.querySelector(".button").addEventListener("click", async(e) => {
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
    clone.querySelector(".button").addEventListener("click", async(e) => {
      e.target.closest("tr").remove();
      let words = await chrome.storage.local.get(['words']);
      words = words.words ? words.words : [];
      chrome.storage.local.set({"words": words.filter(j => j[0] !== key.value)});
    });      
    tb.insertBefore(clone, document.getElementById("add-form").nextSibling);
    key.value = '';
    value.value = '';
    
  });
  document.getElementById("import-btn").addEventListener("click", (e) => {
    e.target.classList.add("is-loading");
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
})();
