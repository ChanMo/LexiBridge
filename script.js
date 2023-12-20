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
  let nodes = [];
  const excludeNodes = ['META', 'STYLE', 'SCRIPT', 'HEAD', 'INPUT', 'TEXTAREA', 'PRE', 'CODE', 'KBD']
  function setChildren(node) {
    for (const child of node.childNodes) {
      if(child.nodeType === Node.ELEMENT_NODE && !excludeNodes.includes(child.nodeName)) {
	setChildren(child);
      } else if (child.nodeType === Node.TEXT_NODE && child.data !== "\n") {
	nodes.push(child);
      }
    }
  }
  setChildren(document.body);

  const keys = words.map(i => i[0])
  var highlight = new Highlight();
  var ranges = [];
  nodes.map(node => {
    let content = node.textContent.toLowerCase();
    keys.map((text, index) => {
      const matches = content.match(new RegExp(text, "i"));
      if(matches) {
	for(const match of matches) {
	  const range = document.createRange();
	  ranges.push({'word': text, 'range': range, 'value': words[index][1]});
	  const startOffset = content.indexOf(text);
	  range.setStart(node, startOffset);
	  range.setEnd(node, startOffset + text.length);
	  highlight.add(range);
	}
      }
    });
  });

  // apply highlight css
  CSS.highlights.set('lexibridge', highlight);

  document.body.addEventListener("click", (e) => {
    const target = document.caretRangeFromPoint(e.clientX, e.clientY);
    let has_range = false;
    for(const [range] of highlight.entries()) {
      if(range.isPointInRange(target.startContainer, target.startOffset)) {
	const rect = range.getBoundingClientRect();
	has_range = true;
	const value = ranges.find(i => i.range === range)

	// create popover
	const popover = document.createElement("div");
	popover.popover = "auto";
	popover.classList.add("lexibridge-popover");
	const title = document.createElement("h5");
	title.textContent = value.word;
	popover.appendChild(title);
	const p = document.createElement("p");
	p.textContent = value.value;
	popover.appendChild(p);
	const buttons = document.createElement("div");
	const btn = document.createElement("button");
	btn.textContent = "关闭(ESC)";
	btn.addEventListener("click", () => {
	  popover.remove();
	});
	buttons.appendChild(btn);
	const delBtn = document.createElement("button");
	delBtn.textContent = "从词库删除";
	delBtn.addEventListener("click", async() => {
	  await chrome.runtime.sendMessage({
	    action: 'delete-word',
	    data: {
              word: value.word,
	    }
	  });
	  popover.remove();
	  ranges.map(j => {
	    if(j.word === value.word) {
	      highlight.delete(j.range);
	    }
	  });
	});
	buttons.appendChild(delBtn);
	popover.appendChild(buttons);
	popover.addEventListener("toggle", (e) => {
	  if(e.newState === "closed") {
	    popover.remove();	    
	  }
	});
	document.body.appendChild(popover);
	popover.showPopover();
	return;
      }
    }
  });
})();

