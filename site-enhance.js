(() => {
  const CONFIG = {
    nowKey: 'gc_now_building_items_v1',
    defaultNow: ['正在考研 ლ(´ڡ`ლ)', 'Hermes Agent workflows', 'ProxySudo', 'Self-hosted tools', 'Kaoyan Wiki'],
    tgUrl: 'https://t.me/LonglongBig78bot',
    tgIcon: '/images/icon/telegram.png',
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const short = (value, length = 72) => {
    const text = clean(value);
    return text.length > length ? `${text.slice(0, length)}…` : text;
  };

  function getNowItems() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CONFIG.nowKey) || '[]');
      if (Array.isArray(parsed) && parsed.some(Boolean)) return parsed.map(clean).filter(Boolean).slice(0, 8);
    } catch (_) {}
    return CONFIG.defaultNow;
  }

  function renderNowItems(card) {
    const list = $('.gc-now-list', card);
    list.innerHTML = '';
    getNowItems().forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    });
  }

  function injectTelegram() {
    const linkWrap = $('.social .link');
    if (!linkWrap || $('#gc-telegram-link', linkWrap)) return false;

    const a = document.createElement('a');
    a.id = 'gc-telegram-link';
    a.href = CONFIG.tgUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', 'Telegram Bot');
    a.addEventListener('mouseenter', () => {
      const tip = $('.social .tip');
      if (tip) tip.textContent = 'Telegram Bot：@LonglongBig78bot';
    });
    a.addEventListener('mouseleave', () => {
      const tip = $('.social .tip');
      if (tip) tip.textContent = '通过这里联系我吧';
    });

    const img = document.createElement('img');
    img.className = 'icon';
    img.src = CONFIG.tgIcon;
    img.height = 24;
    img.alt = 'Telegram';
    a.appendChild(img);
    linkWrap.appendChild(a);
    return true;
  }

  function injectHomeRadarLink() {
    return true;
  }

  function injectNowBuilding() {
    const left = $('.left[data-v-82ebc9a3]') || $('.left');
    if (!left || $('#gc-now-building')) return false;

    const card = document.createElement('section');
    card.id = 'gc-now-building';
    card.className = 'gc-now-building cards';
    card.innerHTML = `
      <div class="gc-now-head">
        <span class="gc-now-kicker">NOW BUILDING</span>
      </div>
      <ul class="gc-now-list"></ul>
    `;
    renderNowItems(card);

    const social = $('.social', left);
    if (social && social.parentElement === left) social.insertAdjacentElement('afterend', card);
    else left.appendChild(card);
    return true;
  }

  async function getTechRadarItems() {
    const items = [];

    try {
      const q = encodeURIComponent('AI OR LLM OR agent OR programming OR computer science');
      const res = await fetch(`https://hn.algolia.com/api/v1/search_by_date?query=${q}&tags=story&hitsPerPage=20`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HN ${res.status}`);
      const hits = (await res.json()).hits || [];
      hits
        .filter((hit) => hit.title && (hit.url || hit.story_url))
        .slice(0, 2)
        .forEach((hit) => items.push({
          title: short(hit.title),
          url: hit.url || hit.story_url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
          source: 'HN',
        }));
    } catch (err) {
      console.warn('Tech Radar: HN fetch failed', err);
    }

    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const q = encodeURIComponent(`AI created:>${since}`);
      const res = await fetch(`https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=8`, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!res.ok) throw new Error(`GitHub ${res.status}`);
      const repo = ((await res.json()).items || []).find((item) => item.full_name);
      if (repo) {
        items.push({
          title: short(`${repo.full_name}: ${repo.description || 'trending AI repository'}`),
          url: repo.html_url,
          source: 'GitHub',
        });
      }
    } catch (err) {
      console.warn('Tech Radar: GitHub fetch failed', err);
    }

    return items.slice(0, 3);
  }

  function injectTechRadarShell() {
    const right = $('.function .right') || $('.right.cards');
    if (!right || $('#gc-tech-radar')) return false;

    const oldHot = $('.hot-topic', right);
    if (oldHot) oldHot.style.display = 'none';

    const card = document.createElement('section');
    card.id = 'gc-tech-radar';
    card.className = 'gc-tech-radar';
    card.innerHTML = `
      <a class="gc-radar-open" href="/radar/" target="_blank" rel="noopener noreferrer">
        <span class="gc-radar-title">TECH RADAR</span>
        <span class="gc-radar-cta">打开 AI 雷达 →</span>
      </a>
      <div class="gc-radar-list"><span class="gc-radar-muted">更新中…</span></div>
    `;
    right.appendChild(card);

    getTechRadarItems().then((items) => {
      const list = $('.gc-radar-list', card);
      if (!items.length) {
        list.innerHTML = '<span class="gc-radar-muted">暂无内容</span>';
        return;
      }
      list.innerHTML = '';
      items.forEach((item) => {
        const a = document.createElement('a');
        a.href = item.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className = 'gc-radar-item';
        a.innerHTML = `<span class="gc-radar-source">${item.source}</span><span class="gc-radar-text"></span>`;
        $('.gc-radar-text', a).textContent = item.title;
        list.appendChild(a);
      });
    });
    return true;
  }

  function enhance() {
    const done = [injectTelegram(), injectHomeRadarLink(), injectNowBuilding(), injectTechRadarShell()];
    return done.every(Boolean);
  }

  const timer = window.setInterval(() => {
    if (enhance()) window.clearInterval(timer);
  }, 300);
  window.setTimeout(() => window.clearInterval(timer), 12000);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhance, { once: true });
  else enhance();
})();
