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

  const R = LexiBridgeReview;
  let {blocked = [], words = [], pack, level, highlightStyle = 'underline', [R.KEY]: review = {}, ...rest} =
    await chrome.storage.local.get(['blocked', 'words', 'pack', 'level', 'highlightStyle', R.KEY, R.KNOWN_KEY]);
  let knownCount = rest[R.KNOWN_KEY];

  // Store page of this copy (review.js): the rate link, always there, and the
  // review invitation at the top, shown once and then never again.
  const storeUrl = R.storeUrl(chrome.runtime.id);
  $("rate-link").href = storeUrl;
  if(!review.installedAt) {
    // Normally set by background.js on install or update.
    review = {...review, installedAt: Date.now()};
    await chrome.storage.local.set({[R.KEY]: review});
  }
  // First run after this version, if background.js has not seeded yet.
  if(!Object.hasOwn(rest, R.KNOWN_KEY)) {
    const packOf = LexiBridgePacks.getPack(pack);
    const levels = await LexiBridgePacks.loadLevels(packOf);
    knownCount = R.seedKnownCount(levels[level] ?? [], words);
    await chrome.storage.local.set({[R.KNOWN_KEY]: knownCount});
  }
  const storeBuild = R.isStoreBuild(chrome.runtime.getManifest());
  if(R.shouldShow(review, knownCount, Date.now(), storeBuild)) {
    review = {...review, shownAt: Date.now()};
    await chrome.storage.local.set({[R.KEY]: review});
    const card = $("review");
    $("review-body").textContent = t('review_body', num(knownCount));
    card.addEventListener("click", async(e) => {
      const choice = e.target.closest('button[data-choice]')?.dataset.choice;
      if(!choice) return;
      await chrome.storage.local.set({[R.KEY]: {...review, done: true}});
      card.hidden = true;
      if(choice === 'rate') {
        chrome.tabs.create({url: storeUrl});
        window.close();
      }
    });
    card.hidden = false;
  }

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
