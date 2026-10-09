(async() => {
  const $ = (id) => document.getElementById(id);
  const {t, num} = LexiBridgeI18n;
  LexiBridgeI18n.localize();
  const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
  let domain = null;
  try {
    const url = new URL(tab.url);
    if(url.protocol === 'http:' || url.protocol === 'https:') domain = url.hostname;
  } catch {}

  let {blocked = [], words = [], pack, level, highlightStyle = 'underline'} =
    await chrome.storage.local.get(['blocked', 'words', 'pack', 'level', 'highlightStyle']);

  const levelName = LexiBridgePacks.getLevel(pack, level)?.name ?? '';
  $("level-name").textContent = levelName || t('popup_noLevel');
  $("word-count").textContent = t('common_wordCount', num(words.length));

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
      status.textContent = t('popup_siteOff');
      return;
    }
    const stats = await pageStats();
    status.textContent = stats ? t('popup_siteOnCount', num(stats.count)) : t('popup_siteOn');
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
    $("domain").textContent = t('popup_unsupported');
    status.textContent = t('popup_unsupportedHint');
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

  // Progress through the band of the level: words taken out on pages.
  const packOf = LexiBridgePacks.getPack(pack);
  const at = level && LexiBridgePacks.progress(packOf, await LexiBridgePacks.loadLevels(packOf), level, words);
  if(at?.total) {
    const ready = at.next && at.known >= at.total * LexiBridgePacks.READY;
    $("progress-band").textContent = ready ? t('popup_ready') : at.band;
    $("progress-band").lang = ready ? '' : packOf.defLang;
    $("progress-count").textContent = `${num(at.known)} / ${num(at.total)}`;
    $("progress").querySelector("i").style.width = `${at.known / at.total * 100}%`;
    $("progress").classList.toggle("is-ready", !!ready);
    $("progress").hidden = false;
  }
  $("words-link").addEventListener("click", () => open('options.html'));
})();
