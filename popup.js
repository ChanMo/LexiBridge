(async() => {
  async function getCurrentTab() {
    let queryOptions = { active: true, lastFocusedWindow: true };
    let [tab] = await chrome.tabs.query(queryOptions);
    return tab;
  }
  const tab = await getCurrentTab();
  const domain = new URL(tab.url).hostname;
  document.getElementById("domain").textContent = domain;

  let domains = await chrome.storage.local.get(["blocked"])
  domains = domains.blocked ? domains.blocked : []
  let isBlocked = domains.includes(domain)

  const button = document.getElementById("toggle");
  button.textContent = isBlocked ? 'OFF' : 'ON';

  const footer = document.getElementById("footer");
  if(isBlocked) {
    button.classList.add("is-blocked");
  }

  button.addEventListener("click", async() => {
    if(isBlocked) {
      button.textContent = 'ON';
      button.classList.remove("is-blocked");
      button.title = '在当前域名下关闭';
      domains = domains.filter(i => i !== domain);
    } else {
      button.textContent = 'OFF';
      button.classList.add("is-blocked");
      button.title = '在当前域名下启用';
      domains = [...domains, domain];
    }
    if(!footer.querySelector("#refresh-btn")) {
      const refreshBtn = document.createElement("button");
      refreshBtn.id = "refresh-btn";
      refreshBtn.textContent = "重新加载";
      refreshBtn.classList.add("is-text");
      refreshBtn.addEventListener("click", () => {
	chrome.tabs.reload();
      });
      footer.appendChild(refreshBtn);
    }
    await chrome.storage.local.set({"blocked": domains});
    isBlocked = !isBlocked;
  });

  document.getElementById("go-options").addEventListener("click", (e) => {
    e.preventDefault();
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options.html'));
    }
  });
})();
