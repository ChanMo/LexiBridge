importScripts('lexicon.js', 'levels.js');

chrome.runtime.onInstalled.addListener(async({reason}) => {
  // Also fired on extension and Chrome updates; only greet new installs.
  if(reason !== chrome.runtime.OnInstalledReason.INSTALL) {
    return;
  }
  const words = (await chrome.storage.local.get(["words"])).words??[];
  if(words.length <= 0) {
    // A sensible default until the learner picks a level on the welcome page.
    const level = LexiBridgeLevels.getLevel(LexiBridgeLevels.DEFAULT_LEVEL);
    const lists = await LexiBridgeLevels.loadLists(LexiBridgeLevels.listsFor(level));
    await chrome.storage.local.set({words: LexiBridgeLevels.levelWords(level, lists), level: level.id});
  }
  chrome.tabs.create({url: 'level.html?welcome=1'});
});

// Bundled word lists used to look up definitions for words added from a
// page. Simplified Chinese lists first; OALD (traditional) as a fallback.
const REFERENCE_LISTS = ['CET4_edited', 'CET6_edited', 'GRE_8000_Words', 'GRE_abridged', 'OALD8_abridged_edited'];
let reference = null;

function loadReference() {
  reference ??= LexiBridgeLevels.loadLists(REFERENCE_LISTS)
    .then(lists => LexiBridge.buildDictionary(REFERENCE_LISTS.flatMap(n => lists[n])));
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
