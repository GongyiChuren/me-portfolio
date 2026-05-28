const state = {
  data: null,
  active: 'highlights',
  query: '',
};

const kindLabels = {
  repo: 'Repo',
  story: 'Story',
  paper: 'Paper',
  blog: 'Blog',
  reddit: 'Reddit',
};

const sectionIds = ['highlights', 'github', 'hn', 'reddit', 'arxiv', 'blogs'];

function fmtDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const hours = Math.round(diff / 36e5);
  if (hours >= 0 && hours < 24) return `${Math.max(1, hours)}h ago`;
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

function fmtUpdated(value) {
  if (!value) return '更新时间未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '更新时间未知';
  return `更新于 ${date.toLocaleString('zh-CN', { hour12: false })}`;
}

function itemText(item) {
  return [item.title, item.summary, item.source, item.subreddit, item.language, ...(item.categories || []), ...(item.authors || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function getItems(section) {
  if (!state.data) return [];
  const items = section === 'highlights' ? state.data.highlights || [] : (state.data.sections?.[section] || []);
  const q = state.query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => itemText(item).includes(q));
}

function renderCard(item) {
  const tpl = document.querySelector('#card-template');
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.querySelector('.source').textContent = item.source || 'Source';
  node.querySelector('.kind').textContent = kindLabels[item.kind] || item.kind || 'Item';
  node.querySelector('.date').textContent = fmtDate(item.updatedAt);
  const link = node.querySelector('h3 a');
  link.textContent = item.title || 'Untitled';
  link.href = item.url || '#';
  node.querySelector('.summary').textContent = item.summary || '';

  const extra = node.querySelector('.extra');
  const chips = [];
  if (item.stars != null) chips.push(`★ ${Number(item.stars).toLocaleString()}`);
  if (item.language) chips.push(item.language);
  if (item.points != null) chips.push(`${item.points} points`);
  if (item.score != null && item.kind === 'reddit') chips.push(`${Math.round(item.score)} signal`);
  if (item.commentsUrl) chips.push(`<a href="${item.commentsUrl}" target="_blank" rel="noreferrer">${item.comments || 0} comments</a>`);
  if (item.subreddit) chips.push(`r/${item.subreddit}`);
  if (item.categories?.length) chips.push(item.categories.slice(0, 3).join(' · '));
  if (item.authors?.length) chips.push(item.authors.slice(0, 2).join(', '));
  extra.innerHTML = chips.map((chip) => `<span>${chip}</span>`).join('');
  return node;
}

function renderSection(section) {
  const el = document.querySelector(`#${section}`);
  if (!el) return;
  const items = getItems(section);
  el.innerHTML = '';
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = state.query ? '无匹配结果' : '暂无内容';
    el.appendChild(empty);
    return;
  }
  items.forEach((item) => el.appendChild(renderCard(item)));
}

function renderAll() {
  sectionIds.forEach(renderSection);
  document.querySelectorAll('.section-block').forEach((block) => {
    const section = block.id.replace('-block', '');
    block.style.display = state.active === 'highlights' || state.active === section ? '' : 'none';
  });
  document.querySelectorAll('#tabs button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.section === state.active);
  });
}

function renderStatus() {
  const counts = state.data?.counts || {};
  document.querySelector('#updated-text').textContent = fmtUpdated(state.data?.generatedAt);
  document.querySelector('#counts-text').textContent = [
    `GitHub ${counts.github || 0}`,
    `HN ${counts.hn || 0}`,
    `Reddit ${counts.reddit || 0}`,
    `arXiv ${counts.arxiv || 0}`,
    `Blogs ${counts.blogs || 0}`,
  ].join(' · ');
}

async function loadData() {
  try {
    const res = await fetch(`./data.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
  } catch (err) {
    console.error('Radar data load failed', err);
    state.data = {
      generatedAt: null,
      counts: {},
      highlights: [],
      sections: { github: [], hn: [], reddit: [], arxiv: [], blogs: [] },
    };
    document.querySelector('#updated-text').textContent = '读取失败';
    document.querySelector('#counts-text').textContent = '请稍后重试';
  }
  renderStatus();
  renderAll();
}

document.querySelector('#tabs').addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-section]');
  if (!btn) return;
  state.active = btn.dataset.section;
  renderAll();
  document.querySelector('.controls').scrollIntoView({ block: 'start', behavior: 'smooth' });
});

document.querySelector('#search').addEventListener('input', (event) => {
  state.query = event.target.value;
  renderAll();
});

loadData();
