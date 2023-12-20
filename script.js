(async() => {
  const isBlocked = await chrome.runtime.sendMessage({
    action: 'is-blocked'
  });
  if(isBlocked) {
    return;
  }
  const words = await chrome.runtime.sendMessage({
    action: 'get-words',
  });
  if(words.length <= 0) {
    return;
  }
  let nodes = document.querySelectorAll("*")
  nodes = Array.from(nodes).filter(node => !node.children.length)
  const excludeNodes = ['META', 'STYLE', 'SCRIPT', 'HEAD', 'INPUT', 'TEXTAREA', 'PRE', 'CODE']
  nodes = nodes.filter(node => !excludeNodes.includes(node.tagName) && !node.closest("pre") && !node.closest("head"))

  const keys = words.map(i => i[0])
  nodes.map(node => {
    let content = node.textContent;
    // 使用正则表达式搜索词汇
    let res = []
    textList = content.split(' ')
    textList.map((text, index) => {
      const wordIndex = keys.indexOf(text.toLowerCase())
      if(wordIndex < 0) {
        res.push(text)
      } else {
        res.push(`<span class="lexibridge-word" title="${words[wordIndex][1]}">${text}</span>`)
      }
    })
    node.innerHTML = res.join(' ');
  });

})();

