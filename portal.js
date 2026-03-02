const PORTAL_KEYS = {
  authed: 'portal_authed_v2',
  blocks: 'portal_achievement_blocks_v2',
  verifyLinks: 'portal_verification_links_v2',
  media: 'portal_media_v2',
  settings: 'portal_settings_v2',
  globalVisits: 'site_metrics_global_v1',
  localMetrics: 'site_metrics_local_v1',
};

const HARDCODED_PASSWORD = 'Mm10141014';

const DEFAULT_BLOCKS = [
  {
    title: 'Future Achievement Slot',
    subtitle: 'Upcoming Competition / Award',
    date: 'Future',
    description: 'Use the portal to replace this with your next milestone, award, or certification update.',
    tags: ['Future', 'Editable', 'Portal Managed'],
    status: 'Planned',
  },
];

const DEFAULT_VERIFY_LINKS = [
  { target: 'AURA (HackUNCP26)', page: 'projects.html', label: 'Devpost (Add URL)', url: '#', category: 'Hackathon' },
  { target: 'GUARDIAPASS (HackNC State26)', page: 'projects.html', label: 'Devpost (Add URL)', url: '#', category: 'Hackathon' },
  { target: 'Gratitude (AfroPix26)', page: 'projects.html', label: 'Devpost / Proof (Add URL)', url: '#', category: 'Hackathon' },
];

const DEFAULT_SETTINGS = {
  redPages: ['timeline.html'],
  timelineHideProjects: false,
  iconStylePages: {},
};

