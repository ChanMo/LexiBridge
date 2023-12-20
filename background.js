chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if(request.action == 'is-blocked') {
    const domain = new URL(sender.origin).hostname;
    chrome.storage.local.get(['blocked']).then(domains => {
      if(domains.blocked) {
	if(domains.blocked.includes(domain)) {
	  sendResponse(true);
	  return
	}
      }
      sendResponse(false);
    });
  } else if(request.action == 'get-words') {
    chrome.storage.local.get(['words']).then(words => {
      words = words.words ? words.words : []
      sendResponse(words);      
    });
  }
  return true;
});
// chrome.runtime.onInstalled.addListener(function() {
//   chrome.contextMenus.create({
//     title: "Toggle LexiBridge",
//     type: "checkbox",
//     id: "toggle"
//   })
// })
chrome.contextMenus.onClicked.addListener(async(e, tab) => {
  const domain = new URL(tab.url).hostname
  let blocked = await chrome.storage.local.get(['blocked'])
  blocked = blocked.blocked ? blocked.blocked : []
  if(e.checked) {
    chrome.storage.local.set({"blocked": blocked.filter(i => i !== domain)})
  } else {
    chrome.storage.local.set({"blocked": [...blocked, domain]})
  }
  chrome.storage.local.get(["blocked"]).then(res => {
    console.log(res)
  })
});

