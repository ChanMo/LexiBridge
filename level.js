(async() => {
  const L = LexiBridgeLevels;
  const welcome = new URL(window.location.href).searchParams.has('welcome');
  document.getElementById("welcome").hidden = !welcome;
  const container = document.getElementById("levels");
  const dialog = document.getElementById("confirm-dialog");

  const lists = await L.loadLists([...new Set(L.LEVELS.flatMap(L.listsFor))]);
  const levels = L.LEVELS.map(level => ({...level, words: L.levelWords(level, lists)}));
  let current = (await chrome.storage.local.get(['level'])).level;

  // True when the stored list is exactly what a level generated, i.e. the
  // learner has not deleted or added any word since.
  function isUntouched(words, level) {
    return !!level && words.length === level.words.length && words.every((w, i) => w[0] === level.words[i][0]);
  }

  function render() {
    const t = document.getElementById("level-card");
    container.replaceChildren(...levels.map(level => {
      const card = document.importNode(t.content, true).firstElementChild;
      card.querySelector(".name").textContent = level.name;
      card.querySelector(".known").textContent = `已掌握：${level.knownLabel}`;
      card.querySelector(".learn").textContent = `将标出：${level.learnLabel}`;
      card.querySelector(".count").textContent = `${level.words.length} 个单词`;
      card.classList.toggle("is-current", level.id === current);
      card.setAttribute("aria-pressed", level.id === current);
      card.addEventListener("click", () => choose(level));
      return card;
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
