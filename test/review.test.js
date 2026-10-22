const test = require('node:test');
const assert = require('node:assert');
const {MIN_DAYS, MIN_WORDS, EDGE_ADDON_ID, wordsTakenOut, shouldShow, isEdge, storeUrl} = require('../review.js');

const DAY = 24 * 60 * 60 * 1000;
const installedAt = 1_000_000_000_000;
const later = installedAt + MIN_DAYS * DAY;

test('waits a week from install', () => {
  assert.strictEqual(shouldShow({installedAt}, MIN_WORDS, later - 1), false);
  assert.strictEqual(shouldShow({installedAt}, MIN_WORDS, later), true);
  // No install time recorded yet: not shown.
  assert.strictEqual(shouldShow({}, MIN_WORDS, later), false);
  assert.strictEqual(shouldShow(undefined, MIN_WORDS, later), false);
});

test('waits for enough words taken out', () => {
  assert.strictEqual(shouldShow({installedAt}, MIN_WORDS - 1, later), false);
  assert.strictEqual(shouldShow({installedAt}, MIN_WORDS, later + 30 * DAY), true);
});

test('shown once: being shown or any choice ends it for good', () => {
  assert.strictEqual(shouldShow({installedAt, shownAt: later}, MIN_WORDS, later + 365 * DAY), false);
  for (const choice of ['rate', 'later', 'never', 'closed']) {
    assert.strictEqual(shouldShow({installedAt, shownAt: later, choice}, MIN_WORDS * 10, later + 365 * DAY), false, choice);
    assert.strictEqual(shouldShow({installedAt, choice}, MIN_WORDS * 10, later + 365 * DAY), false, choice);
  }
});

test('words taken out: from the level list, and from earlier lists', () => {
  const list = ['abandon', 'oust', 'zeal', 'vex'];
  assert.strictEqual(wordsTakenOut([['abandon', 'v.'], ['Oust', 'v.'], ['zeal', 'n.'], ['vex', 'v.']], [], list), 0);
  // zeal and vex taken out, zebra added (does not count), oust known from an earlier list too.
  assert.strictEqual(wordsTakenOut([['abandon', 'v.'], ['oust', 'v.'], ['zebra', 'n.'], 'junk'], ['oust', 'quell', 'vex'], list), 4);
  assert.strictEqual(wordsTakenOut([], [], []), 0);
});

test('Edge is told apart by its brand, or by its user agent', () => {
  assert.strictEqual(isEdge({userAgentData: {brands: [{brand: 'Chromium'}, {brand: 'Microsoft Edge'}]}, userAgent: ''}), true);
  assert.strictEqual(isEdge({userAgentData: {brands: [{brand: 'Chromium'}, {brand: 'Google Chrome'}]}, userAgent: 'Chrome/130.0'}), false);
  assert.strictEqual(isEdge({userAgent: 'Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0'}), true);
  assert.strictEqual(isEdge({userAgent: 'Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36'}), false);
  assert.strictEqual(isEdge({}), false);
});

test('store link: Chrome Web Store, Edge Add-ons once listed there', () => {
  const chrome = 'https://chromewebstore.google.com/detail/mnhdbmjfgoohoajakjkeminblgnbmlhp/reviews';
  assert.strictEqual(storeUrl(false), chrome);
  // Not on Edge Add-ons yet: Edge falls back to the Chrome Web Store.
  assert.strictEqual(EDGE_ADDON_ID, '');
  assert.strictEqual(storeUrl(true), chrome);
  assert.strictEqual(storeUrl(true, ''), chrome);
  assert.strictEqual(storeUrl(true, 'abc123'), 'https://microsoftedge.microsoft.com/addons/detail/abc123');
  assert.strictEqual(storeUrl(false, 'abc123'), chrome);
});
