// Upgrade from v1.3. A starting list the learner never changed is replaced with
// the level's new one; otherwise definitions that came from the old bundled
// lists, and that the learner has not edited, are replaced with the new
// dictionary's. Safe to run on every update. Delete together with
// packs/legacy-v13.json once v1.3 users have moved on.
// Plain script, used by background.js and tests.
const LexiBridgeMigrate = (() => {
  const LB = typeof LexiBridge !== 'undefined' ? LexiBridge : require('./lexicon.js');

  // First 8 hex digits of sha1, as written by `tools/build_packs.py legacy`.
  async function sha1(text) {
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
    return [...new Uint8Array(digest, 0, 4)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const legacyHash = (word, definition) => sha1(`${word}\t${definition}`);

  // A v1.3 level whose starting list `words` still is, or undefined.
  async function untouchedLevel(words, level, lists) {
    if (!Object.hasOwn(lists, level) || !words.every(row => Array.isArray(row) && typeof row[0] === 'string')) return;
    return await sha1(words.map(row => LB.normalizeWord(row[0])).join('\n')) === lists[level] ? level : undefined;
  }

  // stored: {words, level, backup_v13}; data: the pack's {dict, levels};
  // legacy: {lists: {level: hash}, rows: Set of hashes}.
  // Returns the storage keys to set, {} when nothing changes.
  async function upgrade(stored, {dict, levels}, legacy, now = Date.now()) {
    if (!Array.isArray(stored.words)) return {};
    // The list as it was before the first change, kept in case it is needed.
    const backup = () => stored.backup_v13 ?? {words: stored.words, level: stored.level ?? null, at: now};

    const level = await untouchedLevel(stored.words, stored.level, legacy.lists);
    if (level && Object.hasOwn(levels, level)) {
      return {words: levels[level].map(word => [word, dict.get(word)]), backup_v13: backup()};
    }

    let refreshed = 0;
    const words = await Promise.all(stored.words.map(async(row) => {
      if (!Array.isArray(row) || typeof row[0] !== 'string') return row;
      const word = LB.normalizeWord(row[0]);
      const definition = String(row[1] ?? '');
      const fresh = dict.get(word);
      if (!fresh || fresh === definition || !legacy.rows.has(await legacyHash(word, definition))) return row;
      refreshed++;
      return [row[0], fresh];
    }));
    return refreshed ? {words, backup_v13: backup()} : {};
  }

  return {legacyHash, upgrade};
})();

if (typeof module !== 'undefined') module.exports = LexiBridgeMigrate;
