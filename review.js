// The one-time invitation to review LexiBridge in its store, shown in the popup.
// Stored as one key, reviewPrompt: {installedAt, shownAt, choice}. Once shown it
// never comes back, whatever the learner picks ("later" asks nothing later).
// No reward and no rating filter: store policies forbid both.
// Plain script, used by background.js, popup.js and tests.
const LexiBridgeReview = (() => {
  const LB = typeof LexiBridge !== 'undefined' ? LexiBridge : require('./lexicon.js');

  const KEY = 'reviewPrompt';
  const MIN_DAYS = 7;
  const DAY_MS = 24 * 60 * 60 * 1000;
  // Words the learner took out of their lists. The stored list starts as a
  // level's thousands of words, so its size says nothing; taking 50 out (marked
  // known on pages, or deleted on the word list page) shows the habit took.
  const MIN_WORDS = 50;

  const CHROME_ID = 'mnhdbmjfgoohoajakjkeminblgnbmlhp';
  // Edge Add-ons id, once LexiBridge is listed there; until then Edge users get the Chrome Web Store.
  const EDGE_ADDON_ID = '';

  // Words of the current level's list no longer in `words`, together with
  // `known` (taken out of earlier level lists, see LexiBridgePacks.switchWords).
  function wordsTakenOut(words, known, levelList) {
    const have = new Set(words.filter(row => Array.isArray(row) && typeof row[0] === 'string')
      .map(row => LB.normalizeWord(row[0])));
    return new Set([...known, ...levelList.filter(w => !have.has(w))]).size;
  }

  // state: the stored reviewPrompt value; taken: wordsTakenOut().
  function shouldShow(state, taken, now = Date.now()) {
    if(!state?.installedAt || state.shownAt || state.choice) return false;
    return now - state.installedAt >= MIN_DAYS * DAY_MS && taken >= MIN_WORDS;
  }

  function isEdge(nav) {
    if(nav.userAgentData?.brands?.some(b => b.brand === 'Microsoft Edge')) return true;
    return /Edg\//.test(nav.userAgent ?? '');
  }

  function storeUrl(edge, edgeId = EDGE_ADDON_ID) {
    if(edge && edgeId) return `https://microsoftedge.microsoft.com/addons/detail/${edgeId}`;
    return `https://chromewebstore.google.com/detail/${CHROME_ID}/reviews`;
  }

  return {KEY, MIN_DAYS, MIN_WORDS, EDGE_ADDON_ID, wordsTakenOut, shouldShow, isEdge, storeUrl};
})();

if (typeof module !== 'undefined') module.exports = LexiBridgeReview;
