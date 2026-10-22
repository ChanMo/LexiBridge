// The one-time invitation to review LexiBridge in its store, shown at the top
// of the popup, and the store link behind it and the always-there rate links.
// Stored as reviewPrompt: {installedAt, shownAt, done}, and knownCount: words
// marked known on pages (script.js), less those undone. Once shown it never
// comes back. No reward, no rating filter, no star nudging: store policies
// forbid them. Nothing here touches the network.
// Plain script, used by background.js, script.js, popup.js, page.js and tests.
const LexiBridgeReview = (() => {
  const KEY = 'reviewPrompt';
  const KNOWN_KEY = 'knownCount';
  const MIN_DAYS = 7;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const MIN_KNOWN = 50;

  const CHROME_ID = 'mnhdbmjfgoohoajakjkeminblgnbmlhp';
  // The id LexiBridge has on Edge Add-ons.
  const EDGE_ADDON_ID = 'mfkdpjjhgckichnfmlhnhploekkdpgaj';

  const lexicon = () => (typeof LexiBridge !== 'undefined' ? LexiBridge : require('./lexicon.js'));

  // Words still on the learner's list, normalised the same way packs.js does.
  function remaining(words) {
    const LB = lexicon();
    return new Set((words ?? []).filter(row => Array.isArray(row) && typeof row[0] === 'string')
      .map(row => LB.normalizeWord(row[0])));
  }

  // Seed for existing users: words of the current level that are no longer in
  // `words` (the "don't know yet" list). Not words.length alone — switching
  // levels also changes that. New installs get 0 because `words` starts as the
  // full level list.
  function seedKnownCount(levelList, words) {
    const LB = lexicon();
    const have = remaining(words);
    return (levelList ?? []).filter(w => typeof w === 'string' && !have.has(LB.normalizeWord(w))).length;
  }

  // Chrome sets update_url on store installs; unpacked/dev builds have none.
  function isStoreBuild(manifest) {
    return Boolean(manifest && manifest.update_url);
  }

  // state: the stored reviewPrompt value; known: the stored knownCount.
  // storeBuild: false for unpacked/dev — never show the card there.
  function shouldShow(state, known, now = Date.now(), storeBuild = true) {
    if(!storeBuild) return false;
    if(!state?.installedAt || state.shownAt || state.done) return false;
    return now - state.installedAt >= MIN_DAYS * DAY_MS && known >= MIN_KNOWN;
  }

  // knownCount after marking a word known (+1) or undoing it (-1).
  function countKnown(count, delta) {
    return Math.max(0, (Number.isFinite(count) ? count : 0) + delta);
  }

  // The store this copy came from, told by its extension id: Edge Add-ons once
  // listed there, otherwise (Chrome Web Store, unpacked) the Chrome Web Store.
  function storeUrl(id, edgeId = EDGE_ADDON_ID) {
    if(edgeId && id === edgeId) return `https://microsoftedge.microsoft.com/addons/detail/${edgeId}`;
    return `https://chromewebstore.google.com/detail/${CHROME_ID}/reviews`;
  }

  return {KEY, KNOWN_KEY, MIN_DAYS, MIN_KNOWN, CHROME_ID, EDGE_ADDON_ID,
    seedKnownCount, isStoreBuild, shouldShow, countKnown, storeUrl};
})();

if (typeof module !== 'undefined') module.exports = LexiBridgeReview;
