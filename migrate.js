// Upgrade from v1.3: definitions that came from the old bundled lists, and that
// the learner has not edited, are replaced with the new dictionary's. Safe to
// run on every update. Delete together with packs/legacy-v13.json after v1.5.
// Plain script, used by background.js and tests.
const LexiBridgeMigrate = (() => {
  const LB = typeof LexiBridge !== 'undefined' ? LexiBridge : require('./lexicon.js');

  // First 8 hex digits of sha1(word + "\t" + definition), as written by
  // `tools/build_packs.py legacy`.
  async function legacyHash(word, definition) {
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${word}\t${definition}`));
    return [...new Uint8Array(digest, 0, 4)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // stored: {words, level, backup_v13}; dict: Map(word -> definition);
  // legacy: Set of hashes. Returns the storage keys to set, {} when nothing changes.
  async function upgrade(stored, dict, legacy, now = Date.now()) {
    if (!Array.isArray(stored.words)) return {};
    let refreshed = 0;
    const words = await Promise.all(stored.words.map(async(row) => {
      if (!Array.isArray(row) || typeof row[0] !== 'string') return row;
      const word = LB.normalizeWord(row[0]);
      const definition = String(row[1] ?? '');
      const fresh = dict.get(word);
      if (!fresh || fresh === definition || !legacy.has(await legacyHash(word, definition))) return row;
      refreshed++;
      return [row[0], fresh];
    }));
    if (!refreshed) return {};
    // The list as it was before the first refresh, kept until v1.6 in case it is needed.
    const backup = stored.backup_v13 ?? {words: stored.words, level: stored.level ?? null, at: now};
    return {words, backup_v13: backup};
  }

  return {legacyHash, upgrade};
})();

if (typeof module !== 'undefined') module.exports = LexiBridgeMigrate;
