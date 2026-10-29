// Real DOM/Range/Highlight/Popover regression tests. No npm dependencies.
const {spawn} = require('node:child_process');
const {mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const prepare = process.argv.includes('--prepare');
const root = path.resolve(__dirname, '..');
const chrome = [process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  .find(p => p && existsSync(p));
if(!prepare && !chrome) throw new Error('Set CHROME_BIN to a Chrome/Chromium executable.');
const temp = mkdtempSync(path.join(tmpdir(), 'lexibridge-browser-'));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Real time, not --virtual-time-budget: virtual time produces no frames, so
// requestAnimationFrame and ResizeObserver never run. Results are polled over
// the DevTools protocol.
async function run(url) {
  const proc = spawn(chrome, ['--headless', '--disable-gpu', '--disable-extensions',
    '--disable-background-networking', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${path.join(temp, 'profile')}`, '--remote-debugging-port=0', url],
    {stdio:['ignore','ignore','pipe']});
  const exited = new Promise(resolve => proc.on('exit', resolve));
  try {
    const port = await new Promise((resolve, reject) => {
      let log = '';
      proc.stderr.on('data', d => { log += d; const m = log.match(/ws:\/\/[^:]+:(\d+)\//); if(m) resolve(m[1]); });
      exited.then(() => reject(new Error('Chrome exited:\n' + log)));
    });
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let id = 0;
    const evaluate = expression => new Promise(resolve => {
      const call = ++id;
      ws.onmessage = e => { const m = JSON.parse(e.data); if(m.id === call) resolve(m.result?.result?.value); };
      ws.send(JSON.stringify({id: call, method: 'Runtime.evaluate', params: {expression, returnByValue: true}}));
    });
    for(const end = Date.now() + 60000; Date.now() < end; await wait(200)) {
      const text = await evaluate("document.getElementById('browser-results')?.textContent");
      if(text && text !== 'null') { ws.close(); return JSON.parse(text); }
    }
    return null;
  } finally {
    proc.kill();
    await exited;
  }
}

(async() => {
try {
  const messages = JSON.parse(readFileSync(path.join(root, '_locales/zh_CN/messages.json'), 'utf8'));
  const bootstrap = `
    const testChrome = {
      data: {words: [['abrupt','adj. sudden'],['humidity','n. moisture'],['vulnerable','adj. exposed']], knownCount: 0},
      changes: [], messages: [], lookupDelay: 0, failWrite: false,
      async send(request) {
        if(request.action === 'band') return {};
        if(request.action === 'lookup') {
          await new Promise(r => setTimeout(r, this.lookupDelay));
          return {word: request.data.word.toLowerCase(), definition: 'n. selected word'};
        }
        return new Promise(resolve => {
          let waiting = false, replied = false;
          for(const listener of this.messages) {
            if(listener(request, {tab: {id: 1}}, value => { replied = true; resolve(value); }) === true) waiting = true;
          }
          if(!waiting && !replied) resolve({});
        });
      }
    };
    Object.assign(window.chrome ||= {}, {
      i18n: {getUILanguage: () => 'zh-CN', getMessage: (key, subs = []) => {
        let text = (${JSON.stringify(messages)})[key]?.message ?? key;
        subs.forEach((s, i) => { text = text.replaceAll('$' + (i + 1), s); });
        return text;
      }},
      storage: {
        local: {
          get: async keys => Object.fromEntries(keys.filter(k => k in testChrome.data).map(k => [k, structuredClone(testChrome.data[k])])),
          set: async patch => {
            if(testChrome.failWrite) { testChrome.failWrite = false; throw new Error('Simulated storage failure'); }
            const changes = Object.fromEntries(Object.entries(patch).map(([k,v]) => [k, {oldValue: testChrome.data[k], newValue: structuredClone(v)}]));
            Object.assign(testChrome.data, structuredClone(patch));
            testChrome.changes.forEach(fn => fn(changes, 'local'));
          }
        },
        onChanged: {addListener: fn => testChrome.changes.push(fn)}
      },
      runtime: {sendMessage: request => testChrome.send(request),
        onMessage: {addListener: fn => testChrome.messages.push(fn)},
        onInstalled: {addListener() {}}, getURL: p => p},
      action: {setBadgeBackgroundColor() {}, setBadgeTextColor() {}, setBadgeText() {}},
      tts: {speak() {}},
    });
    function importScripts() {}
    window.browserErrors = [];
    window.addEventListener('error', e => browserErrors.push(e.message));
    window.addEventListener('unhandledrejection', e => browserErrors.push(String(e.reason)));
  `;
  const scripts = ['engines/en-irregular.js','lexicon.js','packs.js','review.js','i18n.js','background.js','ui.js','script.js','test/browser.js'];
  const html = `<!doctype html><meta charset="utf-8"><title>LexiBridge browser regression</title>
    <style>body{margin:40px;font:18px/1.8 sans-serif}#feed{max-width:620px}p{margin:12px 0}</style>
    <div id="feed"><p id="first">abrupt humidity</p></div>
    <script>${bootstrap}</script>
    ${scripts.map(p => `<script src="${pathToFileURL(path.join(root, p))}"></script>`).join('\n')}
    <script id="browser-results" type="application/json">null</script>`;
  const file = path.join(temp, 'index.html');
  writeFileSync(file, html);
  if(prepare) { console.log(pathToFileURL(file).href); return; }
  const result = await run(pathToFileURL(file).href);
  if(!result) throw new Error('Browser tests did not finish.');
  for(const test of result.tests) console.log(`${test.pass ? 'PASS' : 'FAIL'} ${test.name}${test.error ? ': ' + test.error : ''}`);
  if(result.errors.length) console.error(result.errors);
  console.log(`${result.tests.filter(t => t.pass).length}/${result.tests.length} browser checks passed`);
  if(result.tests.some(t => !t.pass) || result.errors.length) process.exitCode = 1;
} finally {
  if(!prepare) rmSync(temp, {recursive:true, force:true, maxRetries:3});
}
})().catch(error => { console.error(error); process.exitCode = 1; });
