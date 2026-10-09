// Upgrade from v1.3. Definitions that came from the old bundled lists, and
// that the learner has not edited, are replaced with the new dictionary's; a
// list started from a v1.3 level then moves to the new list of that level,
// keeping the words the learner took out or added. Safe to run on every
// update. Delete together with packs/legacy-v13.json once v1.3 users have moved on.
// Plain script, used by background.js and tests.
const LexiBridgeMigrate = (() => {
  const LB = typeof LexiBridge !== 'undefined' ? LexiBridge : require('./lexicon.js');
  const P = typeof LexiBridgePacks !== 'undefined' ? LexiBridgePacks : require('./packs.js');

  // First 8 hex digits of sha1, as written by `tools/build_packs.py legacy`.
  async function sha1(text) {
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
    return [...new Uint8Array(digest, 0, 4)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const legacyHash = (word, definition) => sha1(`${word}\t${definition}`);

  // stored: {words, level, backup_v13}; data: the pack's {dict, levels};
  // legacy: {lists: {level: [word, ...]}, rows: Set of hashes}.
  // Returns the storage keys to set, {} when nothing changes; known: the words
  // taken out of the v1.3 list, as level.js keeps them.
  async function upgrade(stored, {dict, levels}, legacy, now = Date.now()) {
    if (!Array.isArray(stored.words)) return {};

    let bundled = 0;
    let words = await Promise.all(stored.words.map(async(row) => {
      if (!Array.isArray(row) || typeof row[0] !== 'string') return row;
      const word = LB.normalizeWord(row[0]);
      const definition = String(row[1] ?? '');
      if (!legacy.rows.has(await legacyHash(word, definition))) return row;
      bundled++;
      const fresh = dict.get(word);
      return fresh ? [row[0], fresh] : row;
    }));

    // Once: the backup is written when it happens, and lists started after
    // v1.3 have no old definitions.
    const level = stored.level;
    let known = [];
    if (bundled && !stored.backup_v13 && Object.hasOwn(legacy.lists, level) && Object.hasOwn(levels, level)) {
      ({words, known} = P.switchWords(words, [], {dict, list: legacy.lists[level]}, {dict, list: levels[level]}));
    }
    if (JSON.stringify(words) === JSON.stringify(stored.words)) return {};
    // The list as it was before the first change, kept in case it is needed.
    const backup = stored.backup_v13 ?? {words: stored.words, level: level ?? null, at: now};
    return known.length ? {words, known, backup_v13: backup} : {words, backup_v13: backup};
  }

  return {legacyHash, upgrade};
})();

if (typeof module !== 'undefined') module.exports = LexiBridgeMigrate;
