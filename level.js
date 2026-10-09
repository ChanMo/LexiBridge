(async() => {
  const P = LexiBridgePacks;
  const {t, num, tNodes} = LexiBridgeI18n;
  const {el} = Page;
  const $ = (id) => document.getElementById(id);
  const container = $("levels");

  // What is stored: pack and level ids, either possibly missing.
  let current = await chrome.storage.local.get(['pack', 'level']);
  let {words = [], known = []} = await chrome.storage.local.get(['words', 'known']);
  // The pack whose levels are listed; picking one of them switches to it.
  let shown = P.getPack(current.pack);

  // Pack data, loaded when first shown.
  const loaded = new Map();
  function dataOf(pack) {
    if(!loaded.has(pack.id)) loaded.set(pack.id, P.loadPack(pack));
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
    const data = await dataOf(pack);
    if(pack !== shown) return; // another tab was picked meanwhile
    $("credit").textContent = pack.credit;
    $("credit").lang = pack.defLang;
    const mine = pack === P.getPack(current.pack);
    const at = mine ? P.progress(pack, data.levels, current.level, words) : null;
    const ready = at?.next && at.known >= at.total * P.READY;
    if(ready) {
      const pct = `${Math.floor(at.known / at.total * 100)}%`;
      $("ready").replaceChildren(...tNodes('level_ready', at.band, el('b', '', pct), el('b', 'marked', at.next.name)));
      $("ready").lang = pack.defLang;
    }
    $("ready").hidden = !ready;
    const template = $("level-row");
    container.replaceChildren(...pack.levels.map((level, index) => {
      const row = document.importNode(template.content, true).firstElementChild;
      const on = mine && level.id === current.level;
      row.querySelector(".text").lang = pack.defLang;
      row.querySelector(".name").textContent = level.name;
      row.querySelector(".desc").textContent = level.desc;
      row.querySelector(".count").textContent = t('level_count', num(data.levels[level.id].length));
      row.querySelectorAll(".bars i").forEach((bar, i) => bar.classList.toggle("on", i <= index));
      row.querySelector(".tag").hidden = !(ready && level === at.next);
      if(on && at) {
        const bar = row.querySelector(".progress");
        bar.hidden = false;
        bar.querySelector("i").style.width = `${at.known / at.total * 100}%`;
        bar.querySelector(".known").textContent = t('level_progress', at.band, num(at.known), num(at.total));
      }
      row.classList.toggle("is-current", on);
      row.setAttribute("aria-checked", on);
      row.addEventListener("click", () => choose(pack, level));
      return row;
    }));
  }

  // Writes the state; missing values are removed, as before the first choice.
  async function store(state) {
    const missing = Object.keys(state).filter(k => state[k] === undefined);
    await chrome.storage.local.set(Object.fromEntries(Object.entries(state).filter(([, v]) => v !== undefined)));
    if(missing.length) await chrome.storage.local.remove(missing);
  }

  // Moves the list to the level's, keeping the words the learner took out or added.
  async function choose(pack, level) {
    if(pack === P.getPack(current.pack) && level.id === current.level) return;
    const [from, to] = await Promise.all([dataOf(P.getPack(current.pack)), dataOf(pack)]);
    const previous = {...current, words, known};
    ({words, known} = P.switchWords(words, known, {dict: from.dict, list: from.levels[current.level] ?? []},
                                                  {dict: to.dict, list: to.levels[level.id]}));
    current = {pack: pack.id, level: level.id};
    await store({...current, words, known});
    render();
    Page.toast(t('level_switched', level.name, num(words.length)), t('common_undo'), async() => {
      current = {pack: previous.pack, level: previous.level};
      ({words, known} = previous);
      shown = P.getPack(current.pack);
      await store(previous);
      render();
    });
  }

  // Words taken out or added on a page while this one is open.
  chrome.storage.onChanged.addListener((changes, area) => {
    if(area !== 'local' || !changes.words) return;
    words = changes.words.newValue ?? [];
    render();
  });

  render();
})();
