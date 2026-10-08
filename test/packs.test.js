const test = require('node:test');
const assert = require('node:assert');
const {COMMON_WORDS} = require('../lexicon.js');
const {PACKS, getPack, getLevel, levelWords} = require('../packs.js');
const IRREGULAR = require('../engines/en-irregular.js');

const load = (pack) => ({
  dict: new Map(Object.entries(require(`../packs/${pack.id}/dict.json`))),
  levels: require(`../packs/${pack.id}/levels.json`),
});

// Generated level sizes; a rebuild that moves one by more than 5% needs a look.
const SIZES = {'en-zh-Hans': {basic: 3725, cet4: 1741, ky: 2045, cet6: 3571, gre: 3385}};

test('missing or unknown pack ids fall back to the first pack', () => {
  assert.strictEqual(getPack(undefined), PACKS[0]);
  assert.strictEqual(getPack('nope'), PACKS[0]);
  assert.strictEqual(getLevel(undefined, 'cet4').name, '大学四级');
  assert.strictEqual(getLevel(undefined, 'nope'), undefined);
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
  });

  test(`${pack.id}: dictionary keys are clean and words with meanings of their own are kept`, () => {
    const {dict} = load(pack);
    for (const key of dict.keys()) assert.match(key, /^[a-z]+(?:['-][a-z]+)*$/);
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
