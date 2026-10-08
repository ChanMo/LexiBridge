// Word matching shared by the content script, the options page and tests.
// Plain script (no modules) so it can be listed in manifest content_scripts.
const LexiBridge = (() => {
  // Irregular forms ("gave" -> "give") from engines/en-irregular.js, loaded before
  // this script where words are looked up (content script, service worker).
  // Pages that only parse definitions do without it.
  const IRREGULAR = typeof LexiBridgeIrregular !== 'undefined' ? LexiBridgeIrregular
    : typeof require !== 'undefined' ? require('./engines/en-irregular.js') : new Map();

  // Function words every level knows: never highlighted, even when a word
  // list contains them. tools/build_packs.py reads this list too.
  const COMMON_WORDS = new Set(`
    a an the this that these those some any each every no all both either neither
    many much more most few little other another such what which whose
    i me my mine myself you your yours yourself he him his himself she her hers
    herself it its itself we us our ours ourselves they them their theirs themselves
    who whom one
    about above across after against along among around as at before behind below
    beside between beyond but by down during except for from in inside into like
    near of off on onto out outside over past since through till to toward towards
    under until up upon with within without
    and or nor so yet because if unless while when where whether than though
    although once
    be am is are was were been being have has had having do does did done
    can could may might must shall should will would
    not very too also just only even still already again ever never always often
    here there now then how why yes well
    two three four five six seven eight nine ten hundred thousand first second
  `.trim().split(/\s+/));

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

  // Dictionary key for a word: the word itself, its irregular base, or a stem.
  function lookup(dict, word) {
    if (dict.has(word)) return word;
    const base = IRREGULAR.get(word);
    if (base && dict.has(base)) return base;
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

  return {COMMON_WORDS, parseDefinition, isWord, normalizeWord, buildDictionary, stems, lookup, findMatches};
})();

if (typeof module !== 'undefined') module.exports = LexiBridge;