function safeParse(json, fallback) {
  try {
    const parsed = JSON.parse(json);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeText(text) {
  return (text || '').trim().toLowerCase();
}

function currentPageName() {
  return window.location.pathname.split('/').pop() || 'index.html';
}

function pageMatches(itemPage, page) {
  const p = normalizeText(itemPage || 'all');
  const c = normalizeText(page);
  return p === 'all' || p === c;
}

function targetMatches(target, title) {
  const t = normalizeText(target);
  const c = normalizeText(title);
  return !!t && !!c && (t === c || c.includes(t) || t.includes(c));
}

function normalizeUrl(url) {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('#')
  ) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function getBlocks() {
  return safeParse(localStorage.getItem(PORTAL_KEYS.blocks), DEFAULT_BLOCKS);
}
function setBlocks(v) { localStorage.setItem(PORTAL_KEYS.blocks, JSON.stringify(v)); }

function getVerifyLinks() {
  const v = safeParse(localStorage.getItem(PORTAL_KEYS.verifyLinks), []);
  return Array.isArray(v) && v.length ? v : DEFAULT_VERIFY_LINKS;
}
function setVerifyLinks(v) { localStorage.setItem(PORTAL_KEYS.verifyLinks, JSON.stringify(v)); }

function getMediaItems() {
  const v = safeParse(localStorage.getItem(PORTAL_KEYS.media), []);
  return Array.isArray(v) ? v : [];
}
function setMediaItems(v) { localStorage.setItem(PORTAL_KEYS.media, JSON.stringify(v)); }

function getSettings() {
  return { ...DEFAULT_SETTINGS, ...safeParse(localStorage.getItem(PORTAL_KEYS.settings), DEFAULT_SETTINGS) };
}
function setSettings(v) { localStorage.setItem(PORTAL_KEYS.settings, JSON.stringify(v)); }

function isAuthed() { return sessionStorage.getItem(PORTAL_KEYS.authed) === '1'; }
function requireAuth() {
  if (!isAuthed()) {
    window.location.href = './login.html';
    return false;
  }
  return true;
}

function toYoutubeEmbed(url) {
  const u = normalizeUrl(url);
  if (!u) return '';
  const short = u.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
  if (short) return `https://www.youtube.com/embed/${short[1]}`;
  const long = u.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
  if (long) return `https://www.youtube.com/embed/${long[1]}`;
  const embed = u.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/);
  if (embed) return u;
  return '';
}

function renderPublicBlocks() {
  const mount = document.getElementById('editable-achievement-blocks');
  if (!mount) return;
  mount.innerHTML = '';
  getBlocks().forEach((b) => {
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <h3>${b.title || 'Untitled Achievement'}</h3>
      <p class="meta">${b.subtitle || ''}</p>
      <p class="date">${b.date || ''} ${b.status ? `| ${b.status}` : ''}</p>
      <p>${b.description || ''}</p>
      <div class="chips">${(b.tags || []).map((t) => `<span>${t}</span>`).join('')}</div>
    `;
    mount.appendChild(card);
  });
}

function allTargetNodes() {
  return [...document.querySelectorAll('.card, .timeline-item')];
}

function renderVerificationLinksOnCards() {
  const page = currentPageName();
  const links = getVerifyLinks();

  allTargetNodes().forEach((node) => {
    node.querySelector('.verify-links')?.remove();
    const h3 = node.querySelector('h3');
    if (!h3) return;
    const title = h3.textContent || '';

    const matches = links.filter((l) => pageMatches(l.page, page) && targetMatches(l.target, title) && normalizeUrl(l.url) && normalizeUrl(l.url) !== '#');
    if (!matches.length) return;

    const wrap = document.createElement('div');
    wrap.className = 'verify-links';
    wrap.innerHTML = '<p class="kicker">Verification Links</p>';
    const row = document.createElement('div');
    row.className = 'chips';

    matches.forEach((l) => {
      const a = document.createElement('a');
      a.className = 'btn ghost';
      a.href = normalizeUrl(l.url);
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = l.label || 'Reference';
      row.appendChild(a);
    });

    wrap.appendChild(row);
    node.appendChild(wrap);
  });
}

function renderMediaOnTargets() {
  const page = currentPageName();
  const media = getMediaItems();

  allTargetNodes().forEach((node) => {
    node.querySelector('.media-gallery.portal-media')?.remove();
    const h3 = node.querySelector('h3');
    if (!h3) return;

    const matches = media.filter((m) => pageMatches(m.page, page) && targetMatches(m.target, h3.textContent || '') && normalizeUrl(m.src));
    if (!matches.length) return;

    const gallery = document.createElement('div');
    gallery.className = 'media-gallery portal-media';
    gallery.innerHTML = '<p class="kicker">Portal Media</p>';
    const grid = document.createElement('div');
    grid.className = 'media-grid';

    matches.forEach((m) => {
      const type = normalizeText(m.type || 'image');
      if (type === 'link') {
        const linkWrap = document.createElement('div');
        linkWrap.className = 'media-item media-link';
        linkWrap.innerHTML = `<a class="btn ghost" href="${normalizeUrl(m.src)}" target="_blank" rel="noopener">${m.caption || 'Open Link'}</a>`;
        grid.appendChild(linkWrap);
        return;
      }

      if (type === 'youtube') {
        const embed = toYoutubeEmbed(m.src);
        if (!embed) return;
        const box = document.createElement('div');
        box.className = 'video-embed media-item';
        box.innerHTML = `<iframe src="${embed}" title="${m.caption || 'YouTube Video'}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
        grid.appendChild(box);
        return;
      }

      if (type === 'video') {
        const fig = document.createElement('figure');
        fig.className = 'media-item';
        fig.innerHTML = `<video controls preload="metadata" src="${normalizeUrl(m.src)}"></video>${m.caption ? `<figcaption>${m.caption}</figcaption>` : ''}`;
        grid.appendChild(fig);
        return;
      }

      const fig = document.createElement('figure');
      fig.className = 'media-item';
      fig.innerHTML = `<img loading="lazy" decoding="async" src="${normalizeUrl(m.src)}" alt="${m.caption || m.target || 'media'}" />${m.caption ? `<figcaption>${m.caption}</figcaption>` : ''}`;
      grid.appendChild(fig);
    });

    if (!grid.children.length) return;
    gallery.appendChild(grid);
    node.appendChild(gallery);
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function makeBlockEditorRow(block, index, total) {
  const row = document.createElement('article');
  row.className = 'card';
  row.innerHTML = `
    <h3>Block ${index + 1}</h3>
    <div class="form-grid">
      <label>Title<input data-field="title" value="${block.title || ''}" /></label>
      <label>Subtitle<input data-field="subtitle" value="${block.subtitle || ''}" /></label>
      <label>Date<input data-field="date" value="${block.date || ''}" /></label>
      <label>Status<input data-field="status" value="${block.status || ''}" /></label>
      <label class="full">Description<textarea data-field="description" rows="3">${block.description || ''}</textarea></label>
      <label class="full">Tags (comma-separated)<input data-field="tags" value="${(block.tags || []).join(', ')}" /></label>
    </div>
    <div class="actions">
      <button class="btn ghost" type="button" data-action="up">Move Up</button>
      <button class="btn ghost" type="button" data-action="down">Move Down</button>
      <button class="btn ghost" type="button" data-action="delete">Delete Block</button>
    </div>
  `;
  const up = row.querySelector('[data-action="up"]');
  const down = row.querySelector('[data-action="down"]');
  if (index === 0) up.disabled = true;
  if (index === total - 1) down.disabled = true;

  up.addEventListener('click', () => {
    const blocks = getBlocks();
    [blocks[index - 1], blocks[index]] = [blocks[index], blocks[index - 1]];
    setBlocks(blocks);
    initAdminPage();
  });

  down.addEventListener('click', () => {
    const blocks = getBlocks();
    [blocks[index + 1], blocks[index]] = [blocks[index], blocks[index + 1]];
    setBlocks(blocks);
    initAdminPage();
  });

  row.querySelector('[data-action="delete"]').addEventListener('click', () => {
    const blocks = getBlocks();
    blocks.splice(index, 1);
    setBlocks(blocks.length ? blocks : DEFAULT_BLOCKS);
    initAdminPage();
  });

  return row;
}

function makeLinkEditorRow(item, index) {
  const row = document.createElement('article');
  row.className = 'card';
  row.innerHTML = `
    <h3>Link ${index + 1}</h3>
    <div class="form-grid">
      <label>Target Title<input data-field="target" value="${item.target || ''}" /></label>
      <label>Page
        <select data-field="page">
          <option value="projects.html">Projects</option>
          <option value="events.html">Events</option>
          <option value="achievements.html">Achievements</option>
          <option value="timeline.html">Timeline</option>
          <option value="all">All Pages</option>
        </select>
      </label>
      <label>Category<input data-field="category" value="${item.category || ''}" /></label>
      <label>Label<input data-field="label" value="${item.label || ''}" /></label>
      <label class="full">URL<input data-field="url" value="${item.url || ''}" placeholder="https://..." /></label>
    </div>
    <div class="actions"><button class="btn ghost" type="button" data-action="delete-link">Delete Link</button></div>
  `;
  row.querySelector('[data-field="page"]').value = item.page || 'projects.html';

  row.querySelector('[data-action="delete-link"]').addEventListener('click', () => {
    const links = getVerifyLinks();
    links.splice(index, 1);
    setVerifyLinks(links.length ? links : DEFAULT_VERIFY_LINKS);
    initAdminPage();
  });

  return row;
}

function makeMediaEditorRow(item, index) {
  const row = document.createElement('article');
  row.className = 'card';
  row.innerHTML = `
    <h3>Media ${index + 1}</h3>
    <div class="form-grid">
      <label>Target Title<input data-field="target" value="${item.target || ''}" /></label>
      <label>Page
        <select data-field="page">
          <option value="projects.html">Projects</option>
          <option value="events.html">Events</option>
          <option value="achievements.html">Achievements</option>
          <option value="timeline.html">Timeline</option>
          <option value="all">All Pages</option>
        </select>
      </label>
      <label>Type
        <select data-field="type">
          <option value="image">Image</option>
          <option value="video">Video File/URL</option>
          <option value="youtube">YouTube URL</option>
          <option value="link">External Link</option>
        </select>
      </label>
      <label>Caption/Label<input data-field="caption" value="${item.caption || ''}" /></label>
      <label class="full">Source URL / Data URL<input data-field="src" value="${item.src || ''}" placeholder="https://..." /></label>
      <label class="full">Upload file (image/video)
        <input data-field="file" type="file" accept="image/*,video/*" />
      </label>
    </div>
    <div class="actions"><button class="btn ghost" type="button" data-action="delete-media">Delete Media</button></div>
  `;

  row.querySelector('[data-field="page"]').value = item.page || 'projects.html';
  row.querySelector('[data-field="type"]').value = item.type || 'image';

  const fileInput = row.querySelector('[data-field="file"]');
  const srcInput = row.querySelector('[data-field="src"]');

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const data = await fileToDataUrl(file);
    srcInput.value = data;
    const isVideo = (file.type || '').startsWith('video/');
    row.querySelector('[data-field="type"]').value = isVideo ? 'video' : 'image';
  });

  row.querySelector('[data-action="delete-media"]').addEventListener('click', () => {
    const media = getMediaItems();
    media.splice(index, 1);
    setMediaItems(media);
    initAdminPage();
  });

  return row;
}

