const test = require('node:test');
const assert = require('node:assert');
const {legacyHash, upgrade} = require('../migrate.js');

const OLD = '[əˈbændən] vt.丢弃；放弃，抛弃';  // abandon in the v1.3 CET4 list
const dict = new Map([['abandon', '[ə\'bændən] vt. 放弃'], ['study', 'v. 学习']]);

test('hashes match the ones tools/build_packs.py wrote', async() => {
  assert.strictEqual(await legacyHash('abandon', OLD), 'c12c0868');
  assert.ok(new Set(require('../packs/legacy-v13.json')).has('c12c0868'));
});

test('bundled definitions are refreshed, edited and unknown ones kept, backup written once', async() => {
  const legacy = new Set([await legacyHash('abandon', OLD), await legacyHash('study', 'v.学')]);
  const words = [['Abandon', OLD], ['study', '我改过'], ['zebra', '斑马'], 'junk'];
  const changes = await upgrade({words, level: 'cet4'}, dict, legacy, 1);
  assert.deepStrictEqual(changes.words, [['Abandon', dict.get('abandon')], ['study', '我改过'], ['zebra', '斑马'], 'junk']);
  assert.deepStrictEqual(changes.backup_v13, {words, level: 'cet4', at: 1});

  // Running again changes nothing; an existing backup is never replaced.
  assert.deepStrictEqual(await upgrade({...changes, level: 'cet4'}, dict, legacy), {});
  const again = await upgrade({words, backup_v13: changes.backup_v13}, dict, legacy, 2);
  assert.strictEqual(again.backup_v13.at, 1);
});

test('nothing to do without words, with corrupt words or without old definitions', async() => {
  const legacy = new Set([await legacyHash('abandon', OLD)]);
  assert.deepStrictEqual(await upgrade({}, dict, legacy), {});
  assert.deepStrictEqual(await upgrade({words: 'oops'}, dict, legacy), {});
  assert.deepStrictEqual(await upgrade({words: [['abandon', '自己写的']]}, dict, legacy), {});
});
