chrome.runtime.onInstalled.addListener(async() => {
  const words = (await chrome.storage.local.get(["words"])).words??[];
  if(words.length <= 0) {
    const url = chrome.runtime.getURL("words/CET6_edited.json");
    const res = await fetch(url);
    const resJson = await res.json();
    await chrome.storage.local.set({"words":resJson})
  }    
  chrome.tabs.create({url: 'options.html'});
});
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
  } else if(request.action == 'speak') {
    chrome.tts.speak(request.data.word);
  } else if (request.action == "delete-word") {
    const word = request.data.word;
    chrome.storage.local.get(['words']).then(res => {
      const words = res.words ? res.words : [];
      chrome.storage.local.set({'words': words.filter(i => i[0] !== word)}).then(() => {
	sendResponse('deleted.');
      });
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
//chrome.contextMenus.onClicked.addListener(async(e, tab) => {
//  const domain = new URL(tab.url).hostname
//  let blocked = await chrome.storage.local.get(['blocked'])
//  blocked = blocked.blocked ? blocked.blocked : []
//  if(e.checked) {
//    chrome.storage.local.set({"blocked": blocked.filter(i => i !== domain)})
//  } else {
//    chrome.storage.local.set({"blocked": [...blocked, domain]})
//  }
//  chrome.storage.local.get(["blocked"]).then(res => {
//    console.log(res)
//  })
//});
//
