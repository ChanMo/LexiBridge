(async() => {
  const L = LexiBridgeLevels;
  const welcome = new URL(window.location.href).searchParams.has('welcome');
  document.getElementById("welcome").hidden = !welcome;
  const container = document.getElementById("levels");
  const status = document.getElementById("status");

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
      card.querySelector(".learn").textContent = `将高亮：${level.learnLabel}`;
      card.querySelector(".count").textContent = `${level.words.length} 个单词`;
      card.classList.toggle("is-current", level.id === current);
      card.addEventListener("click", () => choose(level));
      return card;
    }));
  }

  async function choose(level) {
    const {words = []} = await chrome.storage.local.get(['words']);
    const currentLevel = levels.find(l => l.id === current);
    if(words.length && !isUntouched(words, currentLevel) &&
       !window.confirm(`将用「${level.name}」水平的 ${level.words.length} 个单词替换当前词库（${words.length} 个单词），包括你在网页上删除或加入的单词。建议先在单词库页面导出备份。确定吗？`)) {
      return;
    }
    await chrome.storage.local.set({words: level.words, level: level.id});
    current = level.id;
    render();
    status.textContent = `已切换到「${level.name}」，词库共 ${level.words.length} 个单词。打开任意英文网页即可看到高亮。`;
  }

  render();
})();