function collectBlocks() {
  const rows = [...document.querySelectorAll('#block-editor-list .card')];
  return rows.map((r) => ({
    title: r.querySelector('[data-field="title"]').value.trim(),
    subtitle: r.querySelector('[data-field="subtitle"]').value.trim(),
    date: r.querySelector('[data-field="date"]').value.trim(),
    status: r.querySelector('[data-field="status"]').value.trim(),
    description: r.querySelector('[data-field="description"]').value.trim(),
    tags: r.querySelector('[data-field="tags"]').value.split(',').map((x) => x.trim()).filter(Boolean),
  }));
}

function collectLinks() {
  const rows = [...document.querySelectorAll('#link-editor-list .card')];
  return rows
    .map((r) => ({
      target: r.querySelector('[data-field="target"]').value.trim(),
      page: r.querySelector('[data-field="page"]').value.trim(),
      category: r.querySelector('[data-field="category"]').value.trim(),
      label: r.querySelector('[data-field="label"]').value.trim(),
      url: normalizeUrl(r.querySelector('[data-field="url"]').value.trim()),
    }))
    .filter((x) => x.target && x.label && x.url);
}

function collectMedia() {
  const rows = [...document.querySelectorAll('#media-editor-list .card')];
  return rows
    .map((r) => ({
      target: r.querySelector('[data-field="target"]').value.trim(),
      page: r.querySelector('[data-field="page"]').value.trim(),
      type: r.querySelector('[data-field="type"]').value.trim(),
      caption: r.querySelector('[data-field="caption"]').value.trim(),
      src: normalizeUrl(r.querySelector('[data-field="src"]').value.trim()),
    }))
    .filter((x) => x.target && x.src);
}

