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
  assert.deepStrictEqual(legacy.lists, {basic: 'd4383b45', cet4: '76dcd4a1', cet6: 'a24d4a8b', gre: 'c0d06f2d'});
});

test('an unchanged v1.3 starting list is replaced with the new level list', async() => {
  const words = [['Abandon', OLD], ['study', 'v.学']];
  const legacy = {lists: {cet4: listHash(['abandon', 'study'])}, rows: new Set()};
  const changes = await upgrade({words, level: 'cet4'}, data, legacy, 1);
  assert.deepStrictEqual(changes.words, [['abandon', dict.get('abandon')], ['zeal', 'n. 热心']]);
  assert.deepStrictEqual(changes.backup_v13, {words, level: 'cet4', at: 1});
  // Done once: the new list no longer matches.
  assert.deepStrictEqual(await upgrade({...changes, level: 'cet4'}, data, legacy), {});
  // Another level, or a list the learner changed, is left to the definition refresh.
  assert.deepStrictEqual(await upgrade({words, level: 'gre'}, data, legacy), {});
  assert.deepStrictEqual(await upgrade({words: words.slice(1), level: 'cet4'}, data, legacy), {});
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
