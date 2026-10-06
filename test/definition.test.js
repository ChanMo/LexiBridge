const test = require('node:test');
const assert = require('node:assert');
const {parseDefinition} = require('../lexicon.js');

test('phonetic, part of speech and numbered senses', () => {
  assert.deepStrictEqual(parseDefinition('[əˈbændən] v. 1. 抛弃，放弃 2. 离弃(家园、船只、飞机等)'), {
    phonetic: 'əˈbændən',
    groups: [{pos: 'v.', senses: ['抛弃，放弃', '离弃(家园、船只、飞机等)']}],
  });
});

test('several parts of speech, homograph number dropped', () => {
  const d = parseDefinition('1 [slɪp] n. 1. 滑，溜 2. 小过失 v. 1. 失足 2. 溜走');
  assert.strictEqual(d.phonetic, 'slɪp');
  assert.deepStrictEqual(d.groups.map(g => g.pos), ['n.', 'v.']);
  assert.deepStrictEqual(d.groups[1].senses, ['失足', '溜走']);
});

test('compound and long-form parts of speech are shortened', () => {
  assert.deepStrictEqual(parseDefinition('[wɔt∫] vt.&vi.观看 n.手表').groups.map(g => g.pos), ['vt.&vi.', 'n.']);
  assert.deepStrictEqual(parseDefinition("[ə'bændən] v./n.放弃；放纵").groups[0], {pos: 'v./n.', senses: ['放弃；放纵']});
  assert.strictEqual(parseDefinition('[ˈwiləui] a. 苗条的').groups[0].pos, 'adj.');
  assert.strictEqual(parseDefinition('[ˈpriːvjuːsli] ad.先前').groups[0].pos, 'adv.');
  assert.deepStrictEqual(parseDefinition('[ˈtʊtsɪz] noun (informal)腳趾').groups[0], {pos: 'n.', senses: ['(informal)腳趾']});
});

test('free text falls back to a single sense', () => {
  assert.deepStrictEqual(parseDefinition('自定义释义'), {phonetic: null, groups: [{pos: null, senses: ['自定义释义']}]});
  assert.deepStrictEqual(parseDefinition(''), {phonetic: null, groups: []});
  assert.strictEqual(parseDefinition('[] n. 空').phonetic, null);
});