function renderSettingsUI() {
  const wrap = document.getElementById('red-pages-list');
  const iconWrap = document.getElementById('icon-style-list');
  if (!wrap) return;
  const pageChoices = [
    'index.html',
    'experience.html',
    'coursework.html',
    'projects.html',
    'events.html',
    'timeline.html',
    'achievements.html',
    'contact.html',
  ];
  const settings = getSettings();
  wrap.innerHTML = '';
  if (iconWrap) iconWrap.innerHTML = '';
  pageChoices.forEach((p) => {
    const id = `red-page-${p.replace(/[^a-z0-9]/gi, '-')}`;
    const checked = settings.redPages.includes(p) ? 'checked' : '';
    const row = document.createElement('label');
    row.className = 'settings-checkbox';
    row.innerHTML = `<input type="checkbox" data-red-page="${p}" id="${id}" ${checked} /> <span>${p}</span>`;
    wrap.appendChild(row);

    if (iconWrap) {
      const iconStyle = settings.iconStylePages?.[p] || 'neon';
      const iconRow = document.createElement('label');
      iconRow.className = 'settings-checkbox';
      iconRow.innerHTML = `
        <span>${p}</span>
        <select data-icon-style-page="${p}">
          <option value="minimal">Minimal</option>
          <option value="neon">Neon</option>
          <option value="solid">Solid</option>
        </select>
      `;
      iconWrap.appendChild(iconRow);
      const select = iconRow.querySelector('select');
      if (select) select.value = iconStyle;
    }
  });
  const hideProjects = document.getElementById('timeline-hide-projects');
  if (hideProjects) hideProjects.checked = !!settings.timelineHideProjects;
}

function collectSettings() {
  const redPages = [...document.querySelectorAll('[data-red-page]')]
    .filter((el) => el.checked)
    .map((el) => el.getAttribute('data-red-page'));
  const timelineHideProjects = !!document.getElementById('timeline-hide-projects')?.checked;
  const iconStylePages = {};
  [...document.querySelectorAll('[data-icon-style-page]')].forEach((el) => {
    const page = el.getAttribute('data-icon-style-page');
    const style = (el.value || 'neon').trim().toLowerCase();
    if (!page) return;
    iconStylePages[page] = ['minimal', 'neon', 'solid'].includes(style) ? style : 'neon';
  });
  return { redPages, timelineHideProjects, iconStylePages };
}

function renderMetrics() {
  const local = safeParse(localStorage.getItem(PORTAL_KEYS.localMetrics), { total: 0, pages: {}, lastVisit: null });
  const global = safeParse(localStorage.getItem(PORTAL_KEYS.globalVisits), null);
  const localTotal = document.getElementById('metric-local-total');
  const globalTotal = document.getElementById('metric-global-total');
  const lastVisit = document.getElementById('metric-last-visit');
  const pageList = document.getElementById('metric-pages');

  if (localTotal) localTotal.textContent = String(local.total || 0);
  if (globalTotal) globalTotal.textContent = global && typeof global.value === 'number' ? String(global.value) : 'Unavailable';
  if (lastVisit) lastVisit.textContent = local.lastVisit || 'N/A';

  if (pageList) {
    const entries = Object.entries(local.pages || {}).sort((a, b) => b[1] - a[1]);
    pageList.innerHTML = entries.length
      ? entries.map(([k, v]) => `<li><strong>${k}</strong>: ${v}</li>`).join('')
      : '<li>No metrics yet.</li>';
  }
}

