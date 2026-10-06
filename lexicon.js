// Word matching shared by the content script, the options page and tests.
// Plain script (no modules) so it can be listed in manifest content_scripts.
const LexiBridge = (() => {
  // Words, optionally joined by hyphens or apostrophes: "well-known", "don't".
  const TOKEN_RE = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;

  function normalizeWord(word) {
    return String(word).replace(/^﻿/, '').replace(/’/g, "'").trim().toLowerCase();
  }

  // words: [["word", "definition"], ...] -> Map(word -> definition)
  function buildDictionary(words) {
    const dict = new Map();
    for (const row of words) {
      if (!Array.isArray(row) || typeof row[0] !== 'string') continue;
      const key = normalizeWord(row[0]);
      if (key && !dict.has(key)) dict.set(key, String(row[1] ?? ''));
    }
    return dict;
  }

  // Base-form guesses for an inflected word, most likely first.
  function stems(word) {
    const res = [];
    const add = (s) => { if (s.length >= 3) res.push(s); };
    const doubled = (s) => s.length >= 2 && s.at(-1) === s.at(-2) ? s.slice(0, -1) : null;
    if (word.endsWith("'s")) return [word.slice(0, -2)];
    if (word.endsWith('ies') || word.endsWith('ied')) add(word.slice(0, -3) + 'y');
    if (word.endsWith('es')) add(word.slice(0, -2));
    if (word.endsWith('s') && !word.endsWith('ss')) add(word.slice(0, -1));
    if (word.endsWith('ed')) {
      const s = word.slice(0, -2);
      add(s);
      add(s + 'e');
      if (doubled(s)) add(doubled(s));
    }
    if (word.endsWith('ing')) {
      const s = word.slice(0, -3);
      add(s);
      add(s + 'e');
      if (doubled(s)) add(doubled(s));
    }
    return res;
  }

  function lookup(dict, word) {
    if (dict.has(word)) return word;
    for (const s of stems(word)) {
      if (dict.has(s)) return s;
    }
    return null;
  }

  // Returns [{start, end, word}] where word is the dictionary key.
  function findMatches(text, dict) {
    const matches = [];
    for (const m of text.matchAll(TOKEN_RE)) {
      const token = normalizeWord(m[0]);
      const key = lookup(dict, token);
      if (key) {
        matches.push({start: m.index, end: m.index + m[0].length, word: key});
        continue;
      }
      if (!/['-]/.test(token)) continue;
      // "self-esteem" not in the dictionary: try "self" and "esteem";
      // "teacher's" / "they're": try the part before the apostrophe.
      const re = /[a-z]+/g;
      for (const part of token.matchAll(re)) {
        if (part.index > 0 && token[part.index - 1] === "'") break;
        const k = lookup(dict, part[0]);
        if (k) matches.push({start: m.index + part.index, end: m.index + part.index + part[0].length, word: k});
      }
    }
    return matches;
  }

  return {normalizeWord, buildDictionary, stems, lookup, findMatches};
})();

if (typeof module !== 'undefined') module.exports = LexiBridge;
