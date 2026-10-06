const test = require('node:test');
const assert = require('node:assert');
const {isWord, normalizeWord, buildDictionary, lookup, findMatches} = require('../lexicon.js');

const dict = buildDictionary([
  ['a', 'art. 一'],
  ['abandon', 'v. 放弃'],
  ['study', 'v. 学习'],
  ['make', 'v. 做'],
  ['stop', 'v. 停止'],
  ['box', 'n. 盒子'],
  ['well-known', 'adj. 著名的'],
  ['esteem', 'n. 尊重'],
  ['teacher', 'n. 教师'],
]);

const words = (text) => findMatches(text, dict).map(m => text.slice(m.start, m.end) + '=' + m.word);

test('normalizeWord strips BOM, curly quotes and case', () => {
  assert.strictEqual(normalizeWord('\uFEFFA'), 'a');
  assert.strictEqual(normalizeWord(' Don\u2019t '), "don't");
});

test('isWord accepts one word, rejects phrases and junk', () => {
  for (const ok of ['Abandoned', 'well-known', "don't", 'teacher\u2019s']) assert.ok(isWord(ok), ok);
  for (const bad of ['two words', 'abc1', '', '-x', 'a.b', 'x'.repeat(41)]) assert.ok(!isWord(bad), bad);
});

test('buildDictionary keeps the first definition and skips bad rows', () => {
  const d = buildDictionary([['Word', '1'], ['word', '2'], [null, 'x'], 'junk', ['', 'empty']]);
  assert.deepStrictEqual([...d], [['word', '1']]);
});

test('matches words next to punctuation', () => {
  assert.deepStrictEqual(words('Abandon! (study), stop.'), ['Abandon=abandon', 'study=study', 'stop=stop']);
});

test('offsets point at each occurrence, not the first substring', () => {
  const text = 'the cat sat on a mat. a dog';
  const ms = findMatches(text, dict);
  assert.deepStrictEqual(ms.map(m => m.start), [15, 22]);
  assert.ok(ms.every(m => text.slice(m.start, m.end) === 'a'));
});

test('inflected forms map to the base word', () => {
  assert.strictEqual(lookup(dict, 'studies'), 'study');
  assert.strictEqual(lookup(dict, 'studied'), 'study');
  assert.strictEqual(lookup(dict, 'abandoned'), 'abandon');
  assert.strictEqual(lookup(dict, 'abandons'), 'abandon');
  assert.strictEqual(lookup(dict, 'making'), 'make');
  assert.strictEqual(lookup(dict, 'stopped'), 'stop');
  assert.strictEqual(lookup(dict, 'stopping'), 'stop');
  assert.strictEqual(lookup(dict, 'boxes'), 'box');
  assert.strictEqual(lookup(dict, 'cat'), null);
});

test('hyphenated words match whole, or by part when unknown', () => {
  assert.deepStrictEqual(words('a well-known name'), ['a=a', 'well-known=well-known']);
  assert.deepStrictEqual(words('self-esteem'), ['esteem=esteem']);
});

test('possessives and contractions match the word before the apostrophe', () => {
  assert.deepStrictEqual(words('the teacher\u2019s desk'), ['teacher\u2019s=teacher']);
  assert.deepStrictEqual(words("a teacher'll"), ['a=a', 'teacher=teacher']);
});

test('bundled word lists have no BOM or blank keys', () => {
  for (const name of ['CET4_edited', 'CET6_edited', 'GRE_8000_Words', 'GRE_abridged', 'OALD8_abridged_edited']) {
    const rows = require(`../words/${name}.json`);
    for (const [key] of rows) {
      assert.ok(key.trim() && !key.startsWith('\uFEFF'), `${name}: ${JSON.stringify(key)}`);
    }
    assert.ok(buildDictionary(rows).size > 0);
  }
});
