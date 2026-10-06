const test = require('node:test');
const assert = require('node:assert');
const {LEVELS, DEFAULT_LEVEL, getLevel, listsFor, levelWords} = require('../levels.js');

test('levelWords subtracts known lists from learn lists', () => {
  const lists = {
    a: [['Apple', '苹果'], ['book', '书']],
    b: [['book', '书本'], ['cherry', '樱桃'], ['date', '日期']],
  };
  const level = {known: ['a'], learn: ['b']};
  assert.deepStrictEqual(levelWords(level, lists), [['cherry', '樱桃'], ['date', '日期']]);
  assert.deepStrictEqual(levelWords({known: [], learn: ['a', 'b']}, lists).map(w => w[0]), ['apple', 'book', 'cherry', 'date']);
});

test('function words are never highlighted at any level', () => {
  const lists = {a: [['The', '这'], ['will', '将'], ['storm', '风暴']]};
  assert.deepStrictEqual(levelWords({known: [], learn: ['a']}, lists), [['storm', '风暴']]);
});

test('default level exists and every level only uses bundled lists', () => {
  assert.ok(getLevel(DEFAULT_LEVEL));
  for (const level of LEVELS) {
    for (const name of listsFor(level)) require(`../words/${name}.json`);
  }
});

test('levels on the real lists: sizes and no overlap with known words', () => {
  const lists = {};
  for (const name of new Set(LEVELS.flatMap(listsFor))) lists[name] = require(`../words/${name}.json`);
  const sizes = {};
  for (const level of LEVELS) {
    const words = levelWords(level, lists);
    sizes[level.id] = words.length;
    const known = new Set(level.known.flatMap(n => lists[n].map(w => w[0].trim().toLowerCase())));
    assert.ok(words.every(([w, d]) => !known.has(w) && d), level.id);
  }
  assert.deepStrictEqual(sizes, {basic: 5546, cet4: 1177, cet6: 4306, gre: sizes.gre});
  assert.ok(sizes.gre > 1000, `gre: ${sizes.gre}`);
});
