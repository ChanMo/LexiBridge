// In-page UI: the word card, the "add word" pill and the undo toast.
// Rendered in a shadow root so the page's styles cannot leak in.
const LexiBridgeUI = (() => {
  const {t} = LexiBridgeI18n;
  const ICONS = {
    speak: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z',
    check: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
    add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  };

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    /* Brand: ink (#1f2a44) and highlighter gold (#f5b83d) on paper. */
    .lb {
      --bg: #fffdf8;
      --fg: #1f2a44;
      --muted: #5f6577;
      --line: rgba(31, 42, 68, 0.12);
      --accent: #8a5a00;
      --accent-soft: rgba(245, 184, 61, 0.22);
      --primary: #1f2a44;
      --on-primary: #ffffff;
      --marker: #f5b83d;
      --focus: #c98400;
      --hover: rgba(31, 42, 68, 0.06);
      --shadow: 0 12px 32px rgba(24, 34, 61, 0.18), 0 2px 6px rgba(24, 34, 61, 0.08);
      --toast-bg: #1f2a44;
      --toast-fg: #f7f1e3;
      --toast-accent: #f5b83d;
      font: 14px/1.6 var(--sans);
      color: var(--fg);
      -webkit-font-smoothing: antialiased;
    }
    @media (prefers-color-scheme: dark) {
      .lb {
        --bg: #1b2236;
        --fg: #ece8df;
        --muted: #a7adbd;
        --line: rgba(236, 232, 223, 0.12);
        --accent: #f5b83d;
        --accent-soft: rgba(245, 184, 61, 0.16);
        --primary: #f5b83d;
        --on-primary: #1b2236;
        --marker: #1b2236;
        --focus: #f5b83d;
        --hover: rgba(236, 232, 223, 0.08);
        --shadow: 0 12px 32px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3);
        --toast-bg: #f7f1e3;
        --toast-fg: #1f2a44;
        --toast-accent: #8a5a00;
      }
    }
    /* Chinese glyphs follow the language: the UI's on the card, the definitions' in its body. */
    .lb, :lang(zh-Hans), :lang(zh-CN) {
      --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB",
        "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
    }
    :lang(zh-Hant), :lang(zh-TW), :lang(zh-HK) {
      --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Microsoft JhengHei",
        "Noto Sans CJK TC", sans-serif;
    }
    [lang] { font-family: var(--sans); }
    [popover] {
      position: fixed;
      inset: auto;
      margin: 0;
      padding: 0;
      border: 0;
      overflow: visible;
      background: transparent;
    }
    button {
      font: inherit;
      color: inherit;
      margin: 0;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    button:focus-visible {
      outline: 2px solid var(--focus);
      outline-offset: 2px;
    }
    svg { width: 18px; height: 18px; fill: currentColor; flex: none; }

    /* Word card */
    .card {
      width: 340px;
      max-width: calc(100vw - 24px);
      background: var(--bg);
      border: 1px solid var(--line);
      border-radius: 14px;
      box-shadow: var(--shadow);
      animation: lb-in 140ms ease-out;
    }
    .head { padding: 16px 18px 10px; }
    .title { display: flex; align-items: center; gap: 6px; }
    .word {
      font: 600 24px/1.25 Georgia, "Times New Roman", serif;
      letter-spacing: 0.01em;
      overflow-wrap: anywhere;
    }
    .icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--muted);
    }
    .icon-btn:hover { background: var(--hover); color: var(--accent); }
    .sub { margin-top: 2px; font-size: 13px; color: var(--muted); }
    .sub .sep { margin: 0 6px; opacity: 0.6; }
    .sub:empty { display: none; }
    .sub .current { color: var(--accent); }
    .body {
      max-height: min(300px, 45vh);
      overflow-y: auto;
      padding: 2px 18px 14px;
    }
    .group { display: flex; gap: 10px; align-items: baseline; }
    .group + .group { margin-top: 8px; }
    .pos {
      flex: none;
      padding: 0 6px;
      border-radius: 5px;
      background: var(--accent-soft);
      color: var(--accent);
      font: 600 12px/20px ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    }
    .senses { margin: 0; padding: 0; list-style: none; flex: 1; }
    ol.senses { counter-reset: sense; }
    ol.senses li { counter-increment: sense; display: flex; gap: 6px; }
    ol.senses li::before {
      content: counter(sense);
      flex: none;
      min-width: 1em;
      color: var(--muted);
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }
    textarea:focus-visible {
      outline: none;
      border-color: var(--focus);
      box-shadow: 0 0 0 3px var(--accent-soft);
    }
    textarea {
      display: block;
      width: 100%;
      min-height: 76px;
      padding: 8px 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: transparent;
      color: inherit;
      font: inherit;
      resize: vertical;
    }
    .hint { margin-top: 6px; font-size: 12px; color: var(--muted); }
    .foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-height: 48px;
      padding: 6px 10px 6px 18px;
      border-top: 1px solid var(--line);
      font-size: 13px;
      color: var(--muted);
    }
    .foot .status { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); font-weight: 500; }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 32px;
      padding: 0 12px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      font-size: 13px;
      font-weight: 500;
      color: var(--fg);
    }
    .btn:hover { background: var(--hover); }
    .btn.primary { background: var(--primary); color: var(--on-primary); }
    .btn.primary:hover { filter: brightness(0.95); }
    .btn svg { width: 16px; height: 16px; }

    /* Add pill */
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      height: 30px;
      padding: 0 12px 0 8px;
      border: 0;
      border-radius: 15px;
      background: var(--primary);
      color: var(--on-primary);
      box-shadow: 0 4px 12px rgba(24, 34, 61, 0.25);
      font-size: 13px;
      font-weight: 500;
      white-space: nowrap;
      animation: lb-in 120ms ease-out;
    }
    .pill:hover { filter: brightness(0.95); }
    .pill svg { width: 16px; height: 16px; color: var(--marker); }

    /* Toast */
    .toast {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 8px 8px 16px;
      border-radius: 10px;
      background: var(--toast-bg);
      color: var(--toast-fg);
      box-shadow: var(--shadow);
      font-size: 13px;
      animation: lb-in 160ms ease-out;
    }
    .toast .btn { color: var(--toast-accent); }
    .toast .btn:hover { background: rgba(127, 127, 127, 0.18); }

    @keyframes lb-in {
      from { opacity: 0; transform: translateY(4px); }
    }
    @media (prefers-reduced-motion: reduce) {
      .card, .pill, .toast { animation: none; }
    }
  `;

  let root = null;
  function getRoot() {
    if(!root || !root.host.isConnected) {
      const host = document.createElement('lexibridge-ui');
      host.className = 'lexibridge-ui';
      document.documentElement.appendChild(host);
      root = host.attachShadow({mode: 'open'});
      const style = document.createElement('style');
      style.textContent = STYLE;
      root.appendChild(style);
    }
    return root;
  }

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if(className) e.className = className;
    if(text != null) e.textContent = text;
    return e;
  }

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICONS[name]);
    svg.appendChild(path);
    return svg;
  }

  function button(label, className, onClick, iconName) {
    const b = el('button', className);
    b.type = 'button';
    if(iconName) b.appendChild(icon(iconName));
    if(label) b.appendChild(document.createTextNode(label));
    b.addEventListener('click', onClick);
    return b;
  }

  // A popover in the top layer, wrapped so the theme variables apply.
  function layer(type, className) {
    const wrap = el('div', 'lb ' + className);
    wrap.lang = LexiBridgeI18n.lang;
    wrap.popover = type;
    getRoot().appendChild(wrap);
    return wrap;
  }

  // Place `box` next to the anchor rect: below it, or above when there is
  // more room there; centred on it and kept inside the viewport.
  function place(box, rect, prefer = 'below', gap = 8) {
    const w = box.offsetWidth, h = box.offsetHeight;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const below = vh - rect.bottom, above = rect.top;
    const fitsPreferred = prefer === 'below' ? below >= h + gap : above >= h + gap;
    const side = fitsPreferred ? prefer : (below >= above ? 'below' : 'above');
    const top = side === 'below' ? rect.bottom + gap : rect.top - h - gap;
    const left = rect.left + rect.width / 2 - w / 2;
    box.style.top = `${Math.max(8, Math.min(top, vh - h - 8))}px`;
    box.style.left = `${Math.max(12, Math.min(left, vw - w - 12))}px`;
  }

  function definitionBody(definition, lang) {
    const body = el('div', 'body');
    body.lang = lang;
    for(const g of LexiBridge.parseDefinition(definition).groups) {
      const row = el('div', 'group');
      if(g.pos) row.appendChild(el('span', 'pos', g.pos));
      const list = el(g.senses.length > 1 ? 'ol' : 'ul', 'senses');
      g.senses.forEach(s => list.appendChild(el('li', '', s)));
      row.appendChild(list);
      body.appendChild(row);
    }
    return body;
  }

  // Follows the anchor while the page scrolls.
  let current = null;
  window.addEventListener('scroll', () => {
    if(current?.box.isConnected) place(current.box, current.anchor());
  }, {capture: true, passive: true});

  // state: "known" (in the word list), "added" (just added) or "new"
  // (not in any list yet: ask for a definition).
  // lang: language of the definition, e.g. "zh-Hans".
  // band: a promise of the word's {band, current}, shown when it arrives.
  function showCard({word, surface, definition, lang, band, anchor, state, onKnown, onUndoAdd, onSave, onSpeak}) {
    current?.box.remove();
    const box = layer('auto', 'card');
    const head = el('div', 'head');
    const title = el('div', 'title');
    title.appendChild(el('div', 'word', word));
    const speak = button('', 'icon-btn', onSpeak, 'speak');
    speak.title = t('card_speak');
    speak.setAttribute('aria-label', t('card_speak'));
    title.appendChild(speak);
    head.appendChild(title);
    const sub = el('div', 'sub');
    const addSub = (text) => {
      if(sub.childNodes.length) sub.appendChild(el('span', 'sep', '·'));
      return sub.appendChild(el('span', '', text));
    };
    const {phonetic} = LexiBridge.parseDefinition(definition);
    if(phonetic) addSub(`/${phonetic}/`);
    if(surface && surface.toLowerCase() !== word) addSub(t('card_surface', surface));
    band?.then(({band, current} = {}) => {
      if(!band) return;
      const span = addSub(band);
      span.lang = lang;
      if(current) {
        span.className = 'current';
        span.title = t('card_bandCurrent');
      }
    }).catch(() => {});
    head.appendChild(sub);
    box.appendChild(head);

    const foot = el('div', 'foot');
    const close = () => box.hidePopover();
    if(state === 'new') {
      const body = el('div', 'body');
      const textarea = el('textarea');
      textarea.lang = lang;
      textarea.placeholder = t('common_notInDictionary');
      textarea.setAttribute('aria-label', t('common_definition'));
      body.appendChild(textarea);
      box.appendChild(body);
      const save = async() => {
	const value = textarea.value.trim();
	if(!value) return textarea.focus();
	await onSave(value);
	close();
      };
      textarea.addEventListener('keydown', (e) => {
	if(e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
      });
      foot.appendChild(el('span', '', t(navigator.platform.startsWith('Mac') ? 'common_saveShortcutMac' : 'common_saveShortcut')));
      foot.appendChild(button(t('common_addToList'), 'btn primary', save));
      box.appendChild(foot);
      requestAnimationFrame(() => textarea.focus());
    } else {
      box.appendChild(definitionBody(definition, lang));
      if(state === 'added') {
	const status = el('span', 'status');
	status.append(icon('check'), t('card_added'));
	foot.appendChild(status);
	foot.appendChild(button(t('common_undo'), 'btn', async() => { await onUndoAdd(); close(); }));
      } else {
	foot.appendChild(el('span', '', ''));
	const known = button(t('card_known'), 'btn', async() => { close(); await onKnown(); }, 'check');
	known.title = t('card_knownTitle');
	foot.appendChild(known);
      }
      box.appendChild(foot);
    }

    box.addEventListener('toggle', (e) => {
      if(e.newState === 'closed') {
	box.remove();
	if(current?.box === box) current = null;
      }
    });
    box.showPopover();
    current = {box, anchor};
    place(box, anchor());
    return box;
  }

  let pill = null;
  function showPill(rect, onClick) {
    hidePill();
    pill = layer('manual', 'pill-wrap');
    const b = button(t('common_addToList'), 'pill', () => { hidePill(); onClick(); }, 'add');
    // Keep the page selection while clicking.
    b.addEventListener('mousedown', (e) => e.preventDefault());
    pill.appendChild(b);
    pill.showPopover();
    place(pill, rect, 'above', 6);
  }
  function hidePill() {
    pill?.remove();
    pill = null;
  }

  let toastBox = null, toastTimer = null;
  function toast(message, actionLabel, onAction) {
    toastBox?.remove();
    clearTimeout(toastTimer);
    toastBox = layer('manual', 'toast-wrap');
    const t = el('div', 'toast');
    t.setAttribute('role', 'status');
    t.appendChild(el('span', '', message));
    if(actionLabel) {
      t.appendChild(button(actionLabel, 'btn', () => { toastBox?.remove(); onAction(); }));
    }
    toastBox.appendChild(t);
    toastBox.showPopover();
    const vw = document.documentElement.clientWidth;
    toastBox.style.left = `${(vw - toastBox.offsetWidth) / 2}px`;
    toastBox.style.top = `${window.innerHeight - toastBox.offsetHeight - 24}px`;
    const box = toastBox;
    toastTimer = setTimeout(() => box.remove(), 5000);
  }

  function closeAll() {
    current?.box.remove();
    current = null;
    hidePill();
    toastBox?.remove();
  }

  return {showCard, showPill, hidePill, toast, closeAll};
})();
