// UI strings from _locales/<locale>/messages.json, in the browser's language.
// Plain script for extension pages and the content script: it only touches
// the DOM it is handed, never the page the content script runs in.
const LexiBridgeI18n = (() => {
  const lang = chrome.i18n.getUILanguage();

  // A missing key shows up as the key itself rather than as nothing.
  function t(key, ...subs) {
    return chrome.i18n.getMessage(key, subs.map(String)) || key;
  }

  function num(n) {
    return n.toLocaleString(lang);
  }

  // A message with elements (or strings) in place of $1, $2...:
  // tNodes('level_welcome', b) -> ["欢迎！已按 ", b, " 准备好词库…"]
  function tNodes(key, ...nodes) {
    const marks = nodes.map((_, i) => `\u0001${i}\u0001`);
    return t(key, ...marks).split(/\u0001(\d+)\u0001/).map((part, i) => i % 2 ? nodes[part] : part);
  }

  // data-i18n="key" sets the text; data-i18n-attr="title:key;aria-label:key" sets
  // attributes. Template contents are done too, so rows built from them come out localized.
  function localize(root = document) {
    if(root === document) document.documentElement.lang = lang;
    for(const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for(const el of root.querySelectorAll('[data-i18n-attr]')) {
      for(const pair of el.dataset.i18nAttr.split(';')) {
        const [attr, key] = pair.split(':');
        el.setAttribute(attr, t(key));
      }
    }
    for(const template of root.querySelectorAll('template')) localize(template.content);
  }

  return {lang, t, num, tNodes, localize};
})();
