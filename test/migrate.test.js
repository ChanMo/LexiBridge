const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const {legacyHash, upgrade} = require('../migrate.js');

const OLD = '[əˈbændən] vt.丢弃；放弃，抛弃';  // abandon in the v1.3 CET4 list
const dict = new Map([['abandon', '[ə\'bændən] vt. 放弃'], ['study', 'v. 学习'], ['zeal', 'n. 热心']]);
const data = {dict, levels: {cet4: ['abandon', 'zeal']}};
const listHash = (words) => crypto.createHash('sha1').update(words.join('\n')).digest('hex').slice(0, 8);

test('hashes match the ones tools/build_packs.py wrote', async() => {
  const legacy = require('../packs/legacy-v13.json');
  assert.strictEqual(await legacyHash('abandon', OLD), 'c12c0868');
  assert.ok(new Set(legacy.rows).has('c12c0868'));
  // v1.3 starting lists, checked against its levels.js once.
  const lists = Object.fromEntries(Object.entries(legacy.lists).map(([id, words]) => [id, listHash(words)]));
  assert.deepStrictEqual(lists, {basic: 'd4383b45', cet4: '76dcd4a1', cet6: 'a24d4a8b', gre: 'c0d06f2d'});
});

test('a v1.3 list moves to the new level list, keeping what the learner changed', async() => {
  const legacy = {lists: {cet4: ['abandon', 'study', 'oust']}, rows: new Set([await legacyHash('abandon', OLD), await legacyHash('study', 'v.学')])};
  // oust was taken out, zebra added.
  const words = [['Abandon', OLD], ['study', 'v.学'], ['zebra', '斑马']];
  const levels = {cet4: ['abandon', 'oust', 'zeal']};
  const changes = await upgrade({words, level: 'cet4'}, {dict, levels}, legacy, 1);
  assert.deepStrictEqual(changes.words, [['Abandon', dict.get('abandon')], ['zebra', '斑马'], ['zeal', 'n. 热心']]);
  assert.deepStrictEqual(changes.known, ['oust']);
  assert.deepStrictEqual(changes.backup_v13, {words, level: 'cet4', at: 1});
  // Done once.
  assert.deepStrictEqual(await upgrade({...changes, level: 'cet4'}, {dict, levels}, legacy), {});
  // Another level only gets the definitions.
  const other = await upgrade({words, level: 'nope'}, {dict, levels}, legacy, 1);
  assert.deepStrictEqual(other.words, [['Abandon', dict.get('abandon')], ['study', 'v. 学习'], ['zebra', '斑马']]);
  // A list started after v1.3 has no old definitions and is left alone.
  assert.deepStrictEqual(await upgrade({words: [['abandon', dict.get('abandon')]], level: 'cet4'}, {dict, levels}, legacy), {});
});

test('bundled definitions are refreshed, edited and unknown ones kept, backup written once', async() => {
  const legacy = {lists: {}, rows: new Set([await legacyHash('abandon', OLD), await legacyHash('study', 'v.学')])};
  const words = [['Abandon', OLD], ['study', '我改过'], ['zebra', '斑马'], 'junk'];
  const changes = await upgrade({words, level: 'cet4'}, data, legacy, 1);
  assert.deepStrictEqual(changes.words, [['Abandon', dict.get('abandon')], ['study', '我改过'], ['zebra', '斑马'], 'junk']);
  assert.deepStrictEqual(changes.backup_v13, {words, level: 'cet4', at: 1});

  // Running again changes nothing; an existing backup is never replaced.
  assert.deepStrictEqual(await upgrade({...changes, level: 'cet4'}, data, legacy), {});
  const again = await upgrade({words, backup_v13: changes.backup_v13}, data, legacy, 2);
  assert.strictEqual(again.backup_v13.at, 1);
});

test('nothing to do without words, with corrupt words or without old definitions', async() => {
  const legacy = {lists: {}, rows: new Set([await legacyHash('abandon', OLD)])};
  assert.deepStrictEqual(await upgrade({}, data, legacy), {});
  assert.deepStrictEqual(await upgrade({words: 'oops', level: 'cet4'}, data, legacy), {});
  assert.deepStrictEqual(await upgrade({words: [['abandon', '自己写的']]}, data, legacy), {});
  // Stored level names are not looked up on Object.prototype.
  const none = {lists: {}, rows: new Set()};
  assert.deepStrictEqual(await upgrade({words: [['abandon', OLD]], level: 'constructor'}, data, none), {});
});