function resetMetrics() {
  localStorage.removeItem(PORTAL_KEYS.localMetrics);
  localStorage.removeItem(PORTAL_KEYS.globalVisits);
  renderMetrics();
}

function initLoginPage() {
  const form = document.getElementById('login-form');
  if (!form) return;
  const pwd = document.getElementById('password');
  const msg = document.getElementById('login-message');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = (pwd.value || '').trim();
    if (input === HARDCODED_PASSWORD) {
      sessionStorage.setItem(PORTAL_KEYS.authed, '1');
      window.location.href = './admin.html';
      return;
    }
    msg.textContent = 'Incorrect password.';
  });
}

function refreshAddBlockOptions() {
  const select = document.getElementById('add-block-position');
  if (!select) return;
  const blocks = getBlocks();
  select.innerHTML = '';
  for (let i = 0; i <= blocks.length; i += 1) {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = `Position ${i + 1}`;
    if (i === blocks.length) o.selected = true;
    select.appendChild(o);
  }
}

function initAdminPage() {
  if (!document.getElementById('admin-root')) return;
  if (!requireAuth()) return;

  const blockList = document.getElementById('block-editor-list');
  const linkList = document.getElementById('link-editor-list');
  const mediaList = document.getElementById('media-editor-list');
  const addBlock = document.getElementById('add-block');
  const addLink = document.getElementById('add-link');
  const addMedia = document.getElementById('add-media');
  const saveBtn = document.getElementById('save-blocks');
  const logout = document.getElementById('logout-btn');
  const resetBtn = document.getElementById('reset-metrics-btn');
  const msg = document.getElementById('admin-message');

  if (blockList) {
    const blocks = getBlocks();
    blockList.innerHTML = '';
    blocks.forEach((b, i) => blockList.appendChild(makeBlockEditorRow(b, i, blocks.length)));
  }
  refreshAddBlockOptions();

  if (linkList) {
    const links = getVerifyLinks();
    linkList.innerHTML = '';
    links.forEach((l, i) => linkList.appendChild(makeLinkEditorRow(l, i)));
  }

  if (mediaList) {
    const media = getMediaItems();
    mediaList.innerHTML = '';
    media.forEach((m, i) => mediaList.appendChild(makeMediaEditorRow(m, i)));
  }

  renderSettingsUI();
  renderMetrics();

  addBlock?.addEventListener('click', () => {
    const blocks = getBlocks();
    const pos = Number(document.getElementById('add-block-position')?.value ?? blocks.length);
    blocks.splice(Math.max(0, Math.min(pos, blocks.length)), 0, {
      title: 'New Block',
      subtitle: 'Future Achievement',
      date: 'Future',
      status: 'Planned',
      description: 'Add details for your upcoming achievement.',
      tags: ['Future'],
    });
    setBlocks(blocks);
    initAdminPage();
  });

  addLink?.addEventListener('click', () => {
    const links = getVerifyLinks();
    links.push({ target: 'Project or Hackathon Title', page: 'projects.html', category: 'Project', label: 'Verification Link', url: 'https://' });
    setVerifyLinks(links);
    initAdminPage();
  });

  addMedia?.addEventListener('click', () => {
    const media = getMediaItems();
    media.push({ target: 'Project or Event Title', page: 'projects.html', type: 'image', caption: 'Media caption', src: 'https://' });
    setMediaItems(media);
    initAdminPage();
  });

  saveBtn?.addEventListener('click', () => {
    const blocks = collectBlocks();
    const links = collectLinks();
    const media = collectMedia();
    const settings = collectSettings();

    setBlocks(blocks.length ? blocks : DEFAULT_BLOCKS);
    setVerifyLinks(links.length ? links : DEFAULT_VERIFY_LINKS);
    setMediaItems(media);
    setSettings(settings);

    msg.textContent = `Saved. Blocks: ${blocks.length || 1}, Links: ${links.length || DEFAULT_VERIFY_LINKS.length}, Media: ${media.length}`;
    setTimeout(() => (msg.textContent = ''), 2200);
  });

  resetBtn?.addEventListener('click', () => {
    resetMetrics();
    msg.textContent = 'Analytics counter reset.';
    setTimeout(() => (msg.textContent = ''), 1800);
  });

  logout?.addEventListener('click', () => {
    sessionStorage.removeItem(PORTAL_KEYS.authed);
    window.location.href = './login.html';
  });
}

(function bootstrap() {
  renderPublicBlocks();
  renderVerificationLinksOnCards();
  renderMediaOnTargets();
  initLoginPage();
  initAdminPage();
})();
