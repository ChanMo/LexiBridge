// Homepage demo: the extension's word card, without the extension.
// Definitions are copied from the dictionaries bundled with LexiBridge
// (packs/en-zh-Hans, en-zh-Hant and en-ja), in the page's language.
// Japanese has no part of speech.
(() => {
  const DEFS = {
    'zh-CN': {
      abrupt: ["ə'brʌpt", 'adj.', ['突然的', '唐突的', '陡峭的']],
      humidity: ["hju:'miditi", 'n.', ['湿气', '潮湿', '湿度']],
      vulnerable: ["'vʌlnərəbl", 'adj.', ['易受伤害的', '有弱点的', '脆弱的']],
      fluctuate: ["'flʌktʃueit", 'vi.', ['变动', '起伏', '动摇']],
      ambiguous: ["æm'bigjuəs", 'adj.', ['不明确的', '模棱两可的']],
    },
    'zh-TW': {
      abrupt: ["ə'brʌpt", 'adj.', ['突然的', '唐突的', '陡峭的']],
      humidity: ["hju:'miditi", 'n.', ['溼氣', '潮溼', '溼度']],
      vulnerable: ["'vʌlnərəbl", 'adj.', ['易受傷害的', '有弱點的', '脆弱的']],
      fluctuate: ["'flʌktʃueit", 'vi.', ['變動', '起伏', '動搖']],
      ambiguous: ["æm'bigjuəs", 'adj.', ['不明確的', '模稜兩可的']],
    },
    'ja': {
      abrupt: ["ə'brʌpt", null, ['突然の']],
      humidity: ["hju:'miditi", null, ['湿気、湿度']],
      vulnerable: ["'vʌlnərəbl", null, ['(身体的に)傷つきやすい', '攻撃(非難)を受けやすい、批判(皮肉など)に傷つきやすい']],
      fluctuate: ["'flʌktʃueit", null, ['動揺する、変動する、上下する']],
      ambiguous: ["æm'bigjuəs", null, ['(意味が)いろいろな意味にとれる、多義の', '(正体などが)はっきりしない、(輪郭などが)ぼんやりとした']],
    },
  };
  const KNOWN = {'zh-CN': '✓ 认识了', 'zh-TW': '✓ 認識了', 'ja': '✓ 覚えた'};
  const lang = DEFS[document.documentElement.lang] ? document.documentElement.lang : 'zh-CN';
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
    const [phonetic, pos, senses] = DEFS[lang][word.dataset.w];
    card = el('div', 'card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', word.dataset.w);
    const head = el('div', 'head');
    head.append(el('div', 'word', word.dataset.w), el('div', 'ph', `/${phonetic}/`));
    const body = el('div', 'body');
    const list = el('ol');
    senses.forEach(s => list.appendChild(el('li', '', s)));
    if (pos) body.append(el('span', 'pos', pos));
    body.append(list);
    const foot = el('div', 'foot');
    const known = el('button', '', KNOWN[lang]);
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
