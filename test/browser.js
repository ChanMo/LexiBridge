// Loaded by tools/check-browser.js in a real browser, with extension APIs
// stubbed. Production matching, UI and background word writes run unchanged.
(async() => {
  const tests = [];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const assert = (condition, message) => { if(!condition) throw new Error(message); };
  const until = async(fn, message) => {
    for(let i = 0; i < 100; i++) { if(await fn()) return; await wait(10); }
    throw new Error(message);
  };
  const test = async(name, fn) => {
    try { await fn(); tests.push({name, pass:true}); }
    catch(e) { tests.push({name, pass:false, error:e.message}); }
    LexiBridgeUI.closeAll();
    getSelection().removeAllRanges();
    await wait(0);
  };
  const ranges = () => [...CSS.highlights.get('lexibridge-underline')];
  const words = () => ranges().map(r => r.toString());
  const card = () => document.querySelector('lexibridge-ui')?.shadowRoot.querySelector('.card');
  const shadow = selector => document.querySelector('lexibridge-ui')?.shadowRoot.querySelector(selector);
  const point = (element, offset = 0, length = 6) => {
    const range = document.createRange();
    range.setStart(element.firstChild, offset);
    range.setEnd(element.firstChild, offset + length);
    const r = range.getBoundingClientRect();
    return {x:r.left + r.width / 2, y:r.top + r.height / 2};
  };
  const mouse = (element, type, pos = point(element), extra = {}) => {
    const options = {bubbles:true, composed:true, cancelable:true, clientX:pos.x, clientY:pos.y, button:0, ...extra};
    element.dispatchEvent(type.startsWith('pointer') ? new PointerEvent(type, {...options, pointerType:'mouse'}) : new MouseEvent(type, options));
  };
  const clickWord = element => { mouse(element,'pointerdown'); mouse(element,'click'); };
  const feed = document.getElementById('feed');
  const first = document.getElementById('first');

  await test('initial scan and editing/code exclusions', async() => {
    await until(() => words().length === 2, 'initial words not highlighted');
    const other = document.createElement('div');
    other.innerHTML = '<pre>abrupt</pre><div contenteditable="true">humidity</div><p hidden>vulnerable</p>';
    feed.append(other);
    await wait(150);
    assert(words().length === 2, 'excluded text was highlighted');
    other.remove();
  });
  await test('text node edited in place', async() => {
    first.firstChild.data = 'vulnerable';
    await until(() => words().join() === 'vulnerable', 'text edit kept stale matches');
    first.firstChild.data = 'abrupt humidity';
    await until(() => words().length === 2, 'original text not restored');
  });
  await test('removed node reinserted across observer batches', async() => {
    first.remove();
    await until(() => ranges().length === 0, 'removed ranges retained');
    feed.append(first);
    await until(() => words().length === 2, 'reinserted node was skipped');
  });
  await test('remove and reinsert in the same batch without duplicates', async() => {
    for(let i=0; i<30; i++) { first.remove(); feed.append(first); }
    await wait(150);
    assert(words().length === 2 && words().includes('abrupt'), 'same-batch remount lost or duplicated ranges');
  });
  await test('editable and hidden region toggles', async() => {
    first.contentEditable = 'true';
    await until(() => !ranges().length, 'editable range retained');
    first.contentEditable = 'false';
    await until(() => ranges().length === 2, 'unlocked text not rescanned');
    first.hidden = true;
    await until(() => !ranges().length, 'hidden range retained');
    first.hidden = false;
    await until(() => ranges().length === 2, 'visible text not rescanned');
  });
  await test('feed append, node reuse and bounded retained ranges', async() => {
    const post = document.createElement('p');
    feed.append(post);
    for(let i=0; i<20; i++) {
      post.textContent = i % 2 ? 'humidity' : 'vulnerable';
      await wait(70);
      assert(ranges().length === 3, 'reused post accumulated stale ranges');
    }
    post.remove();
    await until(() => ranges().length === 2, 'removed post retained matches');
  });
  await test('click card persists on pointer movement and closes on Escape', async() => {
    clickWord(first);
    assert(card(), 'click did not open card');
    mouse(document.body,'pointermove',{x:10,y:10});
    await wait(600);
    assert(card(), 'clicked card closed on pointer exit');
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert(!card(), 'Escape did not close card');
  });
  await test('site auto popover and focused input survive word card', async() => {
    const menu = document.createElement('div');
    menu.popover = 'auto';
    document.body.append(menu);
    menu.showPopover();
    // Programmatic card opening isolates popover coexistence from the site's
    // normal light-dismiss behavior on an outside user click.
    const input = document.createElement('input'); document.body.append(input); input.focus();
    const r = document.createRange(); r.selectNodeContents(first);
    LexiBridgeUI.showCard({word:'abrupt',definition:'adj. sudden',lang:'en',anchor:()=>r.getBoundingClientRect(),state:'known',onKnown(){},onSpeak(){}});
    assert(menu.matches(':popover-open'), 'extension closed site menu');
    assert(document.activeElement === input, 'card stole focus');
    menu.remove(); input.remove();
  });
  await test('card closes when source is edited or removed', async() => {
    clickWord(first);
    first.firstChild.data = 'vulnerable';
    await until(() => !card(), 'card retained stale source text');
    await until(() => words().join() === 'vulnerable', 'new source not highlighted');
    clickWord(first);
    assert(card(), 'changed source could not open card');
    first.remove();
    await until(() => !card(), 'card retained disconnected source');
    first.textContent = 'abrupt humidity'; feed.append(first);
    await until(() => ranges().length === 2, 'source did not recover');
  });
  await test('card repositions on resize and closes offscreen', async() => {
    clickWord(first);
    const box = card();
    const previous = box.style.top;
    first.style.marginTop = '80px';
    await wait(40);
    assert(card() && box.style.top !== previous, 'resize did not reposition');
    first.style.marginTop = '1500px';
    window.dispatchEvent(new Event('resize'));
    await until(() => !card(), 'offscreen anchor remained pinned');
    first.style.marginTop = '';
  });
  await test('hover preview crosses gap, switches words, preserves links', async() => {
    const link = document.createElement('a'); link.href = '#unchanged'; link.textContent = 'abrupt humidity'; feed.append(link);
    await until(() => ranges().length === 4, 'link not scanned');
    mouse(link,'pointermove');
    await until(() => !!card(), 'hover did not open preview');
    mouse(document.body,'pointermove',{x:10,y:10});
    await wait(100);
    mouse(card(),'pointermove',{x:10,y:10});
    await wait(350);
    assert(card(), 'card closed while crossing gap');
    mouse(link,'pointermove',point(link,7,8));
    await until(() => card()?.querySelector('.word').textContent === 'humidity', 'preview did not switch');
    let prevented;
    link.addEventListener('click', e => { prevented = e.defaultPrevented; e.preventDefault(); }, {once:true});
    mouse(link,'click');
    assert(prevented === false, 'extension swallowed link click');
    link.remove();
  });
  await test('focusable feed card keeps its click and supports hover', async() => {
    const post = document.createElement('article'); post.tabIndex = 0; post.textContent = 'abrupt'; feed.append(post);
    let siteClicks = 0; post.addEventListener('click', () => siteClicks++);
    await until(() => ranges().length === 3, 'feed card not scanned');
    mouse(post,'pointermove');
    await until(() => !!card(), 'feed card has no hover preview');
    mouse(post,'pointerdown'); mouse(post,'click');
    assert(siteClicks === 1 && !card(), 'extension intercepted feed navigation');
    post.remove();
  });
  await test('modifier clicks and selection do not open cards', async() => {
    mouse(first,'click',point(first),{ctrlKey:true});
    assert(!card(), 'modifier click opened card');
    const r = document.createRange(); r.selectNodeContents(first);
    getSelection().addRange(r);
    mouse(first,'click');
    assert(!card(), 'selection click opened card');
  });
  await test('known action writes immediately, undo restores once', async() => {
    clickWord(first);
    card().querySelector('.foot button').click();
    await until(() => testChrome.data.words.length === 2, 'known not saved');
    assert(testChrome.data.knownCount === 1, 'known count not updated');
    await until(() => !!shadow('.chip button'), 'undo not offered');
    shadow('.chip button').click();
    await until(() => testChrome.data.words.length === 3, 'undo did not restore');
    assert(testChrome.data.knownCount === 0, 'undo did not restore count');
    await until(() => ranges().length === 2, 'undo did not restore highlight');
  });
  await test('failed save remains retryable with visible feedback', async() => {
    clickWord(first);
    testChrome.failWrite = true;
    card().querySelector('.foot button').click();
    await until(() => !!shadow('.error'), 'save failure had no feedback');
    assert(testChrome.data.words.length === 3 && card(), 'failed save pretended success');
    assert(!card().querySelector('.foot button').disabled, 'failed action stayed disabled');
  });
  await test('pending hover cancelled by site disable', async() => {
    const link = document.createElement('a'); link.href='#'; link.textContent='abrupt'; feed.append(link);
    await wait(100); mouse(link,'pointermove');
    await chrome.storage.local.set({blocked:[location.hostname]});
    await wait(600);
    assert(!card() && ranges().length === 0, 'disabled site reopened hover');
    await chrome.storage.local.set({blocked:[]});
    link.remove();
    await until(() => ranges().length === 2, 'enable failed');
  });
  await test('late lookup cannot reopen UI after source removal', async() => {
    const p = document.createElement('p'); p.textContent='custom'; feed.append(p);
    const r = document.createRange(); r.selectNodeContents(p);
    getSelection().addRange(r);
    await wait(20);
    mouse(p,'mouseup',point(p));
    await until(() => !!shadow('.pill'), 'selection add button not shown');
    testChrome.lookupDelay = 200;
    shadow('.pill').click();
    p.remove();
    await wait(300);
    assert(!card() && !testChrome.data.words.some(([w])=>w==='custom'), 'late lookup reopened stale UI or added word');
    testChrome.lookupDelay = 0;
  });
  const result = {tests, errors:browserErrors};
  document.getElementById('browser-results').textContent = JSON.stringify(result);
  const report = document.createElement('pre'); report.id = 'report';
  report.textContent = JSON.stringify(result, null, 2); document.body.append(report);
})().catch(error => {
  document.getElementById('browser-results').textContent = JSON.stringify({
    tests:[{name:'browser harness',pass:false,error:error.message}], errors:browserErrors
  });
});
