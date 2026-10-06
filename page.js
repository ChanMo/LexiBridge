// Shared helpers for the extension pages (word list, English level, blocked sites).
const Page = (() => {
  function el(tag, className, text) {
    const e = document.createElement(tag);
    if(className) e.className = className;
    if(text != null) e.textContent = text;
    return e;
  }

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `icons/ui.svg#${name}`);
    svg.appendChild(use);
    return svg;
  }

  // Wraps the first match of `query` in <mark>, case-insensitively.
  function highlighted(text, query) {
    const frag = document.createDocumentFragment();
    const i = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
    if(i < 0) {
      frag.append(text);
      return frag;
    }
    frag.append(text.slice(0, i), el('mark', '', text.slice(i, i + query.length)), text.slice(i + query.length));
    return frag;
  }

  // One line, dictionary style: "adj. 突然的；陡峭的   n. ..."
  function definition(text, query) {
    const {groups} = LexiBridge.parseDefinition(text);
    const line = el('div', 'def');
    for(const g of groups) {
      if(g.pos) line.appendChild(el('span', 'pos', g.pos));
      line.appendChild(highlighted(g.senses.join('；'), query));
    }
    return line;
  }

  let toastBox = null, toastTimer = null;
  function toast(message, actionLabel, onAction) {
    toastBox?.remove();
    clearTimeout(toastTimer);
    toastBox = el('div', 'toast');
    toastBox.setAttribute('role', 'status');
    toastBox.appendChild(el('span', '', message));
    if(actionLabel) {
      const b = el('button', '', actionLabel);
      b.type = 'button';
      b.addEventListener('click', () => { toastBox?.remove(); onAction(); });
      toastBox.appendChild(b);
    }
    document.body.appendChild(toastBox);
    const box = toastBox;
    toastTimer = setTimeout(() => box.remove(), 5000);
  }

  // A popover menu toggled by `button`, right-aligned under it. Placed in
  // beforetoggle so its first frame is already in the right spot.
  function menu(button, popover) {
    button.popoverTargetElement = popover;
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    popover.addEventListener('beforetoggle', (e) => {
      const open = e.newState === 'open';
      button.setAttribute('aria-expanded', open);
      if(!open) return;
      const r = button.getBoundingClientRect();
      const width = parseFloat(getComputedStyle(popover).width);
      popover.style.top = `${r.bottom + 6}px`;
      popover.style.left = `${Math.max(8, r.right - width)}px`;
    });
    popover.addEventListener('toggle', (e) => {
      if(e.newState === 'open') popover.querySelector('button:not(:disabled)')?.focus();
    });
    popover.addEventListener('click', (e) => {
      if(e.target.closest('button')) popover.hidePopover();
    });
  }

  // Sidebar, shared by every page; <body data-page="..."> marks the current one.
  const PAGES = [['words', 'options.html', '单词库', 'book'], ['level', 'level.html', '英语水平', 'level'],
    ['blocked', 'blacklist.html', '禁用网站', 'block']];
  function sidebar() {
    const side = document.querySelector('aside.side');
    if(!side) return;
    const brand = el('a', 'brand');
    brand.href = 'options.html';
    const logo = el('img');
    logo.src = 'icon.png';
    logo.alt = '';
    brand.append(logo, 'LexiBridge');
    const nav = el('nav', 'nav');
    nav.setAttribute('aria-label', '页面');
    for(const [id, href, label, iconName] of PAGES) {
      const a = el('a');
      a.href = href;
      a.append(icon(iconName), el('span', '', label));
      if(document.body.dataset.page === id) a.setAttribute('aria-current', 'page');
      nav.appendChild(a);
    }
    const foot = el('div', 'side-foot');
    for(const [href, label] of [['https://chanmo.github.io/LexiBridge/', '帮助'], ['https://github.com/ChanMo/LexiBridge/issues', '反馈']]) {
      const a = el('a', '', label);
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener';
      foot.appendChild(a);
    }
    foot.appendChild(el('span', 'version', `v${chrome.runtime.getManifest().version}`));
    side.replaceChildren(brand, nav, foot);
  }
  sidebar();

  return {el, icon, definition, highlighted, toast, menu};
})();
