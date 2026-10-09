const test = require('node:test');
const assert = require('node:assert');
const {COMMON_WORDS, parseDefinition} = require('../lexicon.js');
const {PACKS, getPack, pickPack, getLevel, levelWords, bands, switchWords, progress} = require('../packs.js');
const IRREGULAR = require('../engines/en-irregular.js');

const load = (pack) => ({
  dict: new Map(Object.entries(require(`../packs/${pack.id}/dict.json`))),
  levels: require(`../packs/${pack.id}/levels.json`),
});

// Generated level sizes; a rebuild that moves one by more than 5% needs a look.
const SIZES = {
  'en-zh-Hans': {basic: 12527, cet4: 8760, cet6: 6736, gre: 3348},
  'en-zh-Hant': {a2: 12286, b1: 10145, b2: 7842, gre: 3388},
  'en-ja': {a2: 11626, b1: 9589, b2: 7425, gre: 3193},
};

test('missing or unknown pack ids fall back to the first pack', () => {
  assert.strictEqual(getPack(undefined), PACKS[0]);
  assert.strictEqual(getPack('nope'), PACKS[0]);
  assert.strictEqual(getLevel(undefined, 'cet4').name, '大学四级');
  assert.strictEqual(getLevel(undefined, 'nope'), undefined);
});

test('the pack follows the browser language', () => {
  const pick = (...languages) => pickPack(languages).id;
  assert.strictEqual(pick('zh-CN'), 'en-zh-Hans');
  assert.strictEqual(pick('en-US', 'fr'), 'en-zh-Hans');
  for (const tag of ['zh-TW', 'zh_TW', 'zh-HK', 'zh-MO', 'zh-Hant-TW']) assert.strictEqual(pick(tag), 'en-zh-Hant', tag);
  assert.strictEqual(pick('en-US', 'zh-TW', 'zh-CN'), 'en-zh-Hant');
  assert.strictEqual(pick('zh', 'zh-TW'), 'en-zh-Hans');
  assert.strictEqual(pick('zhx-TW'), 'en-zh-Hans');
  for (const tag of ['ja', 'ja-JP', 'ja_JP']) assert.strictEqual(pick(tag), 'en-ja', tag);
  assert.strictEqual(pick('en-US', 'ja', 'zh-CN'), 'en-ja');
  assert.strictEqual(pick('jam'), 'en-zh-Hans');
});

