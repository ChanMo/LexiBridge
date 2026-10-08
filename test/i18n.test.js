const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const locales = fs.readdirSync(path.join(root, '_locales'));
const messages = Object.fromEntries(locales.map(l => [l, JSON.parse(read(`_locales/${l}/messages.json`))]));
const keys = Object.keys(messages.zh_CN);

const scripts = fs.readdirSync(root).filter(f => f.endsWith('.js'));
const pages = fs.readdirSync(root).filter(f => f.endsWith('.html'));
const code = (file) => read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '');
const sources = [...scripts.map(code), ...[...pages, 'manifest.json'].map(read)].join('\n');

const CJK = /[\u3040-\u30ff\u3400-\u9fff]/;
const placeholders = (message) => [...message.matchAll(/\$\d/g)].map(m => m[0]).sort().join();

test('every locale has the same keys and placeholders', () => {
  for (const [locale, m] of Object.entries(messages)) {
    assert.deepStrictEqual(Object.keys(m).sort(), [...keys].sort(), locale);
    for (const key of keys) assert.strictEqual(placeholders(m[key].message), placeholders(messages.zh_CN[key].message), `${locale}: ${key}`);
  }
});

test('keys used in code and pages exist, and every key is used', () => {
  const used = new Set([
    ...[...sources.matchAll(/'((?:common|card|popup|page|words|level|blocked)_\w+)'/g)].map(m => m[1]),
    ...[...sources.matchAll(/data-i18n="(\w+)"/g)].map(m => m[1]),
    ...[...sources.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap(m => m[1].split(';').map(p => p.split(':')[1])),
    ...[...sources.matchAll(/__MSG_(\w+)__/g)].map(m => m[1]),
  ]);
  for (const key of used) assert.ok(keys.includes(key), `missing message: ${key}`);
  for (const key of keys) assert.ok(used.has(key), `unused message: ${key}`);
});

test('no hard-coded UI text left in scripts', () => {
  // packs.js holds level names, written in each pack's own language.
  for (const file of scripts.filter(f => f !== 'packs.js')) {
    const line = code(file).split('\n').find(l => CJK.test(l));
    assert.ok(!line, `${file}: ${line?.trim()}`);
  }
});

test('Chinese text in pages only stands in for data-i18n', () => {
  for (const file of pages) {
    const line = read(file).split('\n').find(l => CJK.test(l) && !/data-i18n="/.test(l));
    assert.ok(!line, `${file}: ${line?.trim()}`);
  }
});
