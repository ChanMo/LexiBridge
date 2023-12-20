(() => {
  init();
  async function init() {
    let data = await chrome.storage.local.get(['blocked']);
    data = data.blocked ? data.blocked : [];
    const table = document.querySelector("table tbody");
    // https://developer.mozilla.org/zh-CN/docs/Web/HTML/Element/template
    data.map(row => {
      const tr = document.getElementById("row");
      const td = tr.content.querySelectorAll("td");
      td[0].textContent = row;
      const clone = document.importNode(tr.content, true);
      clone.querySelector(".button").addEventListener("click", async(e) => {
	e.target.closest("tr").remove();
	let domains = await chrome.storage.local.get(['blocked']);
	domains = domains.blocked ? domains.blocked : [];
	chrome.storage.local.set({"blocked": domains.filter(j => j !== row)});
      });            
      table.appendChild(clone);
    });
  }
})();