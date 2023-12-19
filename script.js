(async() => {
  // 获取词汇列表
  const url = chrome.runtime.getURL("en_zh.json");
  const dict = await fetch(url)
  const words = await dict.json()

  let nodes = document.querySelectorAll("*")
  nodes = Array.from(nodes).filter(node => !node.children.length)
  const excludeNodes = ['META', 'STYLE', 'SCRIPT', 'HEAD', 'INPUT', 'TEXTAREA']
  nodes = nodes.filter(node => !excludeNodes.includes(node.tagName))

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
        res.push(`<span class="lexibridge-word" title="${words[wordIndex][2]}">${text}</span>`)
      }
    })
    node.innerHTML = res.join(' ');
  });

})();

