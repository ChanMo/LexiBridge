const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function worker(words) {
  let listener, failWrite = false;
  const data = {words, knownCount:0};
  const context = vm.createContext({
    importScripts() {},
    LexiBridge: require('../lexicon.js'),
    LexiBridgeReview: require('../review.js'),
    LexiBridgePacks: {},
    chrome: {
      action: {setBadgeBackgroundColor() {}, setBadgeTextColor() {}},
      runtime: {onInstalled: {addListener() {}}, onMessage: {addListener(fn) { listener = fn; }}},
      storage: {local: {
        async get(keys) {
          // Yield between read and write to expose concurrent lost updates.
          await new Promise(resolve => setImmediate(resolve));
          return Object.fromEntries(keys.filter(k => k in data).map(k => [k, structuredClone(data[k])]));
        },
        async set(patch) {
          if(failWrite) { failWrite = false; throw new Error('Storage unavailable'); }
          await new Promise(resolve => setImmediate(resolve));
          Object.assign(data, structuredClone(patch));
        }
      }}
    }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), context);
  return {
    data,
    fail() { failWrite = true; },
    send: change => new Promise(resolve => listener({action:'change-word',data:change}, {}, response => resolve(structuredClone(response))))
  };
}

test('simultaneous page removals preserve both changes and counts', async() => {
  const w = worker([['abrupt','sudden'],['humidity','moisture'],['vulnerable','exposed']]);
  const results = await Promise.all([
    w.send({op:'remove',word:'abrupt',markKnown:true}),
    w.send({op:'remove',word:'humidity',markKnown:true})
  ]);
  assert.ok(results.every(r=>r.ok && r.result.changed));
  assert.deepEqual(w.data.words, [['vulnerable','exposed']]);
  assert.equal(w.data.knownCount, 2);
});

test('duplicate known clicks and undo count only once', async() => {
  const w = worker([['abrupt','sudden']]);
  const [first, second] = await Promise.all([
    w.send({op:'remove',word:'abrupt',markKnown:true}),
    w.send({op:'remove',word:'abrupt',markKnown:true})
  ]);
  assert.equal(first.result.changed, true);
  assert.equal(second.result.changed, false);
  assert.equal(w.data.knownCount, 1);
  await Promise.all([w.send({op:'restore',...first.result}), w.send({op:'restore',...first.result})]);
  assert.deepEqual(w.data.words, [['abrupt','sudden']]);
  assert.equal(w.data.knownCount, 0);
});

test('undo preserves additions made in another page', async() => {
  const w = worker([['abrupt','sudden'],['humidity','moisture']]);
  const removed = await w.send({op:'remove',word:'abrupt',markKnown:true});
  await w.send({op:'add',word:'Vulnerable',definition:'exposed'});
  await w.send({op:'restore',...removed.result});
  assert.deepEqual(w.data.words.map(row=>row[0]).sort(), ['abrupt','humidity','vulnerable']);
  assert.equal(w.data.knownCount, 0);
});

test('storage failure keeps data intact and does not poison the queue', async() => {
  const w = worker([['abrupt','sudden']]);
  w.fail();
  const failed = await w.send({op:'remove',word:'abrupt',markKnown:true});
  assert.equal(failed.ok, false);
  assert.equal(w.data.words.length, 1);
  assert.equal(w.data.knownCount, 0);
  const retry = await w.send({op:'remove',word:'abrupt',markKnown:true});
  assert.equal(retry.ok, true);
  assert.equal(w.data.words.length, 0);
  assert.equal(w.data.knownCount, 1);
});

test('invalid operations cannot write malformed rows', async() => {
  const w = worker([]);
  for(const change of [
    {op:'add',word:'two words',definition:'invalid'},
    {op:'add',word:'valid',definition:''},
    {op:'restore',row:['valid',null]},
    {op:'unknown',word:'valid'}
  ]) assert.equal((await w.send(change)).ok, false);
  assert.deepEqual(w.data.words, []);
});
