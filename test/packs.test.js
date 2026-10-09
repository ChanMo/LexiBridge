const test = require('node:test');
const assert = require('node:assert');
const {COMMON_WORDS, parseDefinition} = require('../lexicon.js');
const {PACKS, getPack, pickPack, getLevel, levelWords} = require('../packs.js');
const IRREGULAR = require('../engines/en-irregular.js');

const load = (pack) => ({
  dict: new Map(Object.entries(require(`../packs/${pack.id}/dict.json`))),
  levels: require(`../packs/${pack.id}/levels.json`),
});

// Generated level sizes; a rebuild that moves one by more than 5% needs a look.
const SIZES = {
  'en-zh-Hans': {basic: 12527, cet4: 8760, cet6: 6736, gre: 3348},
  'en-zh-Hant': {a2: 12286, b1: 10145, b2: 7842, gre: 3388},
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

test('packs using CEFR-J cite it', () => {
  const fs = require('node:fs');
  const citation = 'The CEFR-J Wordlist Version 1.6. Compiled by Yukio Tono, Tokyo University of Foreign Studies.';
  assert.ok(fs.readFileSync(`${__dirname}/../packs/en-zh-Hant/ATTRIBUTION.md`, 'utf8').includes(citation));
  assert.ok(fs.readFileSync(`${__dirname}/../THIRD_PARTY_NOTICES.md`, 'utf8').includes(citation));
  assert.match(getPack('en-zh-Hant').credit, /CEFR-J/);
});

test('forms of known words are left out of the levels, verbs of their own are not', () => {
  const {levels} = load(PACKS[0]);
  const cet4 = new Set(levels.cet4), basic = new Set(levels.basic);
  for (const w of ['driving', 'existing', 'making']) assert.ok(!cet4.has(w), w);
  assert.ok(basic.has('fell'));  // "fell" a tree, not only the past of "fall"
});
