chrome.runtime.onInstalled.addListener(async({reason}) => {
  // Also fired on extension and Chrome updates; only greet new installs.
  if(reason !== chrome.runtime.OnInstalledReason.INSTALL) {
    return;
  }
  const words = (await chrome.storage.local.get(["words"])).words??[];
  if(words.length <= 0) {
    const url = chrome.runtime.getURL("words/CET6_edited.json");
    const res = await fetch(url);
    const resJson = await res.json();
    await chrome.storage.local.set({"words":resJson})
  }
  chrome.tabs.create({url: 'options.html'});
});
// chrome.tts is not available to content scripts.
chrome.runtime.onMessage.addListener((request) => {
  if(request.action == 'speak') {
    chrome.tts.speak(request.data.word, {lang: 'en-US'});
  }
});
