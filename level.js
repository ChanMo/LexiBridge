(async() => {
  const P = LexiBridgePacks;
  const welcome = new URL(window.location.href).searchParams.has('welcome');
  document.getElementById("welcome").hidden = !welcome;
  const container = document.getElementById("levels");
  const dialog = document.getElementById("confirm-dialog");

  const stored = await chrome.storage.local.get(['pack', 'level']);
  const pack = P.getPack(stored.pack);
  const data = await P.loadPack(pack);
  const levels = pack.levels.map(level => ({...level, words: P.levelWords(data, level.id)}));
  let current = stored.level;

  // True when the stored list is exactly what a level generated, i.e. the
  // learner has not deleted or added any word since.
  function isUntouched(words, level) {
    return !!level && words.length === level.words.length && words.every((w, i) => w[0] === level.words[i][0]);
  }

  function render() {
    const t = document.getElementById("level-row");
    container.replaceChildren(...levels.map((level, index) => {
      const row = document.importNode(t.content, true).firstElementChild;
      const on = level.id === current;
      row.querySelector(".name").textContent = level.name;
      row.querySelector(".desc").textContent = level.desc;
      row.querySelector(".count").textContent = `${level.words.length.toLocaleString('en-US')} 词`;
      row.querySelectorAll(".bars i").forEach((bar, i) => bar.classList.toggle("on", i <= index));
      row.classList.toggle("is-current", on);
      row.setAttribute("aria-checked", on);
      row.addEventListener("click", () => choose(level));
      return row;
    }));
  }

  function confirmReplace(level, count) {
    document.getElementById("confirm-text").textContent =
      `将用「${level.name}」的 ${level.words.length} 个单词替换当前词库（${count} 个单词），包括你在网页上移出或加入的单词。`;
    dialog.returnValue = '';
    dialog.showModal();
    return new Promise(resolve => dialog.addEventListener("close", () => resolve(dialog.returnValue === 'ok'), {once: true}));
  }

  async function choose(level) {
    if(level.id === current) return;
    const {words = []} = await chrome.storage.local.get(['words']);
    const previous = {words, level: current};
    if(words.length && !isUntouched(words, levels.find(l => l.id === current)) &&
       !await confirmReplace(level, words.length)) {
      return;
    }
    await chrome.storage.local.set({words: level.words, level: level.id});
    current = level.id;
    render();
    Page.toast(`已切换到「${level.name}」，词库共 ${level.words.length} 个单词`, '撤销', async() => {
      await chrome.storage.local.set({words: previous.words});
      if(previous.level) await chrome.storage.local.set({level: previous.level});
      else await chrome.storage.local.remove('level');
      current = previous.level;
      render();
    });
  }

  render();
})();
