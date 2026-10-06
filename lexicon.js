// Word matching shared by the content script, the options page and tests.
// Plain script (no modules) so it can be listed in manifest content_scripts.
const LexiBridge = (() => {
  // Words, optionally joined by hyphens or apostrophes: "well-known", "don't".
  const TOKEN_RE = /[A-Za-z]+(?:['\u2019-][A-Za-z]+)*/g;
  const WORD_RE = /^[A-Za-z]+(?:['\u2019-][A-Za-z]+)*$/;

  // True for a single word such as a text selection: "Abandoned", "well-known".
  function isWord(text) {
    return text.length <= 40 && WORD_RE.test(text);
  }

  function normalizeWord(word) {
    return String(word).replace(/^\uFEFF/, '').replace(/\u2019/g, "'").trim().toLowerCase();
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

  // Part-of-speech markers as written in the bundled lists: "vt.", "vt.&vi.",
  // "v./n.", "a." (adj.), "ad." (adv.), and OALD's "noun", "adjective"...
  const POS_ABBR = 'n|v|vt|vi|a|ad|adj|adv|art|prep|conj|pron|num|int|interj|aux|abbr';
  const POS_WORD = 'noun|verb|adjective|adverb|preposition|conjunction|pronoun|exclamation|determiner|number';
  const POS_RE = new RegExp(
    `(?:^|\\s)((?:${POS_ABBR})\\.(?:\\s*[&/]\\s*(?:${POS_ABBR})\\.)*|(?:${POS_WORD})(?=\\s))`, 'g');
  const POS_SHORT = {a: 'adj.', ad: 'adv.', noun: 'n.', verb: 'v.', adjective: 'adj.', adverb: 'adv.',
    preposition: 'prep.', conjunction: 'conj.', pronoun: 'pron.', exclamation: 'int.', determiner: 'det.', number: 'num.'};

  function shortPos(pos) {
    return pos.split(/\s*([&/])\s*/).map(p => POS_SHORT[p.replace(/\.$/, '')] ?? p).join('');
  }

  // "[əˈbændən] v. 1. 抛弃 2. 离弃 n. 放纵" ->
  // {phonetic: "əˈbændən", groups: [{pos: "v.", senses: ["抛弃", "离弃"]}, {pos: "n.", senses: ["放纵"]}]}
  // Text that does not follow the pattern ends up as a single sense.
  function parseDefinition(text) {
    let rest = String(text ?? '').trim().replace(/^\d+\s+(?=\[)/, '');
    let phonetic = null;
    const ph = rest.match(/^\[([^\]]*)\]\s*/);
    if (ph) {
      phonetic = ph[1].trim() || null;
      rest = rest.slice(ph[0].length);
    }
    const marks = [...rest.matchAll(POS_RE)];
    const parts = [];
    if (!marks.length || marks[0].index > 0) {
      parts.push({pos: null, body: rest.slice(0, marks[0]?.index ?? rest.length)});
    }
    marks.forEach((m, i) => {
      const start = m.index + m[0].length;
      parts.push({pos: shortPos(m[1]), body: rest.slice(start, marks[i + 1]?.index ?? rest.length)});
    });
    const groups = parts.map(({pos, body}) => {
      const senses = body.split(/(?:^|\s)\d+\.\s*/).map(s => s.trim()).filter(Boolean);
      return {pos, senses};
    }).filter(g => g.senses.length || g.pos);
    return {phonetic, groups};
  }

  return {parseDefinition, isWord, normalizeWord, buildDictionary, stems, lookup, findMatches};
})();

if (typeof module !== 'undefined') module.exports = LexiBridge;
