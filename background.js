importScripts('engines/en-irregular.js', 'lexicon.js', 'packs.js', 'migrate.js');

const P = LexiBridgePacks;

// Pack data, loaded once per pack: definitions for words added from a page.
const loaded = new Map();
function packData(id) {
  const pack = P.getPack(id);
  if(!loaded.has(pack.id)) loaded.set(pack.id, P.loadPack(pack));
  return loaded.get(pack.id);
}

chrome.runtime.onInstalled.addListener(async({reason}) => {
  // Also fired on Chrome updates, which need nothing.
  if(reason === chrome.runtime.OnInstalledReason.UPDATE) {
    await upgrade();
    return;
  }
  if(reason !== chrome.runtime.OnInstalledReason.INSTALL) {
    return;
  }
  const {words = []} = await chrome.storage.local.get(['words']);
  if(words.length <= 0) {
    // A sensible default until the learner picks a level on the welcome page:
    // definitions in the browser's language.
    const pack = P.pickPack([chrome.i18n.getUILanguage(), ...navigator.languages]);
    const data = await packData(pack.id);
    await chrome.storage.local.set({pack: pack.id, words: P.levelWords(data, pack.defaultLevel), level: pack.defaultLevel});
  }
  chrome.tabs.create({url: 'level.html?welcome=1'});
});

// Brings word lists from v1.3 up to date (migrate.js).
async function upgrade() {
  const stored = await chrome.storage.local.get(['words', 'level', 'pack', 'backup_v13']);
  const [data, {lists, rows}] = await Promise.all([
    packData(stored.pack),
    fetch(chrome.runtime.getURL('packs/legacy-v13.json')).then(res => res.json()),
  ]);
  const changes = await LexiBridgeMigrate.upgrade(stored, data, {lists, rows: new Set(rows)});
  if(Object.keys(changes).length) await chrome.storage.local.set(changes);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if(request.action == 'speak') {
    // chrome.tts is not available to content scripts.
    chrome.tts.speak(request.data.word, {lang: 'en-US'});
  } else if(request.action == 'lookup') {
    const word = LexiBridge.normalizeWord(request.data.word);
    chrome.storage.local.get(['pack']).then(({pack}) => packData(pack)).then(({dict}) => {
      const key = LexiBridge.lookup(dict, word);
      sendResponse(key ? {word: key, definition: dict.get(key)} : {word, definition: ''});
    });
    return true;
  }
});