for (const pack of PACKS) {
  test(`${pack.id}: levels match the generated data`, () => {
    const data = load(pack);
    assert.deepStrictEqual(pack.levels.map(l => l.id).sort(), Object.keys(data.levels).sort());
    assert.ok(getLevel(pack.id, pack.defaultLevel));
    for (const level of pack.levels) {
      const words = levelWords(data, level.id);
      assert.ok(words.every(([w, d]) => d && !COMMON_WORDS.has(w)), level.id);
      const size = SIZES[pack.id][level.id];
      assert.ok(Math.abs(words.length - size) <= size * 0.05, `${level.id}: ${words.length}, snapshot ${size}`);
    }
    // A level marks every harder word, so each one holds the next one's list.
    pack.levels.slice(1).forEach((level, i) => {
      const easier = new Set(data.levels[pack.levels[i].id]);
      assert.ok(data.levels[level.id].every(w => easier.has(w)), level.id);
    });
  });

  test(`${pack.id}: dictionary keys are clean and words with meanings of their own are kept`, () => {
    const {dict} = load(pack);
    for (const key of dict.keys()) assert.match(key, /^[a-z]+(?:['-][a-z]+)*$/);
    // A leading "[计]" tag would show up on the card as the phonetic.
    for (const [w, d] of dict) assert.doesNotMatch(parseDefinition(d).phonetic ?? '', /[\u3040-\u9fff]/, w);
    for (const w of ['found', 'left', 'ground', 'bound', 'wound']) assert.ok(dict.get(w), w);
  });
}

test('irregular forms: no homographs, no function words', () => {
  const {dict} = load(PACKS[0]);
  for (const [form, base] of IRREGULAR) {
    assert.ok(!dict.has(form), form);
    assert.ok(dict.has(base) && !COMMON_WORDS.has(base), `${form} -> ${base}`);
  }
});

test('Traditional Chinese: same words as Simplified, converted text, every phrase used', () => {
  const fs = require('node:fs');
  const hans = require('../packs/en-zh-Hans/dict.json'), hant = require('../packs/en-zh-Hant/dict.json');
  assert.deepStrictEqual(Object.keys(hant), Object.keys(hans));
  // Characters that are only ever Simplified.
  const simplified = /[这们说为对发会时国来过还进现动问学开关见长门东车马鸟鱼专业书买卖亲认识让读写语话请]/;
  for (const [w, d] of Object.entries(hant)) assert.doesNotMatch(d, simplified, w);
  const text = Object.values(hant).join('\n');
  const phrases = fs.readFileSync(`${__dirname}/../tools/zh-hant-phrases.tsv`, 'utf8').split('\n')
    .filter(l => l.trim() && !l.startsWith('#')).map(l => l.split('\t'));
  for (const [from, to] of phrases) {
    assert.ok(!text.includes(from), `left over: ${from}`);
    assert.ok(text.includes(to), `never used: ${from} -> ${to}`);
  }
});

test('Japanese: definitions are EJDict text without its markup', () => {
  const ja = require('../packs/en-ja/dict.json');
  for (const [w, d] of Object.entries(ja)) {
    const {groups} = parseDefinition(d);
    assert.ok(groups.length === 1 && groups[0].senses.join('').trim(), w);
    assert.doesNotMatch(d, /[『』《》{}]|〈[CU]〉/, w);
  }
  // Core senses span the parts of speech: "light" is also 軽い.
  assert.match(ja.light, /軽い/);
  assert.match(ja.right, /正しい/);
  // "=hamburger3" takes that sense only.
  assert.match(ja.burger, /^\S+ ハンバーガー/);
});

test('packs using CEFR-J cite it', () => {
  const fs = require('node:fs');
  const citation = 'The CEFR-J Wordlist Version 1.6. Compiled by Yukio Tono, Tokyo University of Foreign Studies.';
  for (const id of ['en-zh-Hant', 'en-ja']) {
    assert.ok(fs.readFileSync(`${__dirname}/../packs/${id}/ATTRIBUTION.md`, 'utf8').includes(citation), id);
    assert.match(getPack(id).credit, /CEFR-J/, id);
  }
  assert.ok(fs.readFileSync(`${__dirname}/../THIRD_PARTY_NOTICES.md`, 'utf8').includes(citation));
});

test('forms of known words are left out of the levels, verbs of their own are not', () => {
  const {levels} = load(PACKS[0]);
  const cet4 = new Set(levels.cet4), basic = new Set(levels.basic);
  for (const w of ['driving', 'existing', 'making']) assert.ok(!cet4.has(w), w);
  assert.ok(basic.has('fell'));  // "fell" a tree, not only the past of "fall"
});

test('bands: a word belongs to the hardest level that marks it', () => {
  for (const pack of PACKS) {
    const data = load(pack);
    const sets = pack.levels.map(level => new Set(data.levels[level.id]));
    for (const [word, i] of bands(pack, data)) {
      assert.ok(sets[i].has(word) && !sets[i + 1]?.has(word), word);
    }
    assert.ok(pack.levels.every(level => level.band), pack.id);
  }
  const hans = bands(PACKS[0], load(PACKS[0]));
  assert.strictEqual(PACKS[0].levels[hans.get('countenance')].band, 'GRE');
  assert.strictEqual(hans.get('driving'), undefined);
});

test('switching levels keeps the words taken out and added, and edited definitions', () => {
  const dict = new Map([['abandon', 'v. 放弃'], ['zeal', 'n. 热心'], ['oust', 'v. 驱逐'], ['vex', 'v. 使烦恼']]);
  const from = {dict, list: ['abandon', 'oust', 'zeal', 'vex']}, to = {dict, list: ['oust', 'zeal']};
  // abandon is known to the new level; vex was taken out, zebra added, zeal edited.
  const words = [['zebra', '斑马'], ['Abandon', 'v. 放弃'], ['oust', 'v. 驱逐'], ['zeal', '热情']];
  const up = switchWords(words, [], from, to);
  assert.deepStrictEqual(up, {words: [['zebra', '斑马'], ['oust', 'v. 驱逐'], ['zeal', '热情']], known: ['vex']});
  // And back: the easier words return, vex stays out.
  assert.deepStrictEqual(switchWords(up.words, up.known, to, from).words,
    [['zebra', '斑马'], ['oust', 'v. 驱逐'], ['zeal', '热情'], ['abandon', 'v. 放弃']]);
  // A known word added again is no longer known.
  assert.deepStrictEqual(switchWords([...up.words, ['vex', '烦']], up.known, to, from).known, []);
  // Another dictionary replaces definitions that were not edited.
  const hant = {dict: new Map([['oust', 'v. 驅逐'], ['zeal', 'n. 熱心']]), list: ['oust', 'zeal']};
  assert.deepStrictEqual(switchWords(words, [], from, hant).words, [['zebra', '斑马'], ['oust', 'v. 驅逐'], ['zeal', '热情']]);
});

test('words taken out survive any round of switches', () => {
  for (const pack of PACKS) {
    const data = load(pack), list = (id) => ({dict: data.dict, list: data.levels[id]});
    const [first, ...rest] = pack.levels.map(l => l.id);
    // Take out every third word of the first level.
    const out = new Set(data.levels[first].filter((_, i) => i % 3 === 0));
    let state = {words: levelWords(data, first).filter(([w]) => !out.has(w)), known: []}, at = first;
    for (const id of [...rest, first, rest.at(-1), first]) {
      state = switchWords(state.words, state.known, list(at), list(id));
      at = id;
    }
    assert.ok(state.words.every(([w]) => !out.has(w)), pack.id);
    assert.strictEqual(state.words.length, data.levels[first].length - out.size, pack.id);
  }
});

test('progress counts the band of the level the learner took out', () => {
  const pack = PACKS[0], {levels} = load(pack);
  const words = levelWords({levels, dict: new Map()}, 'cet4');
  const start = progress(pack, levels, 'cet4', words);
  assert.deepStrictEqual({...start, next: start.next.id}, {band: '六级 · 考研', known: 0, total: levels.cet4.length - levels.cet6.length, next: 'cet6'});
  const band = levels.cet4.find(w => !levels.cet6.includes(w)), harder = levels.cet6[0];
  const less = words.filter(([w]) => w !== band && w !== harder);
  assert.strictEqual(progress(pack, levels, 'cet4', less).known, 1);
  assert.strictEqual(progress(pack, levels, 'gre', []).next, undefined);
  assert.strictEqual(progress(pack, levels, 'nope', words), null);
});
