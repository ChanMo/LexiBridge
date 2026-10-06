(async() => {
  const $ = (id) => document.getElementById(id);
  const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
  let domain = null;
  try {
    const url = new URL(tab.url);
    if(url.protocol === 'http:' || url.protocol === 'https:') domain = url.hostname;
  } catch {}

  let {blocked = [], words = [], level, highlightStyle = 'tint'} =
    await chrome.storage.local.get(['blocked', 'words', 'level', 'highlightStyle']);

  const levelName = LexiBridgeLevels.getLevel(level)?.name ?? '';
  $("level-name").textContent = levelName || '未选择';
  $("word-count").textContent = `${words.length} 个单词`;

  // Site switch
  const site = $("site"), toggle = $("site-toggle"), status = $("status");
  async function pageStats() {
    try {
      return await chrome.tabs.sendMessage(tab.id, {action: 'page-stats'});
    } catch {
      return null; // page opened before install/update, or not scriptable
    }
  }
  async function render() {
    const on = !blocked.includes(domain);
    toggle.checked = on;
    site.classList.toggle("is-on", on);
    if(!on) {
      status.textContent = '已在此网站停用';
      return;
    }
    const stats = await pageStats();
    status.textContent = stats ? `已启用 · 本页 ${stats.count} 个生词` : '已启用';
  }
  if(domain) {
    $("domain").textContent = domain;
    toggle.addEventListener("change", async() => {
      blocked = toggle.checked ? blocked.filter(d => d !== domain) : [...blocked, domain];
      await chrome.storage.local.set({blocked});
      // Give the page a moment to re-highlight before counting.
      setTimeout(render, 150);
    });
    render();
  } else {
    site.classList.add("is-unsupported");
    $("domain").textContent = '此页面不支持高亮';
    status.textContent = '仅在普通网页 (http/https) 上可用';
    toggle.disabled = true;
  }

  // Highlight style
  for(const radio of document.querySelectorAll('input[name=style]')) {
    radio.checked = radio.value === highlightStyle;
    radio.addEventListener("change", () => chrome.storage.local.set({highlightStyle: radio.value}));
  }

  // Links
  const open = (page) => {
    chrome.tabs.create({url: chrome.runtime.getURL(page)});
    window.close();
  };
  $("level-link").addEventListener("click", () => open('level.html'));
  $("words-link").addEventListener("click", () => open('options.html'));
})();
