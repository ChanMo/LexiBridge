(async() => {
  const $ = (id) => document.getElementById(id);
  const {el, icon, toast} = Page;
  const {t} = LexiBridgeI18n;
  let blocked = (await chrome.storage.local.get(['blocked'])).blocked ?? [];
  const save = (list) => chrome.storage.local.set({blocked: list});

  // "https://www.bbc.com/news" or "www.bbc.com" -> "www.bbc.com"
  function hostnameOf(text) {
    const value = text.trim();
    if(!value) return null;
    try {
      const host = new URL(value.includes('://') ? value : `http://${value}`).hostname;
      return /^[a-z0-9.-]+$/.test(host) && (host.includes('.') || host === 'localhost') ? host : null;
    } catch {
      return null;
    }
  }

  function render() {
    const list = $("list");
    if(!blocked.length) {
      const empty = el('div', 'empty');
      empty.append(el('b', '', t('blocked_emptyTitle')), el('div', '', t('blocked_emptyHint')));
      list.replaceChildren(empty);
      return;
    }
    list.replaceChildren(...blocked.map(domain => {
      const row = el('div', 'site');
      const remove = el('button', 'icon-btn danger');
      remove.type = 'button';
      remove.title = remove.ariaLabel = t('blocked_remove', domain);
      remove.appendChild(icon('close'));
      remove.addEventListener('click', async() => {
        const index = blocked.indexOf(domain);
        await save(blocked.filter(d => d !== domain));
        toast(t('blocked_enabled', domain), t('common_undo'), async() => {
          const now = (await chrome.storage.local.get(['blocked'])).blocked ?? [];
          if(now.includes(domain)) return;
          now.splice(Math.min(index, now.length), 0, domain);
          await save(now);
        });
      });
      row.append(icon('globe'), el('span', 'domain', domain), remove);
      return row;
    }));
  }

  $("add-form").addEventListener("submit", async(e) => {
    e.preventDefault();
    const host = hostnameOf($("domain").value);
    const error = $("add-error");
    if(!host) {
      error.textContent = t('blocked_invalid');
      error.hidden = false;
      return;
    }
    error.hidden = true;
    $("domain").value = '';
    if(!blocked.includes(host)) await save([...blocked, host]);
    toast(t('blocked_disabled', host));
  });

  // The popup switch updates this list too.
  chrome.storage.onChanged.addListener((changes, area) => {
    if(area === 'local' && changes.blocked) {
      blocked = changes.blocked.newValue ?? [];
      render();
    }
  });

  render();
})();
