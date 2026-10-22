const test = require('node:test');
const assert = require('node:assert');
const {MIN_DAYS, MIN_KNOWN, CHROME_ID, EDGE_ADDON_ID, shouldShow, countKnown, storeUrl, seedKnownCount, isStoreBuild} = require('../review.js');

const DAY = 24 * 60 * 60 * 1000;
const installedAt = 1_000_000_000_000;
const later = installedAt + MIN_DAYS * DAY;

test('too early: waits a week from install', () => {
  assert.strictEqual(shouldShow({installedAt}, MIN_KNOWN, later - 1), false);
  assert.strictEqual(shouldShow({installedAt}, MIN_KNOWN * 10, installedAt), false);
  assert.strictEqual(shouldShow({}, MIN_KNOWN, later), false);
  assert.strictEqual(shouldShow(undefined, MIN_KNOWN, later), false);
});

test('too few: waits for 50 words marked known', () => {
  assert.strictEqual(shouldShow({installedAt}, MIN_KNOWN - 1, later + 365 * DAY), false);
  assert.strictEqual(shouldShow({installedAt}, 0, later), false);
  assert.strictEqual(shouldShow({installedAt}, undefined, later), false);
});

test('eligible: a week and 50 words', () => {
  assert.strictEqual(MIN_DAYS, 7);
  assert.strictEqual(MIN_KNOWN, 50);
  assert.strictEqual(shouldShow({installedAt}, MIN_KNOWN, later), true);
  assert.strictEqual(shouldShow({installedAt}, 1234, later + 30 * DAY), true);
});

test('shown once: being shown, or done, ends it for good', () => {
  assert.strictEqual(shouldShow({installedAt, shownAt: later}, MIN_KNOWN * 10, later + 365 * DAY), false);
  assert.strictEqual(shouldShow({installedAt, shownAt: later, done: true}, MIN_KNOWN * 10, later + 365 * DAY), false);
  assert.strictEqual(shouldShow({installedAt, done: true}, MIN_KNOWN * 10, later + 365 * DAY), false);
});

test('unpacked/dev: no update_url means never show the card', () => {
  assert.strictEqual(isStoreBuild({update_url: 'https://clients2.google.com/service/update2/crx'}), true);
  assert.strictEqual(isStoreBuild({}), false);
  assert.strictEqual(isStoreBuild({name: 'x'}), false);
  assert.strictEqual(isStoreBuild(undefined), false);
  assert.strictEqual(shouldShow({installedAt}, MIN_KNOWN, later, false), false);
  assert.strictEqual(shouldShow({installedAt}, MIN_KNOWN, later, true), true);
});

test('knownCount: +1 when marked known, -1 on undo, never below 0', () => {
  assert.strictEqual(countKnown(undefined, 1), 1);
  assert.strictEqual(countKnown(49, 1), 50);
  assert.strictEqual(countKnown(50, -1), 49);
  assert.strictEqual(countKnown(0, -1), 0);
  assert.strictEqual(countKnown(undefined, -1), 0);
  assert.strictEqual(countKnown('junk', 1), 1);
});

test('seedKnownCount: level list minus remaining words (not words.length)', () => {
  const level = ['abandon', 'ability', 'about', 'above', 'absent'];
  // Full level still in words → new install / nothing marked → 0.
  assert.strictEqual(seedKnownCount(level, level.map(w => [w, 'def'])), 0);
  // Two marked known (removed from words).
  assert.strictEqual(seedKnownCount(level, [['ability', 'd'], ['about', 'd'], ['above', 'd']]), 2);
  // Case / normalisation: Abandon still counts as present.
  assert.strictEqual(seedKnownCount(level, [['Abandon', 'd'], ['ability', 'd']]), 3);
  // User-added words in `words` that are not on the level list do not change the seed.
  assert.strictEqual(seedKnownCount(level, [['ability', 'd'], ['zzzz', 'extra']]), 4);
  // Switching levels changes words.length a lot; seed still only looks at this level.
  const shortLevel = ['ability', 'about'];
  assert.strictEqual(seedKnownCount(shortLevel, [['ability', 'd'], ['about', 'd'], ['zzzz', 'x']]), 0);
  assert.strictEqual(seedKnownCount(shortLevel, [['zzzz', 'x']]), 2);
  assert.strictEqual(seedKnownCount(undefined, []), 0);
  assert.strictEqual(seedKnownCount(level, undefined), 5);
});

test('store link by extension id', () => {
  const chrome = 'https://chromewebstore.google.com/detail/mnhdbmjfgoohoajakjkeminblgnbmlhp/reviews';
  assert.strictEqual(CHROME_ID, 'mnhdbmjfgoohoajakjkeminblgnbmlhp');
  assert.strictEqual(storeUrl(CHROME_ID), chrome);
  assert.strictEqual(storeUrl(CHROME_ID, 'edgeid123'), chrome);
  assert.strictEqual(storeUrl('edgeid123', 'edgeid123'), 'https://microsoftedge.microsoft.com/addons/detail/edgeid123');
  assert.strictEqual(EDGE_ADDON_ID, 'mfkdpjjhgckichnfmlhnhploekkdpgaj');
  assert.strictEqual(storeUrl(EDGE_ADDON_ID), 'https://microsoftedge.microsoft.com/addons/detail/mfkdpjjhgckichnfmlhnhploekkdpgaj');
  assert.strictEqual(storeUrl('edgeid123'), chrome);
  assert.strictEqual(storeUrl('', ''), chrome);
  assert.strictEqual(storeUrl('abcdefghijklmnopabcdefghijklmnop'), chrome);
  assert.strictEqual(storeUrl('abcdefghijklmnopabcdefghijklmnop', 'edgeid123'), chrome);
  assert.strictEqual(storeUrl(undefined), chrome);
});
