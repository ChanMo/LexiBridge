(async() => {
  const P = LexiBridgePacks;
  const {t, num, tNodes} = LexiBridgeI18n;
  const {el} = Page;
  const $ = (id) => document.getElementById(id);
  const container = $("levels");
  const dialog = $("confirm-dialog");

  // What is stored: pack and level ids, either possibly missing.
  let current = await chrome.storage.local.get(['pack', 'level']);
  // The pack whose levels are listed; picking one of them switches to it.
  let shown = P.getPack(current.pack);

  // Levels of a pack with their word lists, loaded when first shown.
  const loaded = new Map();
  function levelsOf(pack) {
    if(!loaded.has(pack.id)) {
      loaded.set(pack.id, P.loadPack(pack).then(data =>
        pack.levels.map(level => ({...level, words: P.levelWords(data, level.id)}))));
    }
    return loaded.get(pack.id);
  }

  if(new URL(window.location.href).searchParams.has('welcome')) {
    const name = P.getLevel(current.pack, current.level)?.name;
    if(name) {
      const b = el('b', 'marked', name);
      b.lang = shown.defLang;
      $("welcome").replaceChildren(...tNodes('level_welcome', b));
      $("welcome").hidden = false;
    }
  }

  // True when the stored list is exactly what a level generated, i.e. the
  // learner has not deleted or added any word since.
  function isUntouched(words, level) {
    return !!level && words.length === level.words.length && words.every((w, i) => w[0] === level.words[i][0]);
  }

  function renderTabs() {
    $("packs").hidden = P.PACKS.length < 2;
    $("pack-tabs").replaceChildren(...P.PACKS.map(pack => {
      const tab = el('button', '', pack.label);
      tab.type = 'button';
      tab.role = 'radio';
      tab.lang = pack.defLang;
      tab.setAttribute('aria-checked', pack === shown);
      tab.addEventListener('click', () => { shown = pack; render(); });
      return tab;
    }));
  }

  async function render() {
    renderTabs();
    const pack = shown;
    const levels = await levelsOf(pack);
    if(pack !== shown) return; // another tab was picked meanwhile
    const template = $("level-row");
    container.replaceChildren(...levels.map((level, index) => {
      const row = document.importNode(template.content, true).firstElementChild;
      const on = pack === P.getPack(current.pack) && level.id === current.level;
      row.querySelector(".text").lang = pack.defLang;
      row.querySelector(".name").textContent = level.name;
      row.querySelector(".desc").textContent = level.desc;
      row.querySelector(".count").textContent = t('level_count', num(level.words.length));
      row.querySelectorAll(".bars i").forEach((bar, i) => bar.classList.toggle("on", i <= index));
      row.classList.toggle("is-current", on);
      row.setAttribute("aria-checked", on);
      row.addEventListener("click", () => choose(pack, level));
      return row;
    }));
  }

  function confirmReplace(pack, level, count) {
    const otherPack = pack !== P.getPack(current.pack) ? t('level_confirmPack', pack.label) : '';
    $("confirm-text").textContent =
      t('level_confirmText', level.name, num(level.words.length), num(count)) + otherPack;
    dialog.returnValue = '';
    dialog.showModal();
    return new Promise(resolve => dialog.addEventListener("close", () => resolve(dialog.returnValue === 'ok'), {once: true}));
  }

  // Writes the state; missing values are removed, as before the first choice.
  async function store(state) {
    const missing = Object.keys(state).filter(k => state[k] === undefined);
    await chrome.storage.local.set(Object.fromEntries(Object.entries(state).filter(([, v]) => v !== undefined)));
    if(missing.length) await chrome.storage.local.remove(missing);
  }

  async function choose(pack, level) {
    if(pack === P.getPack(current.pack) && level.id === current.level) return;
    const {words = []} = await chrome.storage.local.get(['words']);
    const currentLevel = (await levelsOf(P.getPack(current.pack))).find(l => l.id === current.level);
    if(words.length && !isUntouched(words, currentLevel) && !await confirmReplace(pack, level, words.length)) {
      return;
    }
    const previous = {...current, words};
    current = {pack: pack.id, level: level.id};
    await store({...current, words: level.words});
    render();
    Page.toast(t('level_switched', level.name, num(level.words.length)), t('common_undo'), async() => {
      current = {pack: previous.pack, level: previous.level};
      shown = P.getPack(current.pack);
      await store(previous);
      render();
    });
  }

  render();
})();
