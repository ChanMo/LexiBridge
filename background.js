importScripts('lexicon.js');

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

// Bundled word lists used to look up definitions for words added from a
// page. Simplified Chinese lists first; OALD (traditional) as a fallback.
const REFERENCE_LISTS = ['CET4_edited', 'CET6_edited', 'GRE_8000_Words', 'GRE_abridged', 'OALD8_abridged_edited'];
let reference = null;

function loadReference() {
  reference ??= (async() => {
    const rows = [];
    for(const name of REFERENCE_LISTS) {
      const res = await fetch(chrome.runtime.getURL(`words/${name}.json`));
      for(const row of await res.json()) rows.push(row);
    }
    return LexiBridge.buildDictionary(rows);
  })();
  return reference;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if(request.action == 'speak') {
    // chrome.tts is not available to content scripts.
    chrome.tts.speak(request.data.word, {lang: 'en-US'});
  } else if(request.action == 'lookup') {
    const word = LexiBridge.normalizeWord(request.data.word);
    loadReference().then(dict => {
      const key = LexiBridge.lookup(dict, word);
      sendResponse(key ? {word: key, definition: dict.get(key)} : {word, definition: ''});
    });
    return true;
  }
});
