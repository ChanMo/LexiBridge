// Shared helpers for the extension pages (word list, level, blocked sites).
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

  // Compact definition: part-of-speech chips with numbered senses inline.
  function definition(text, query) {
    const {groups} = LexiBridge.parseDefinition(text);
    const box = el('div', 'def');
    for(const g of groups) {
      const row = el('div', 'group');
      if(g.pos) row.appendChild(el('span', 'pos', g.pos));
      const senses = el('span', 'senses');
      g.senses.forEach((s, i) => {
        if(g.senses.length > 1) senses.appendChild(el('span', 'n', `${i + 1}`));
        senses.appendChild(highlighted(s, query));
      });
      row.appendChild(senses);
      box.appendChild(row);
    }
    return box;
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

  // Sidebar, shared by every page; <body data-page="..."> marks the current one.
  const PAGES = [['words', 'options.html', '单词库', 'book'], ['level', 'level.html', '选择水平', 'level'],
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
      a.append(icon(iconName), label);
      if(document.body.dataset.page === id) a.setAttribute('aria-current', 'page');
      nav.appendChild(a);
    }
    const foot = el('div', 'side-foot');
    for(const [href, label, iconName] of [['https://chanmo.github.io/LexiBridge/', '使用帮助', 'help'],
      ['https://github.com/ChanMo/LexiBridge/issues', '反馈问题', 'bug']]) {
      const a = el('a');
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener';
      a.append(icon(iconName), label);
      foot.appendChild(a);
    }
    foot.appendChild(el('div', 'version', `v${chrome.runtime.getManifest().version}`));
    side.replaceChildren(brand, nav, foot);
  }
  sidebar();

  return {el, icon, definition, highlighted, toast};
})();
