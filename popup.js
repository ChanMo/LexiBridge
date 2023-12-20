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
  if(isBlocked) {
    button.classList.add("is-blocked");
  }

  button.addEventListener("click", async() => {
    if(isBlocked) {
      button.textContent = 'ON';
      button.classList.remove("is-blocked");
      domains = domains.filter(i => i !== domain);
    } else {
      button.textContent = 'OFF';
      button.classList.add("is-blocked");
      domains = [...domains, domain];
    }
    await chrome.storage.local.set({"blocked": domains});
    isBlocked = !isBlocked;
  });
})();
