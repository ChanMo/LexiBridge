// Homepage demo: the extension's word card, without the extension.
// Definitions are copied from the word lists bundled with LexiBridge.
(() => {
  const DEFS = {
    abrupt: ['əˈbrʌpt', 'adj.', ['突然的，出其不意的', '陡峭的', '粗鲁的，无礼的']],
    humidity: ['hjuːˈmɪdətɪ', 'n.', ['湿度，湿气']],
    vulnerable: ['ˈvʌlnərəbl', 'adj.', ['易受攻击的，有弱点的', '(指人)易受伤害的，脆弱的']],
    fluctuate: ['ˈflʌktʃʊeɪt', 'v.', ['波动，变动，涨落']],
    ambiguous: ['æmˈbɪɡjʊəs', 'adj.', ['模棱两可的，意义不明确的']],
  };
  const demo = document.getElementById('demo');
  if (!demo) return;
  let card = null;

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text) e.textContent = text;
    return e;
  }

  function close() {
    card?.remove();
    card = null;
  }

  function show(word) {
    close();
    const [phonetic, pos, senses] = DEFS[word.dataset.w];
    card = el('div', 'card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', word.dataset.w);
    const head = el('div', 'head');
    head.append(el('div', 'word', word.dataset.w), el('div', 'ph', `/${phonetic}/`));
    const body = el('div', 'body');
    const list = el('ol');
    senses.forEach(s => list.appendChild(el('li', '', s)));
    body.append(el('span', 'pos', pos), list);
    const foot = el('div', 'foot');
    const known = el('button', '', '✓ 认识了');
    known.type = 'button';
    known.addEventListener('click', () => {
      word.classList.add('known');
      word.disabled = true;
      close();
    });
    foot.appendChild(known);
    card.append(head, body, foot);
    demo.appendChild(card);
    const d = demo.getBoundingClientRect(), r = word.getBoundingClientRect();
    card.style.top = `${r.bottom - d.top + 8}px`;
    card.style.left = `${Math.max(0, Math.min(r.left - d.left - 40, d.width - card.offsetWidth))}px`;
    demo.querySelector('.hint')?.remove();
  }

  demo.addEventListener('click', (e) => {
    const word = e.target.closest('.w');
    if (word && !word.classList.contains('known')) show(word);
    else if (!e.target.closest('.card')) close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.addEventListener('click', (e) => { if (!demo.contains(e.target)) close(); });
})();
