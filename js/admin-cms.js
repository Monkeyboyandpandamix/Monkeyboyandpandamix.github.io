/**
 * Buffered troubleshooting log — bundled here so admin never depends on a second script request.
 */
(function adminTroubleshootLogBundle() {
  const MAX_ENTRIES = 400;
  const entries = [];

  function isoTime() {
    return new Date().toISOString();
  }

  function safeStringify(obj, maxLen) {
    try {
      const s = JSON.stringify(obj, null, 2);
      const cap = maxLen ?? 12000;
      return s.length > cap ? `${s.slice(0, cap)}\n… (truncated)` : s;
    } catch (e) {
      return `[stringify error: ${e.message}]`;
    }
  }

  function formatDetail(detail) {
    if (detail === undefined || detail === null) return '';
    if (detail instanceof Error) {
      return `\n${detail.stack || detail.message}`;
    }
    if (typeof detail === 'object') {
      return `\n${safeStringify(detail)}`;
    }
    const s = String(detail);
    return s.length > 8000 ? `\n${s.slice(0, 8000)}…` : `\n${s}`;
  }

  function flush() {
    const el = document.getElementById('admin-troubleshoot-log-output');
    if (!el) return;
    el.textContent = entries.join('\n\n');
    try {
      el.scrollTop = el.scrollHeight;
    } catch {
      /* ignore */
    }
  }

  function log(level, category, message, detail) {
    const line = `[${isoTime()}] ${level.toUpperCase()} [${category}] ${message}${formatDetail(detail)}`;
    entries.push(line);
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    flush();

    const prefix = `[Admin troubleshoot] [${category}] ${message}`;
    if (level === 'error') console.error(prefix, detail ?? '');
    else if (level === 'warn') console.warn(prefix, detail ?? '');
    else if (level === 'debug') console.debug(prefix, detail ?? '');
    else console.info(prefix, detail ?? '');
  }

  function maskEmail(email) {
    if (!email || typeof email !== 'string') return '(none)';
    const at = email.indexOf('@');
    if (at < 1) return '(invalid)';
    const user = email.slice(0, at);
    const domain = email.slice(at + 1);
    const vis = user.length <= 2 ? user[0] + '*' : user.slice(0, 2) + '***';
    return `${vis}@${domain}`;
  }

  function snapshotEnvironment(extra) {
    const nav = typeof performance !== 'undefined' && performance.timing ? performance.timing.navigationStart : null;
    log('info', 'environment', 'Environment snapshot', {
      href: typeof location !== 'undefined' ? location.href : '?',
      protocol: typeof location !== 'undefined' ? location.protocol : '?',
      origin: typeof location !== 'undefined' ? location.origin : '?',
      pathname: typeof location !== 'undefined' ? location.pathname : '?',
      readyState: typeof document !== 'undefined' ? document.readyState : '?',
      referrer: typeof document !== 'undefined' ? document.referrer || '(none)' : '?',
      onLine: typeof navigator !== 'undefined' ? navigator.onLine : '?',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '?',
      navigationStartMs: nav,
      firebaseGlobal: typeof firebase !== 'undefined',
      cmsApi: typeof window.CmsApi !== 'undefined',
      initAdminCmsExtensions: typeof window.initAdminCmsExtensions === 'function',
      ...(extra && typeof extra === 'object' ? extra : {}),
    });
  }

  window.AdminTroubleshootLog = {
    log,
    debug: (c, m, d) => log('debug', c, m, d),
    info: (c, m, d) => log('info', c, m, d),
    warn: (c, m, d) => log('warn', c, m, d),
    error: (c, m, d) => log('error', c, m, d),
    maskEmail,
    snapshotEnvironment,
    flush,
    clear: () => {
      entries.length = 0;
      flush();
    },
    getText: () => entries.join('\n\n'),
    rerender: flush,
  };

  log('info', 'bootstrap', 'Admin troubleshoot logger loaded (bundled in admin-cms.js)');

  window.addEventListener('error', (ev) => {
    log('error', 'window.onerror', ev.message || 'Error', {
      filename: ev.filename,
      lineno: ev.lineno,
      colno: ev.colno,
      error: ev.error ? ev.error.stack || String(ev.error) : undefined,
    });
  });

  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason;
    log('error', 'unhandledrejection', reason instanceof Error ? reason.message : String(reason), reason);
  });

  function wireUi() {
    snapshotEnvironment();
    flush();

    const copyBtn = document.getElementById('admin-troubleshoot-copy');
    const clearBtn = document.getElementById('admin-troubleshoot-clear');
    const refreshBtn = document.getElementById('admin-troubleshoot-refresh');

    copyBtn?.addEventListener('click', async () => {
      const text = window.AdminTroubleshootLog.getText();
      try {
        await navigator.clipboard.writeText(text);
        window.AdminTroubleshootLog.info('ui', 'Log copied to clipboard', { chars: text.length });
      } catch (e) {
        window.AdminTroubleshootLog.warn('ui', 'Clipboard failed — select the log manually', e.message || e);
      }
    });

    clearBtn?.addEventListener('click', () => {
      window.AdminTroubleshootLog.clear();
      window.AdminTroubleshootLog.info('ui', 'Log cleared by user');
    });

    refreshBtn?.addEventListener('click', () => {
      window.AdminTroubleshootLog.info('ui', 'Manual environment refresh requested');
      snapshotEnvironment({
        firebaseApps: typeof firebase !== 'undefined' && firebase.apps ? firebase.apps.length : null,
        currentUserEmailMasked:
          typeof window.CmsApi !== 'undefined' && window.CmsApi.getCurrentUser
            ? window.AdminTroubleshootLog.maskEmail(window.CmsApi.getCurrentUser()?.email || '')
            : '(CmsApi unavailable)',
        isAdminUser:
          typeof window.CmsApi !== 'undefined' && window.CmsApi.isAdminUser ? window.CmsApi.isAdminUser() : null,
      });
    });

    requestAnimationFrame(() => {
      flush();
      requestAnimationFrame(flush);
    });
  }

  /** Wire UI only after every deferred script has run. Never call wireUi synchronously here: admin-cms.js runs before cms-api.js, and this IIFE runs before the Page Editor IIFE below — early snapshots falsely showed cmsApi/initAdmin=false. */
  let wireRan = false;
  function runWireUiOnce() {
    if (wireRan) return;
    wireRan = true;
    window.AdminTroubleshootLog.info(
      'bootstrap',
      document.readyState === 'complete' || document.readyState === 'interactive'
        ? 'Scheduling troubleshooting UI after full script queue (CMS API + Page Editor defs now on window)'
        : 'DOMContentLoaded — deferred scripts finished'
    );
    wireUi();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runWireUiOnce);
  } else {
    setTimeout(runWireUiOnce, 0);
  }
})();

/**
 * Extended admin: Realtime Database resume, config JSON fields, collection bulk publish.
 */
(function () {
  /** Structured log for admin dashboard (bundled logger above). */
  function ts(level, category, message, detail) {
    const L = window.AdminTroubleshootLog;
    if (!L) return;
    const fn = L[level];
    if (typeof fn === 'function') fn.call(L, category, message, detail);
  }

  const STATIC_PAGES = [
    'index.html',
    'projects.html',
    'events.html',
    'experience.html',
    'timeline.html',
    'contact.html',
    'coursework.html',
    'achievements.html',
  ];

  function setTextarea(id, value) {
    const el = document.getElementById(id);
    if (!el || value == null || value === '') return;
    if (typeof value === 'string') el.value = value;
    else el.value = JSON.stringify(value, null, 2);
  }

  function parseFieldJson(id, fallback) {
    const value = document.getElementById(id)?.value?.trim();
    if (!value) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function splitLines(value) {
    return String(value || '')
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function splitComma(value) {
    return String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function escapeAttr(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  async function fillFormFromFirebase() {
    ts('info', 'admin-cms', 'fillFormFromFirebase: calling CmsApi.loadAllCmsData()');
    let data;
    try {
      data = await window.CmsApi.loadAllCmsData();
    } catch (e) {
      ts('error', 'admin-cms', 'fillFormFromFirebase: loadAllCmsData() threw', e);
      console.warn(e);
      return;
    }
    if (!data) {
      ts('warn', 'admin-cms', 'fillFormFromFirebase: no data (null). Check Firebase init, RTDB rules, and network.');
      return;
    }
    const c = data.config || {};
    ts('info', 'admin-cms', 'fillFormFromFirebase: received snapshot', {
      hasResumeUrl: !!c.resumeUrl,
      homeHeroKeyCount: c.homeHero && typeof c.homeHero === 'object' ? Object.keys(c.homeHero).length : 0,
      projectsCount: Array.isArray(data.projects) ? data.projects.length : null,
      eventsCount: Array.isArray(data.events) ? data.events.length : null,
      rolesCount: Array.isArray(data.roles) ? data.roles.length : null,
      experienceCount: Array.isArray(data.experience) ? data.experience.length : null,
    });

    setTextarea('resume-url-field', c.resumeUrl);
    setTextarea('home-summary-html-field', c.homeSummaryHtml);
    setTextarea('theme-json-field', c.theme);
    setTextarea('home-hero-json-field', c.homeHero);
    setTextarea('quick-highlights-json-field', c.quickHighlights);
    setTextarea('certifications-json-field', c.certifications);
    setTextarea('competencies-json-field', c.competencies);
    setTextarea('contact-page-json-field', c.contactPage);
    setTextarea('coursework-page-json-field', c.courseworkPage);
    setTextarea('projects-page-json-field', c.projectsPage);
    setTextarea('events-page-json-field', c.eventsPage);
    setTextarea('timeline-page-json-field', c.timelinePage);
    setTextarea('experience-page-json-field', c.experiencePage);
    setTextarea('achievements-page-json-field', c.achievementsPage);
    setTextarea('achievement-cards-json-field', c.achievementCards);

    setTextarea('bulk-projects-json', data.projects);
    setTextarea('bulk-events-json', data.events);
    setTextarea('bulk-roles-json', data.roles);
    setTextarea('bulk-experience-json', data.experience);
  }

  async function publishCollection(collection, rawJson, idField) {
    let arr;
    try {
      arr = JSON.parse(rawJson || '[]');
    } catch (e) {
      throw new Error(`Invalid JSON for ${collection}: ${e.message}`);
    }
    if (!Array.isArray(arr)) throw new Error(`${collection}: root must be a JSON array`);
    await window.CmsApi.replaceCollection(collection, arr, idField);
  }

  function text(node, selector) {
    const el = selector ? node.querySelector(selector) : node;
    return (el?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function html(node, selector) {
    const el = selector ? node.querySelector(selector) : node;
    return (el?.innerHTML || '').trim();
  }

  function makeSlug(input, fallback) {
    const base = String(input || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120);
    return base || fallback;
  }

  function parseTimelineSortMs(label) {
    const raw = String(label || '').trim();
    if (!raw) return 0;
    const cleaned = raw
      .split(' - ')[0]
      .replace(/\bPresent\b/gi, '')
      .trim();
    const attempts = [cleaned, `${cleaned} 1`, `1 ${cleaned}`].filter(Boolean);
    for (const attempt of attempts) {
      const ms = Date.parse(attempt);
      if (Number.isFinite(ms)) return ms;
    }
    const yearMatch = cleaned.match(/\b(20\d{2}|19\d{2})\b/);
    if (yearMatch) {
      const ms = Date.parse(`January 1, ${yearMatch[1]}`);
      if (Number.isFinite(ms)) return ms;
    }
    return 0;
  }

  // ---------- Date helpers (admin friendly editors) ----------
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function pad2(n){return n<10?'0'+n:''+n;}
  function isoToMonthInput(iso){
    if(!iso) return '';
    const m = String(iso).match(/^(\d{4})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}` : '';
  }
  function monthInputToLabel(value){
    if(!value) return '';
    const m = String(value).match(/^(\d{4})-(\d{2})/);
    if(!m) return '';
    const yr = m[1], mi = parseInt(m[2],10)-1;
    if(mi<0||mi>11) return '';
    return `${MONTH_ABBR[mi]} ${yr}`;
  }
  function monthInputToMs(value){
    if(!value) return 0;
    const m = String(value).match(/^(\d{4})-(\d{2})/);
    if(!m) return 0;
    return Date.parse(`${m[1]}-${m[2]}-01T00:00:00`);
  }
  function dateLineFromRange(startMonth, endMonth, ongoing){
    const startLabel = monthInputToLabel(startMonth);
    if(!startLabel && !endMonth && !ongoing) return '';
    if(ongoing) return startLabel ? `${startLabel} - Present` : 'Present';
    const endLabel = monthInputToLabel(endMonth);
    if(startLabel && endLabel){
      if(startLabel === endLabel) return startLabel;
      return `${startLabel} - ${endLabel}`;
    }
    return startLabel || endLabel || '';
  }
  /** Best-effort: parse "Aug 2024", "August 2024", "Aug 2024 - Present", "Aug 2024 - Dec 2024" -> {start, end, ongoing}. */
  function parseDateLineToRange(label){
    const out = { start:'', end:'', ongoing:false };
    const raw = String(label||'').trim();
    if(!raw) return out;
    const parts = raw.split(/\s*[-–—]\s*/);
    const parseSegment = (seg) => {
      if(!seg) return '';
      if(/present/i.test(seg)) return '__present__';
      const m = seg.match(/([A-Za-z]+)\s+(\d{4})/);
      if(m){
        const monIdx = MONTH_NAMES.findIndex(n=>n.toLowerCase().startsWith(m[1].toLowerCase().slice(0,3)));
        if(monIdx>=0) return `${m[2]}-${pad2(monIdx+1)}`;
      }
      const yOnly = seg.match(/\b(20\d{2}|19\d{2})\b/);
      if(yOnly) return `${yOnly[1]}-01`;
      return '';
    };
    const a = parseSegment(parts[0]);
    const b = parts[1] !== undefined ? parseSegment(parts[1]) : '';
    if(a==='__present__') out.ongoing = true; else out.start = a;
    if(b==='__present__') out.ongoing = true; else if(b) out.end = b;
    return out;
  }
  /** Read a File as a base64 data URL (Promise). */
  function fileToDataUrl(file){
    return new Promise((resolve, reject)=>{
      const r = new FileReader();
      r.onload = ()=> resolve(String(r.result||''));
      r.onerror = ()=> reject(r.error || new Error('FileReader failed'));
      r.readAsDataURL(file);
    });
  }
  /** Wire image-upload + thumb gallery for a card whose media textarea holds one URL per line. */
  function attachMediaUploader(card){
    const ta = card.querySelector('[data-field="media"]');
    const fileInput = card.querySelector('[data-field="mediaUpload"]');
    const thumbs = card.querySelector('[data-thumbs]');
    if(!ta || !thumbs) return;
    const refresh = () => {
      const urls = String(ta.value||'').split('\n').map(s=>s.trim()).filter(Boolean);
      thumbs.innerHTML = urls.map((src,i) =>
        `<div class="admin-thumb"><img src="${escapeAttr(src)}" alt="media ${i+1}" /><button type="button" class="admin-thumb-x" data-idx="${i}" aria-label="Remove">×</button></div>`
      ).join('');
    };
    ta.addEventListener('input', refresh);
    thumbs.addEventListener('click', (e)=>{
      const btn = e.target.closest('[data-idx]');
      if(!btn) return;
      const idx = Number(btn.getAttribute('data-idx'));
      const urls = String(ta.value||'').split('\n').map(s=>s.trim()).filter(Boolean);
      urls.splice(idx,1);
      ta.value = urls.join('\n');
      refresh();
    });
    if(fileInput){
      fileInput.addEventListener('change', async ()=>{
        const files = [...(fileInput.files||[])];
        if(!files.length) return;
        const tooBig = files.filter(f=>f.size > 1500000);
        if(tooBig.length){
          const ok = window.confirm(`${tooBig.length} file(s) exceed ~1.5MB. Large images may slow your site or hit database limits. Continue?`);
          if(!ok){ fileInput.value=''; return; }
        }
        const existing = String(ta.value||'').split('\n').map(s=>s.trim()).filter(Boolean);
        for(const f of files){
          try{
            const url = await fileToDataUrl(f);
            existing.push(url);
          }catch(err){ console.warn('upload failed', f.name, err); }
        }
        ta.value = existing.join('\n');
        fileInput.value = '';
        refresh();
      });
    }
    refresh();
  }

  async function fetchPageDoc(path) {
    const url = `./${path}`;
    ts('debug', 'static-import', `GET ${url}`);
    let res;
    try {
      res = await fetch(url, { cache: 'no-store' });
    } catch (e) {
      ts('error', 'static-import', `fetch() failed for ${path}`, {
        message: e.message || String(e),
        hint: 'Opening admin as file:// breaks fetch; use http://localhost or HTTPS hosting.',
      });
      throw e;
    }
    if (!res.ok) {
      ts('error', 'static-import', `HTTP ${res.status} for ${path}`, { url, status: res.status, statusText: res.statusText });
      throw new Error(`Failed to load ${path}`);
    }
    const raw = await res.text();
    ts('info', 'static-import', `OK ${path}`, { bytes: raw.length });
    return new DOMParser().parseFromString(raw, 'text/html');
  }

  async function fetchStaticDocs() {
    const docs = await Promise.all(STATIC_PAGES.map((path) => fetchPageDoc(path)));
    return Object.fromEntries(STATIC_PAGES.map((path, index) => [path, docs[index]]));
  }

  function buildTimelineIndex(doc) {
    const out = { project: {}, event: {}, role: {} };
    doc.querySelectorAll('#timeline-static-fallback .timeline-item').forEach((item) => {
      const link = item.querySelector('.timeline-title-link');
      const href = link?.getAttribute('href') || '';
      const hash = href.includes('#') ? href.split('#')[1] : '';
      const summary = text(item, 'p:last-of-type');
      const timelineDateLabel = text(item, '.timeline-date');
      const entry = {
        timelineEnabled: true,
        timelineDateLabel,
        timelineSortMs: parseTimelineSortMs(timelineDateLabel),
        summaryHtml: summary ? `<p>${summary}</p>` : '',
      };
      if (!hash) return;
      if (item.classList.contains('role-item')) out.role[hash] = entry;
      else if (href.includes('events.html#')) out.event[hash] = entry;
      else out.project[hash] = entry;
    });
    return out;
  }

  function inferProjectCategory(article) {
    const sample = [text(article, 'h3'), text(article, '.meta'), text(article, '.date'), text(article, '.chips')]
      .join(' ')
      .toLowerCase();
    const hardware = /(drone|robot|raspberry|jetson|iot|doorbell|hardware|cluster|wireless|wifi|lab infrastructure|sensor|autonomous)/;
    const software = /(app|software|platform|tool|dashboard|website|studio|analyzer|detection|security|java|ai)/;
    const hasHardware = hardware.test(sample);
    const hasSoftware = software.test(sample);
    if (hasHardware && hasSoftware) return 'hybrid';
    if (hasHardware) return 'hardware';
    return 'software';
  }

  function bodyParagraphs(article) {
    return [...article.children]
      .filter((node) => node.tagName === 'P' && !node.classList.contains('meta') && !node.classList.contains('date') && !node.classList.contains('subtle'))
      .map((node) => node.outerHTML.trim())
      .filter(Boolean);
  }

  function buildProjectsSeed(doc, timelineIndex) {
    return [...doc.querySelectorAll('#projects-static-fallback > article.card')].map((article, index) => {
      const slug = article.id || `project-${index + 1}`;
      const paragraphs = bodyParagraphs(article);
      const details = article.querySelector('details');
      let detailHtml = '';
      if (details) {
        const clone = details.cloneNode(true);
        clone.querySelector('summary')?.remove();
        detailHtml = clone.innerHTML.trim();
      } else if (paragraphs.length > 1) {
        detailHtml = paragraphs.slice(1).join('');
      }
      const timeline = timelineIndex.project[slug] || {};
      return {
        slug,
        title: text(article, 'h3'),
        meta: text(article, '.meta'),
        dateLine: text(article, '.date'),
        summaryHtml: paragraphs[0] || '',
        detailHtml,
        chips: [...article.querySelectorAll('.chips span')].map((chip) => text(chip)),
        category: inferProjectCategory(article),
        orderIndex: 1000 - index,
        ...timeline,
      };
    });
  }

  function buildEventsSeed(doc, timelineIndex) {
    const sections = [...doc.querySelectorAll('#events-static-fallback > .section.stack')];
    return sections.flatMap((section, sectionIndex) => {
      const bucket = sectionIndex === 0 ? 'professional' : 'competitions';
      return [...section.querySelectorAll('article.card')].map((article, index) => {
        const slug = article.id || makeSlug(text(article, 'h3'), `event-${sectionIndex + 1}-${index + 1}`);
        const paragraphs = bodyParagraphs(article);
        const details = article.querySelector('details');
        let detailHtml = '';
        if (details) {
          const clone = details.cloneNode(true);
          clone.querySelector('summary')?.remove();
          detailHtml = clone.innerHTML.trim();
        } else if (paragraphs.length > 1) {
          detailHtml = paragraphs.slice(1).join('');
        }
        return {
          slug,
          title: text(article, 'h3'),
          meta: text(article, '.meta'),
          dateLine: text(article, '.date'),
          summaryHtml: paragraphs[0] || '',
          detailHtml,
          chips: [...article.querySelectorAll('.chips span')].map((chip) => text(chip)),
          bucket,
          orderIndex: 1000 - sectionIndex * 100 - index,
          ...(timelineIndex.event[slug] || {}),
        };
      });
    });
  }

  function buildRolesSeed(timelineDoc) {
    return [...timelineDoc.querySelectorAll('#timeline-static-fallback .role-item')].map((item, index) => {
      const link = item.querySelector('.timeline-title-link');
      const href = link?.getAttribute('href') || '';
      const slug = href.includes('#')
        ? href.split('#')[1]
        : makeSlug(text(item, 'h3'), `role-${index + 1}`);
      const timelineDateLabel = text(item, '.timeline-date');
      const summary = text(item, 'p:last-of-type');
      return {
        slug,
        title: text(item, 'h3'),
        summaryHtml: summary ? `<p>${summary}</p>` : '',
        timelineEnabled: true,
        timelineDateLabel,
        timelineSortMs: parseTimelineSortMs(timelineDateLabel),
      };
    });
  }

  function buildExperienceSeed(doc) {
    const sections = [...doc.querySelectorAll('#experience-static-fallback > section.section')];
    return sections.flatMap((section, sectionIndex) => {
      const heading = text(section, '.page-title').toLowerCase();
      const sectionName = heading.includes('campus') ? 'campus' : 'professional';
      return [...section.querySelectorAll('article.card')].map((article, index) => ({
        slug: article.id || makeSlug(text(article, 'h3'), `experience-${sectionIndex + 1}-${index + 1}`),
        title: text(article, 'h3'),
        meta: text(article, '.meta'),
        dateLine: text(article, '.date'),
        bullets: [...article.querySelectorAll('li')].map((li) => text(li)),
        chips: [...article.querySelectorAll('.chips span')].map((chip) => text(chip)),
        section: sectionName,
        orderIndex: 1000 - sectionIndex * 100 - index,
      }));
    });
  }

  function buildIndexConfig(doc) {
    const hero = doc.getElementById('home-hero-static');
    const summary = doc.getElementById('home-summary');
    const summaryClone = summary?.cloneNode(true);
    summaryClone?.querySelector('.page-title')?.remove();
    return {
      homeHero: hero
        ? {
            eyebrow: text(hero, '.eyebrow'),
            titleHtml: html(hero, 'h1'),
            lead: text(hero, '.lead'),
            actionsHtml: html(hero, '.actions'),
          }
        : undefined,
      homeSummaryHtml: summaryClone ? summaryClone.innerHTML.trim() : undefined,
      competencies: [...doc.querySelectorAll('#competencies-static > div')].map((item) => ({
        kicker: text(item, '.kicker'),
        subtle: text(item, '.subtle'),
      })),
      certifications: {
        completed: [...doc.querySelectorAll('#certifications-static .card:first-child .inline-list span')].map((node) => ({
          text: text(node),
        })),
        inProgress: [...doc.querySelectorAll('#certifications-static .card:last-child .inline-list span')].map((node) => ({
          text: text(node),
        })),
      },
      quickHighlights: [...doc.querySelectorAll('#highlights-static .card')].map((card) => ({
        title: text(card, 'h3'),
        body: text(card, 'p'),
      })),
      projectsPage: {},
      eventsPage: {},
      timelinePage: {},
      experiencePage: {},
      achievementsPage: {},
    };
  }

  function buildContactConfig(doc) {
    const panel = doc.querySelector('#contact-static-fallback > .section.panel');
    const cards = [...doc.querySelectorAll('#contact-static-fallback .grid-2 .card')];
    return {
      heading: text(panel, '.page-title'),
      introHtml: panel ? [...panel.querySelectorAll(':scope > p:not(.page-title):not(.subtle)')].map((p) => p.outerHTML.trim()).join('') : '',
      actions: [...panel.querySelectorAll('.actions a')].map((a) => ({
        label: text(a),
        href: a.getAttribute('href') || '#',
        variant: a.classList.contains('primary') ? 'primary' : 'ghost',
        external: a.target === '_blank',
      })),
      cards: cards.map((card) => {
        const clone = card.cloneNode(true);
        clone.querySelector('h3')?.remove();
        return {
          title: text(card, 'h3'),
          bodyHtml: clone.innerHTML.trim(),
        };
      }),
    };
  }

  function buildCourseworkConfig(doc) {
    const intro = doc.querySelector('#coursework-static-fallback > .section.panel');
    const note = doc.querySelector('#coursework-static-fallback > .section.panel:last-of-type');
    return {
      panelTitle: text(intro, '.page-title'),
      panelSubtitle: text(intro, '.subtle'),
      categories: [...doc.querySelectorAll('#coursework-static-fallback .grid-2 .card')].map((card) => ({
        title: text(card, 'h3'),
        items: [...card.querySelectorAll('li')].map((li) => text(li)),
      })),
      noteHtml: note ? note.innerHTML.replace(note.querySelector('.page-title')?.outerHTML || '', '').trim() : '',
    };
  }

  function buildAchievementCards(doc) {
    return [...doc.querySelectorAll('#achievements-static-grid .card')].map((card) => {
      const clone = card.cloneNode(true);
      clone.querySelector('h3')?.remove();
      clone.querySelector('.meta')?.remove();
      return {
        title: text(card, 'h3'),
        meta: text(card, '.meta'),
        bodyHtml: clone.innerHTML.trim(),
      };
    });
  }

  function buildSimplePageConfig(doc, selectors) {
    const out = {};
    selectors.forEach(([key, selector]) => {
      const value = text(doc, selector);
      if (value) out[key] = value;
    });
    return out;
  }

  async function loadStaticSiteIntoEditor() {
    ts('info', 'admin-cms', 'loadStaticSiteIntoEditor: start', { pages: STATIC_PAGES.slice() });
    const docs = await fetchStaticDocs();
    ts('info', 'admin-cms', 'loadStaticSiteIntoEditor: all static pages fetched');
    const timelineIndex = buildTimelineIndex(docs['timeline.html']);
    const config = buildIndexConfig(docs['index.html']);
    config.contactPage = buildContactConfig(docs['contact.html']);
    config.courseworkPage = buildCourseworkConfig(docs['coursework.html']);
    config.projectsPage = buildSimplePageConfig(docs['projects.html'], [
      ['heading', '.section.panel .page-title'],
      ['intro', '.section.panel .subtle'],
    ]);
    config.eventsPage = buildSimplePageConfig(docs['events.html'], [
      ['heading', '.section.panel .page-title'],
      ['intro', '.section.panel .subtle'],
      ['competitionsHeading', '#events-static-fallback > .section.panel:nth-of-type(2) .page-title'],
      ['competitionsIntro', '#events-static-fallback > .section.panel:nth-of-type(2) .subtle'],
    ]);
    config.timelinePage = buildSimplePageConfig(docs['timeline.html'], [
      ['heading', '.section.panel .page-title'],
      ['intro', '.section.panel .subtle'],
    ]);
    config.experiencePage = buildSimplePageConfig(docs['experience.html'], [
      ['heading', '.section.panel .page-title'],
      ['intro', '.section.panel .subtle'],
      ['professionalHeading', '#experience-static-fallback > section:nth-of-type(1) .page-title'],
      ['campusHeading', '#experience-static-fallback > section:nth-of-type(2) .page-title'],
    ]);
    config.achievementsPage = buildSimplePageConfig(docs['achievements.html'], [
      ['heading', '.section.panel .page-title'],
      ['editableHeading', 'main > section.section.panel:nth-of-type(2) .page-title'],
      ['editableIntro', 'main > section.section.panel:nth-of-type(2) .subtle'],
    ]);
    config.achievementCards = buildAchievementCards(docs['achievements.html']);

    setTextarea('home-hero-json-field', config.homeHero);
    setTextarea('home-summary-html-field', config.homeSummaryHtml);
    setTextarea('quick-highlights-json-field', config.quickHighlights);
    setTextarea('certifications-json-field', config.certifications);
    setTextarea('competencies-json-field', config.competencies);
    setTextarea('contact-page-json-field', config.contactPage);
    setTextarea('coursework-page-json-field', config.courseworkPage);
    setTextarea('projects-page-json-field', config.projectsPage);
    setTextarea('events-page-json-field', config.eventsPage);
    setTextarea('timeline-page-json-field', config.timelinePage);
    setTextarea('experience-page-json-field', config.experiencePage);
    setTextarea('achievements-page-json-field', config.achievementsPage);
    setTextarea('achievement-cards-json-field', config.achievementCards);
    setTextarea('bulk-projects-json', buildProjectsSeed(docs['projects.html'], timelineIndex));
    setTextarea('bulk-events-json', buildEventsSeed(docs['events.html'], timelineIndex));
    setTextarea('bulk-roles-json', buildRolesSeed(docs['timeline.html']));
    setTextarea('bulk-experience-json', buildExperienceSeed(docs['experience.html']));
    ts('info', 'admin-cms', 'loadStaticSiteIntoEditor: textareas populated', {
      editorLooksEmpty: editorLooksEmpty(),
    });
  }

  function collectConfigPayloadFromEditor() {
    syncFriendlyEditorsToJson();
    const payload = {
      verifyLinks: typeof getVerifyLinks === 'function' ? getVerifyLinks() : [],
      media: typeof getMediaItems === 'function' ? getMediaItems() : [],
      settings: typeof getSettings === 'function' ? getSettings() : {},
    };

    const resumeUrl = document.getElementById('resume-url-field')?.value?.trim();
    const homeSummaryHtml = document.getElementById('home-summary-html-field')?.value?.trim();
    if (resumeUrl) payload.resumeUrl = resumeUrl;
    if (homeSummaryHtml) payload.homeSummaryHtml = homeSummaryHtml;

    [
      ['theme-json-field', 'theme'],
      ['home-hero-json-field', 'homeHero'],
      ['quick-highlights-json-field', 'quickHighlights'],
      ['certifications-json-field', 'certifications'],
      ['competencies-json-field', 'competencies'],
      ['contact-page-json-field', 'contactPage'],
      ['coursework-page-json-field', 'courseworkPage'],
      ['projects-page-json-field', 'projectsPage'],
      ['events-page-json-field', 'eventsPage'],
      ['timeline-page-json-field', 'timelinePage'],
      ['experience-page-json-field', 'experiencePage'],
      ['achievements-page-json-field', 'achievementsPage'],
      ['achievement-cards-json-field', 'achievementCards'],
    ].forEach(([id, key]) => {
      const value = document.getElementById(id)?.value?.trim();
      if (!value) return;
      payload[key] = JSON.parse(value);
    });

    return payload;
  }

  function makeFriendlyEditorCard(title, fieldsHtml) {
    const card = document.createElement('details');
    card.className = 'admin-editor-card';
    card.open = true;
    const summary = document.createElement('summary');
    summary.className = 'admin-editor-card-summary';
    summary.textContent = title;
    const inner = document.createElement('div');
    inner.className = 'admin-editor-card-inner';
    inner.innerHTML = `<div class="form-grid">${fieldsHtml}</div><div class="actions"><button class="btn ghost" type="button" data-action="remove">Remove</button></div>`;
    card.appendChild(summary);
    card.appendChild(inner);
    return card;
  }

  function renderFriendlyList(containerId, items, renderer) {
    const mount = document.getElementById(containerId);
    if (!mount) return;
    mount.innerHTML = '';
    let list = items;
    if (!Array.isArray(list)) {
      if (list && typeof list === 'object') {
        list = Object.values(list);
      } else {
        list = [];
      }
      ts('warn', 'admin-cms', `renderFriendlyList(${containerId}): items was not an array — coerced`, {
        coercedLength: list.length,
      });
    }
    list.forEach((item, index) => {
      try {
        const node = renderer(item, index);
        if (node) mount.appendChild(node);
      } catch (err) {
        ts('error', 'admin-cms', `renderFriendlyList(${containerId}): renderer threw on index ${index}`, err);
      }
    });
  }

  function bindAdminTabs() {
    const tablist = document.querySelector('.admin-tabs');
    const tabs = [...document.querySelectorAll('[data-admin-tab]')];
    const panels = [...document.querySelectorAll('[data-admin-panel]')];
    if (!tabs.length || !panels.length) return () => {};

    const openTab = (name) => {
      if (!name) return;
      tabs.forEach((tab) => {
        const active = tab.getAttribute('data-admin-tab') === name;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      panels.forEach((panel) => {
        const active = panel.getAttribute('data-admin-panel') === name;
        panel.classList.toggle('is-active', active);
        if (active) {
          panel.removeAttribute('hidden');
        } else {
          panel.setAttribute('hidden', '');
        }
      });
    };

    if (tablist && tablist.dataset.tabDelegateBound !== '1') {
      tablist.dataset.tabDelegateBound = '1';
      tablist.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-admin-tab]');
        if (!btn || !tablist.contains(btn)) return;
        openTab(btn.getAttribute('data-admin-tab'));
      });
    }

    const initial =
      tabs.find((tab) => tab.classList.contains('is-active'))?.getAttribute('data-admin-tab') ||
      tabs[0]?.getAttribute('data-admin-tab') ||
      'home';
    openTab(initial);
    return openTab;
  }

  /**
   * True when the textarea has no real content (empty array/object, empty certs, etc.).
   * Used so we still import static site copy when Firebase has placeholder JSON like {} or {"completed":[],"inProgress":[]}.
   */
  function isEffectivelyEmptyJsonField(id) {
    const raw = document.getElementById(id)?.value?.trim();
    if (!raw) return true;
    if (raw === '[]' || raw === '{}') return true;
    try {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) return v.length === 0;
      if (v && typeof v === 'object') {
        if (id === 'certifications-json-field') {
          const comp = Array.isArray(v.completed) ? v.completed : [];
          const prog = Array.isArray(v.inProgress) ? v.inProgress : [];
          return comp.length === 0 && prog.length === 0;
        }
        if (id === 'home-hero-json-field') {
          const strip = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          const has =
            strip(v.eyebrow) ||
            strip(v.lead) ||
            strip(v.title) ||
            strip(v.titleHtml) ||
            strip(v.actionsHtml);
          return !has;
        }
        return Object.keys(v).length === 0;
      }
    } catch {
      return false;
    }
    return false;
  }

  function editorLooksEmpty() {
    const textareas = [
      'bulk-projects-json',
      'bulk-events-json',
      'bulk-experience-json',
      'achievement-cards-json-field',
      'contact-page-json-field',
      'coursework-page-json-field',
      'home-hero-json-field',
      'quick-highlights-json-field',
      'competencies-json-field',
      'certifications-json-field',
    ];
    return textareas.every(isEffectivelyEmptyJsonField);
  }

  function fieldHasMeaningfulValue(id) {
    return !isEffectivelyEmptyJsonField(id);
  }

  async function hydrateMissingEditorSectionsFromStatic() {
    const needsStatic = {
      homeHero: !fieldHasMeaningfulValue('home-hero-json-field'),
      homeSummary: !document.getElementById('home-summary-html-field')?.value?.trim(),
      quickHighlights: !fieldHasMeaningfulValue('quick-highlights-json-field'),
      certifications: !fieldHasMeaningfulValue('certifications-json-field'),
      competencies: !fieldHasMeaningfulValue('competencies-json-field'),
      contactPage: !fieldHasMeaningfulValue('contact-page-json-field'),
      courseworkPage: !fieldHasMeaningfulValue('coursework-page-json-field'),
      projectsPage: !fieldHasMeaningfulValue('projects-page-json-field'),
      eventsPage: !fieldHasMeaningfulValue('events-page-json-field'),
      timelinePage: !fieldHasMeaningfulValue('timeline-page-json-field'),
      experiencePage: !fieldHasMeaningfulValue('experience-page-json-field'),
      achievementsPage: !fieldHasMeaningfulValue('achievements-page-json-field'),
      achievementCards: !fieldHasMeaningfulValue('achievement-cards-json-field'),
      projects: !fieldHasMeaningfulValue('bulk-projects-json'),
      events: !fieldHasMeaningfulValue('bulk-events-json'),
      roles: !fieldHasMeaningfulValue('bulk-roles-json'),
      experience: !fieldHasMeaningfulValue('bulk-experience-json'),
    };

    const needEntries = Object.entries(needsStatic).filter(([, v]) => v);
    ts('info', 'admin-cms', 'hydrateMissingEditorSectionsFromStatic', {
      sectionCount: needEntries.length,
      sections: needEntries.map(([k]) => k),
    });
    if (!needEntries.length) return;

    const docs = await fetchStaticDocs();
    const timelineIndex = buildTimelineIndex(docs['timeline.html']);

    if (needsStatic.homeHero || needsStatic.homeSummary || needsStatic.quickHighlights || needsStatic.certifications || needsStatic.competencies) {
      const config = buildIndexConfig(docs['index.html']);
      if (needsStatic.homeHero) setTextarea('home-hero-json-field', config.homeHero);
      if (needsStatic.homeSummary) setTextarea('home-summary-html-field', config.homeSummaryHtml);
      if (needsStatic.quickHighlights) setTextarea('quick-highlights-json-field', config.quickHighlights);
      if (needsStatic.certifications) setTextarea('certifications-json-field', config.certifications);
      if (needsStatic.competencies) setTextarea('competencies-json-field', config.competencies);
    }

    if (needsStatic.contactPage) {
      setTextarea('contact-page-json-field', buildContactConfig(docs['contact.html']));
    }
    if (needsStatic.courseworkPage) {
      setTextarea('coursework-page-json-field', buildCourseworkConfig(docs['coursework.html']));
    }
    if (needsStatic.projectsPage) {
      setTextarea('projects-page-json-field', buildSimplePageConfig(docs['projects.html'], [
        ['heading', '.section.panel .page-title'],
        ['intro', '.section.panel .subtle'],
      ]));
    }
    if (needsStatic.eventsPage) {
      setTextarea('events-page-json-field', buildSimplePageConfig(docs['events.html'], [
        ['heading', '.section.panel .page-title'],
        ['intro', '.section.panel .subtle'],
        ['competitionsHeading', '#events-static-fallback > .section.panel:nth-of-type(2) .page-title'],
        ['competitionsIntro', '#events-static-fallback > .section.panel:nth-of-type(2) .subtle'],
      ]));
    }
    if (needsStatic.timelinePage) {
      setTextarea('timeline-page-json-field', buildSimplePageConfig(docs['timeline.html'], [
        ['heading', '.section.panel .page-title'],
        ['intro', '.section.panel .subtle'],
      ]));
    }
    if (needsStatic.experiencePage) {
      setTextarea('experience-page-json-field', buildSimplePageConfig(docs['experience.html'], [
        ['heading', '.section.panel .page-title'],
        ['intro', '.section.panel .subtle'],
        ['professionalHeading', '#experience-static-fallback > section:nth-of-type(1) .page-title'],
        ['campusHeading', '#experience-static-fallback > section:nth-of-type(2) .page-title'],
      ]));
    }
    if (needsStatic.achievementsPage) {
      setTextarea('achievements-page-json-field', buildSimplePageConfig(docs['achievements.html'], [
        ['heading', '.section.panel .page-title'],
      ]));
    }
    if (needsStatic.achievementCards) {
      setTextarea('achievement-cards-json-field', buildAchievementCards(docs['achievements.html']));
    }
    if (needsStatic.projects) {
      setTextarea('bulk-projects-json', buildProjectsSeed(docs['projects.html'], timelineIndex));
    }
    if (needsStatic.events) {
      setTextarea('bulk-events-json', buildEventsSeed(docs['events.html'], timelineIndex));
    }
    if (needsStatic.roles) {
      setTextarea('bulk-roles-json', buildRolesSeed(docs['timeline.html']));
    }
    if (needsStatic.experience) {
      setTextarea('bulk-experience-json', buildExperienceSeed(docs['experience.html']));
    }
    ts('info', 'admin-cms', 'hydrateMissingEditorSectionsFromStatic: done');
  }

  function dateRangeFieldsHtml(item){
    const r = parseDateLineToRange(item.dateLine || '');
    const startVal = item.startMonth || r.start || '';
    const endVal = item.endMonth || r.end || '';
    const ongoing = item.ongoing === true || item.ongoing === 'true' || r.ongoing;
    return `
      <label>Start (month)<input type="month" data-field="startMonth" value="${escapeAttr(startVal)}" /></label>
      <label>End (month)<input type="month" data-field="endMonth" value="${escapeAttr(endVal)}" /></label>
      <label class="admin-checkbox-row"><input type="checkbox" data-field="ongoing" ${ongoing?'checked':''} /> Ongoing / Present</label>
      <label class="full">Display date <span class="subtle">(auto-fills from above; edit to override)</span><input data-field="dateLine" value="${escapeAttr(item.dateLine || '')}" placeholder="e.g. Aug 2024 - Present" /></label>
    `;
  }
  function wireDateRange(card){
    const start = card.querySelector('[data-field="startMonth"]');
    const end = card.querySelector('[data-field="endMonth"]');
    const ongoing = card.querySelector('[data-field="ongoing"]');
    const display = card.querySelector('[data-field="dateLine"]');
    if(!display) return;
    let userEdited = false;
    display.addEventListener('input', ()=>{ userEdited = true; });
    const recompute = ()=>{
      if(userEdited) return;
      display.value = dateLineFromRange(start?.value || '', end?.value || '', !!ongoing?.checked);
    };
    [start, end, ongoing].forEach(el => el && el.addEventListener('change', recompute));
  }

  function projectEditorCard(item, index) {
    const mediaUrls = (item.media || []).map((m) => m.src || '').filter(Boolean).join('\n');
    const card = makeFriendlyEditorCard(`Project ${index + 1}`, `
      <label>Title<input data-field="title" value="${escapeAttr(item.title)}" /></label>
      <label>Slug<input data-field="slug" value="${escapeAttr(item.slug)}" /></label>
      <label>Category<select data-field="category"><option value="software">Software</option><option value="hardware">Hardware</option><option value="hybrid">Hybrid</option></select></label>
      <label class="admin-checkbox-row"><input type="checkbox" data-field="showHardwareGear" /> Force ⚙ gear (Software only)</label>
      <p class="subtle full">Hardware or Hybrid auto-adds the ⚙ gear, hardware-styled tags, and is filterable on the Projects page.</p>
      ${dateRangeFieldsHtml(item)}
      <label class="full">Summary<textarea data-field="summary" rows="3">${escapeAttr(item.summaryText)}</textarea></label>
      <label class="full">Details<textarea data-field="details" rows="4">${escapeAttr(item.detailText)}</textarea></label>
      <label class="full">Tags (comma-separated)<input data-field="chips" placeholder="Python, Raspberry Pi, hardware" value="${escapeAttr((item.chips || []).join(', '))}" /></label>
      <div class="full">
        <label>Upload images <span class="subtle">(stored in your database)</span><input type="file" data-field="mediaUpload" accept="image/*" multiple /></label>
        <div class="admin-thumbs" data-thumbs></div>
        <details><summary class="subtle">Advanced: edit media URLs</summary>
          <textarea data-field="media" rows="4" placeholder="https://...  (one per line)">${escapeAttr(mediaUrls)}</textarea>
        </details>
      </div>
    `);
    card.querySelector('[data-field="category"]').value = item.category || 'software';
    const gearCb = card.querySelector('[data-field="showHardwareGear"]');
    if (gearCb) gearCb.checked = !!(item.showHardwareGear === true || item.showHardwareGear === 'true');
    wireDateRange(card);
    attachMediaUploader(card);
    card.querySelector('[data-action="remove"]').addEventListener('click', () => {
      const list = getFriendlyProjects();
      list.splice(index, 1);
      setFriendlyProjects(list);
      renderFriendlyEditors();
    });
    return card;
  }

  function eventEditorCard(item, index) {
    const mediaUrls = (item.media || []).map((m) => m.src || '').filter(Boolean).join('\n');
    const card = makeFriendlyEditorCard(`Event ${index + 1}`, `
      <label>Title<input data-field="title" value="${escapeAttr(item.title)}" /></label>
      <label>Slug<input data-field="slug" value="${escapeAttr(item.slug)}" /></label>
      <label>Bucket<select data-field="bucket"><option value="professional">Professional</option><option value="competitions">Competitions</option></select></label>
      ${dateRangeFieldsHtml(item)}
      <label class="full">Summary<textarea data-field="summary" rows="3">${escapeAttr(item.summaryText)}</textarea></label>
      <label class="full">Details<textarea data-field="details" rows="4">${escapeAttr(item.detailText)}</textarea></label>
      <label class="full">Tags<input data-field="chips" value="${escapeAttr((item.chips || []).join(', '))}" /></label>
      <div class="full">
        <label>Upload images <span class="subtle">(stored in your database)</span><input type="file" data-field="mediaUpload" accept="image/*" multiple /></label>
        <div class="admin-thumbs" data-thumbs></div>
        <details><summary class="subtle">Advanced: edit media URLs</summary>
          <textarea data-field="media" rows="4" placeholder="https://...  (one per line)">${escapeAttr(mediaUrls)}</textarea>
        </details>
      </div>
    `);
    card.querySelector('[data-field="bucket"]').value = item.bucket || 'professional';
    wireDateRange(card);
    attachMediaUploader(card);
    card.querySelector('[data-action="remove"]').addEventListener('click', () => {
      const list = getFriendlyEvents();
      list.splice(index, 1);
      setFriendlyEvents(list);
      renderFriendlyEditors();
    });
    return card;
  }

  function experienceEditorCard(item, index) {
    const card = makeFriendlyEditorCard(`Experience ${index + 1}`, `
      <label>Title<input data-field="title" value="${escapeAttr(item.title)}" /></label>
      <label>Slug<input data-field="slug" value="${escapeAttr(item.slug)}" /></label>
      <label>Section<select data-field="section"><option value="professional">Professional</option><option value="campus">Campus</option></select></label>
      <label>Meta<input data-field="meta" value="${escapeAttr(item.meta)}" /></label>
      ${dateRangeFieldsHtml(item)}
      <label class="full">Bullets (one per line)<textarea data-field="bullets" rows="5">${escapeAttr((item.bullets || []).join('\n'))}</textarea></label>
      <label class="full">Tags<input data-field="chips" value="${escapeAttr((item.chips || []).join(', '))}" /></label>
    `);
    card.querySelector('[data-field="section"]').value = item.section || 'professional';
    wireDateRange(card);
    card.querySelector('[data-action="remove"]').addEventListener('click', () => {
      const list = getFriendlyExperience();
      list.splice(index, 1);
      setFriendlyExperience(list);
      renderFriendlyEditors();
    });
    return card;
  }

  function schoolEditorCard(item, index) {
    const cats = Array.isArray(item.categories) ? item.categories : [];
    const categoriesText = cats
      .map((cat) => `${cat.title || 'Category'}: ${(cat.items || []).map((entry) => (typeof entry === 'string' ? entry : [entry.code, entry.name].filter(Boolean).join(' - '))).join(' | ')}`)
      .join('\n');
    const card = makeFriendlyEditorCard(`School ${index + 1}`, `
      <label>School name<input data-field="name" value="${escapeAttr(item.name)}" /></label>
      <label>Subtitle<input data-field="subtitle" value="${escapeAttr(item.subtitle)}" /></label>
      <label class="full">Categories and courses<textarea data-field="categories" rows="6" placeholder="Cybersecurity: CTIS 221 - Fundamentals | CTIS 370 - Cyber and Network Security">${escapeAttr(categoriesText)}</textarea></label>
      <label class="full">School note<textarea data-field="noteHtml" rows="3">${escapeAttr(item.noteText)}</textarea></label>
    `);
    card.querySelector('[data-action="remove"]').addEventListener('click', () => {
      const list = getFriendlySchools();
      list.splice(index, 1);
      setFriendlySchools(list);
      renderFriendlyEditors();
    });
    return card;
  }

  function contactActionEditorCard(item, index) {
    const card = makeFriendlyEditorCard(`Button ${index + 1}`, `
      <label>Label<input data-field="label" value="${escapeAttr(item.label)}" /></label>
      <label>URL<input data-field="href" value="${escapeAttr(item.href)}" /></label>
      <label>Style<select data-field="variant"><option value="primary">Primary</option><option value="ghost">Ghost</option></select></label>
      <label>Opens new tab<select data-field="external"><option value="false">No</option><option value="true">Yes</option></select></label>
    `);
    card.querySelector('[data-field="variant"]').value = item.variant || 'ghost';
    card.querySelector('[data-field="external"]').value = item.external ? 'true' : 'false';
    card.querySelector('[data-action="remove"]').addEventListener('click', () => {
      const list = getFriendlyContactActions();
      list.splice(index, 1);
      setFriendlyContactActions(list);
      renderFriendlyEditors();
    });
    return card;
  }

  function contactCardEditorCard(item, index) {
    const card = makeFriendlyEditorCard(`Contact Card ${index + 1}`, `
      <label>Title<input data-field="title" value="${escapeAttr(item.title)}" /></label>
      <label class="full">Body<textarea data-field="body" rows="4">${escapeAttr(item.bodyText)}</textarea></label>
    `);
    card.querySelector('[data-action="remove"]').addEventListener('click', () => {
      const list = getFriendlyContactCards();
      list.splice(index, 1);
      setFriendlyContactCards(list);
      renderFriendlyEditors();
    });
    return card;
  }

  function achievementCardEditorCard(item, index) {
    const card = makeFriendlyEditorCard(`Achievement ${index + 1}`, `
      <label>Title<input data-field="title" value="${escapeAttr(item.title)}" /></label>
      <label>Meta<input data-field="meta" value="${escapeAttr(item.meta)}" /></label>
      <label class="full">Body<textarea data-field="body" rows="4">${escapeAttr(item.bodyText)}</textarea></label>
    `);
    card.querySelector('[data-action="remove"]').addEventListener('click', () => {
      const list = getFriendlyAchievementCards();
      list.splice(index, 1);
      setFriendlyAchievementCards(list);
      renderFriendlyEditors();
    });
    return card;
  }

  function roleEditorCard(item, index) {
    const card = makeFriendlyEditorCard(`Timeline Role ${index + 1}`, `
      <label>Title<input data-field="title" value="${escapeAttr(item.title)}" /></label>
      <label>Slug<input data-field="slug" value="${escapeAttr(item.slug)}" /></label>
      <label>Date<input data-field="timelineDateLabel" value="${escapeAttr(item.timelineDateLabel || '')}" /></label>
      <label class="full">Summary<textarea data-field="summary" rows="4">${escapeAttr(item.summaryText || '')}</textarea></label>
    `);
    card.querySelector('[data-action="remove"]').addEventListener('click', () => {
      const list = getFriendlyRoles();
      list.splice(index, 1);
      setFriendlyRoles(list);
      renderFriendlyEditors();
    });
    return card;
  }

  function highlightEditorCard(item, index) {
    const card = makeFriendlyEditorCard(`Highlight ${index + 1}`, `
      <label>Title<input data-field="title" value="${escapeAttr(item.title)}" /></label>
      <label class="full">Body<textarea data-field="body" rows="4">${escapeAttr(item.bodyText || '')}</textarea></label>
    `);
    card.querySelector('[data-action="remove"]').addEventListener('click', () => {
      const list = getFriendlyQuickHighlights();
      list.splice(index, 1);
      setFriendlyQuickHighlights(list);
      renderFriendlyEditors();
    });
    return card;
  }

  function competencyEditorCard(item, index) {
    const card = makeFriendlyEditorCard(`Competency ${index + 1}`, `
      <label>Kicker<input data-field="kicker" value="${escapeAttr(item.kicker || '')}" /></label>
      <label class="full">Description<textarea data-field="subtle" rows="3">${escapeAttr(item.subtle || '')}</textarea></label>
    `);
    card.querySelector('[data-action="remove"]').addEventListener('click', () => {
      const list = getFriendlyCompetencies();
      list.splice(index, 1);
      setFriendlyCompetencies(list);
      renderFriendlyEditors();
    });
    return card;
  }

  function certificationEditorCard(item, index, type) {
    const isCompleted = type === 'completed';
    // Map any existing label text into a month-input value (best effort)
    const issuedRaw = item.issued || item.date || '';
    const expiresRaw = item.expires || '';
    const expectedRaw = item.expected || item.date || '';
    const issuedMonth = isoToMonthInput(issuedRaw) || isoToMonthInput(parseDateLineToRange(issuedRaw).start) || '';
    const expiresMonth = isoToMonthInput(expiresRaw) || isoToMonthInput(parseDateLineToRange(expiresRaw).start) || '';
    const expectedMonth = isoToMonthInput(expectedRaw) || isoToMonthInput(parseDateLineToRange(expectedRaw).start) || '';

    const dateFieldsHtml = isCompleted
      ? `
        <label>Issued <span class="subtle">(optional)</span><input type="month" data-field="issuedMonth" value="${escapeAttr(issuedMonth)}" /></label>
        <label>Expires <span class="subtle">(optional)</span><input type="month" data-field="expiresMonth" value="${escapeAttr(expiresMonth)}" /></label>
      `
      : `
        <label>Started <span class="subtle">(optional)</span><input type="month" data-field="issuedMonth" value="${escapeAttr(issuedMonth)}" /></label>
        <label>Expected <span class="subtle">(optional)</span><input type="month" data-field="expectedMonth" value="${escapeAttr(expectedMonth)}" /></label>
      `;

    const card = makeFriendlyEditorCard(`${isCompleted ? 'Completed' : 'In Progress'} Cert ${index + 1}`, `
      <label class="full">Title<input data-field="text" value="${escapeAttr(item.text || '')}" /></label>
      ${dateFieldsHtml}
      <label class="full">Note<textarea data-field="note" rows="2">${escapeAttr(item.note || '')}</textarea></label>
    `);
    card.querySelector('[data-action="remove"]').addEventListener('click', () => {
      const list = isCompleted ? getFriendlyCompletedCerts() : getFriendlyProgressCerts();
      list.splice(index, 1);
      if (isCompleted) setFriendlyCompletedCerts(list);
      else setFriendlyProgressCerts(list);
      renderFriendlyEditors();
    });
    return card;
  }

  function htmlToText(htmlValue) {
    const div = document.createElement('div');
    div.innerHTML = htmlValue || '';
    return (div.textContent || '').trim();
  }

  function getFriendlyProjects() {
    return parseFieldJson('bulk-projects-json', []).map((item) => ({
      ...item,
      summaryText: htmlToText(item.summaryHtml),
      detailText: htmlToText(item.detailHtml),
    }));
  }

  function setFriendlyProjects(items) {
    const out = items.map((item, index) => {
      const dateLine = (item.dateLine && item.dateLine.trim())
        || dateLineFromRange(item.startMonth, item.endMonth, item.ongoing === true || item.ongoing === 'true')
        || '';
      const sortMs = monthInputToMs(item.endMonth) || monthInputToMs(item.startMonth) || parseTimelineSortMs(dateLine);
      const row = {
        slug: item.slug || makeSlug(item.title, `project-${index + 1}`),
        title: item.title || '',
        dateLine,
        startMonth: item.startMonth || '',
        endMonth: item.endMonth || '',
        ongoing: item.ongoing === true || item.ongoing === 'true',
        category: item.category || 'software',
        summaryHtml: item.summaryText ? `<p>${item.summaryText}</p>` : '',
        detailHtml: item.detailText ? `<p>${item.detailText.split('\n').join('</p><p>')}</p>` : '',
        chips: splitComma(item.chips || ''),
        media: splitLines(item.media || '').map((src) => ({ type: 'image', src })),
        timelineDateLabel: item.timelineDateLabel || dateLine || '',
        timelineEnabled: item.timelineEnabled !== false,
        timelineSortMs: item.timelineSortMs || sortMs,
        orderIndex: item.orderIndex || 1000 - index,
      };
      if (item.showHardwareGear === true) row.showHardwareGear = true;
      return row;
    });
    setTextarea('bulk-projects-json', out);
  }

  function getFriendlyEvents() {
    return parseFieldJson('bulk-events-json', []).map((item) => ({
      ...item,
      summaryText: htmlToText(item.summaryHtml),
      detailText: htmlToText(item.detailHtml),
    }));
  }

  function setFriendlyEvents(items) {
    const out = items.map((item, index) => {
      const dateLine = (item.dateLine && item.dateLine.trim())
        || dateLineFromRange(item.startMonth, item.endMonth, item.ongoing === true || item.ongoing === 'true')
        || '';
      const sortMs = monthInputToMs(item.endMonth) || monthInputToMs(item.startMonth) || parseTimelineSortMs(dateLine);
      return {
        slug: item.slug || makeSlug(item.title, `event-${index + 1}`),
        title: item.title || '',
        dateLine,
        startMonth: item.startMonth || '',
        endMonth: item.endMonth || '',
        ongoing: item.ongoing === true || item.ongoing === 'true',
        bucket: item.bucket || 'professional',
        summaryHtml: item.summaryText ? `<p>${item.summaryText}</p>` : '',
        detailHtml: item.detailText ? `<p>${item.detailText.split('\n').join('</p><p>')}</p>` : '',
        chips: splitComma(item.chips || ''),
        media: splitLines(item.media || '').map((src) => ({ type: 'image', src })),
        timelineDateLabel: item.timelineDateLabel || dateLine || '',
        timelineEnabled: item.timelineEnabled !== false,
        timelineSortMs: item.timelineSortMs || sortMs,
        orderIndex: item.orderIndex || 1000 - index,
      };
    });
    setTextarea('bulk-events-json', out);
  }

  function getFriendlyExperience() {
    return parseFieldJson('bulk-experience-json', []);
  }

  function setFriendlyExperience(items) {
    const out = items.map((item, index) => {
      const dateLine = (item.dateLine && item.dateLine.trim())
        || dateLineFromRange(item.startMonth, item.endMonth, item.ongoing === true || item.ongoing === 'true')
        || '';
      const sortMs = monthInputToMs(item.endMonth) || monthInputToMs(item.startMonth) || parseTimelineSortMs(dateLine);
      return {
        slug: item.slug || makeSlug(item.title, `experience-${index + 1}`),
        title: item.title || '',
        meta: item.meta || '',
        dateLine,
        startMonth: item.startMonth || '',
        endMonth: item.endMonth || '',
        ongoing: item.ongoing === true || item.ongoing === 'true',
        section: item.section || 'professional',
        bullets: Array.isArray(item.bullets) ? item.bullets : splitLines(item.bullets || ''),
        chips: splitComma(item.chips || ''),
        timelineDateLabel: item.timelineDateLabel || dateLine || '',
        timelineEnabled: item.timelineEnabled !== false,
        timelineSortMs: item.timelineSortMs || sortMs,
        orderIndex: item.orderIndex || 1000 - index,
      };
    });
    setTextarea('bulk-experience-json', out);
  }

  function getFriendlySchools() {
    const coursework = parseFieldJson('coursework-page-json-field', {});
    if (Array.isArray(coursework.institutions) && coursework.institutions.length) {
      return coursework.institutions.map((item) => ({ ...item, noteText: htmlToText(item.noteHtml) }));
    }
    if (Array.isArray(coursework.categories) && coursework.categories.length) {
      return [
        {
          name: coursework.defaultSchoolName || '',
          subtitle: coursework.panelSubtitle || '',
          categories: coursework.categories,
          noteText: htmlToText(coursework.noteHtml),
        },
      ];
    }
    return [];
  }

  function setFriendlySchools(items) {
    const coursework = parseFieldJson('coursework-page-json-field', {});
    coursework.institutions = items.map((item) => ({
      name: item.name || '',
      subtitle: item.subtitle || '',
      categories: String(item.categories || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [title, values] = line.split(':');
          return {
            title: (title || '').trim(),
            items: String(values || '')
              .split('|')
              .map((entry) => entry.trim())
              .filter(Boolean),
          };
        }),
      noteHtml: item.noteText ? `<p>${String(item.noteText).split('\n').join('</p><p>')}</p>` : '',
    }));
    if (coursework.institutions.length) {
      delete coursework.categories;
    }
    setTextarea('coursework-page-json-field', coursework);
  }

  function getFriendlyContactActions() {
    const contact = parseFieldJson('contact-page-json-field', {});
    return Array.isArray(contact.actions) ? contact.actions : [];
  }

  function setFriendlyContactActions(items) {
    const contact = parseFieldJson('contact-page-json-field', {});
    contact.actions = items.map((item) => ({
      label: item.label || '',
      href: item.href || '',
      variant: item.variant || 'ghost',
      external: item.external === true || item.external === 'true',
    }));
    setTextarea('contact-page-json-field', contact);
  }

  function getFriendlyContactCards() {
    const contact = parseFieldJson('contact-page-json-field', {});
    return Array.isArray(contact.cards)
      ? contact.cards.map((item) => ({ ...item, bodyText: htmlToText(item.bodyHtml || item.body) }))
      : [];
  }

  function setFriendlyContactCards(items) {
    const contact = parseFieldJson('contact-page-json-field', {});
    contact.cards = items.map((item) => ({
      title: item.title || '',
      bodyHtml: item.bodyText ? `<p>${String(item.bodyText).split('\n').join('</p><p>')}</p>` : '',
    }));
    setTextarea('contact-page-json-field', contact);
  }

  function getFriendlyAchievementCards() {
    return parseFieldJson('achievement-cards-json-field', []).map((item) => ({
      ...item,
      bodyText: htmlToText(item.bodyHtml || item.body),
    }));
  }

  function setFriendlyAchievementCards(items) {
    const out = items.map((item) => ({
      title: item.title || '',
      meta: item.meta || '',
      bodyHtml: item.bodyText ? `<p>${String(item.bodyText).split('\n').join('</p><p>')}</p>` : '',
    }));
    setTextarea('achievement-cards-json-field', out);
  }

  function getFriendlyRoles() {
    return parseFieldJson('bulk-roles-json', []).map((item) => ({
      ...item,
      summaryText: htmlToText(item.summaryHtml),
    }));
  }

  function setFriendlyRoles(items) {
    const out = items.map((item, index) => ({
      slug: item.slug || makeSlug(item.title, `role-${index + 1}`),
      title: item.title || '',
      summaryHtml: item.summaryText ? `<p>${String(item.summaryText).split('\n').join('</p><p>')}</p>` : '',
      timelineEnabled: true,
      timelineDateLabel: item.timelineDateLabel || '',
      timelineSortMs: item.timelineSortMs || parseTimelineSortMs(item.timelineDateLabel || ''),
    }));
    setTextarea('bulk-roles-json', out);
  }

  function getFriendlyQuickHighlights() {
    return parseFieldJson('quick-highlights-json-field', []).map((item) => ({
      ...item,
      bodyText: htmlToText(item.bodyHtml || item.body),
    }));
  }

  function setFriendlyQuickHighlights(items) {
    setTextarea('quick-highlights-json-field', items.map((item) => ({
      title: item.title || '',
      body: item.bodyText || '',
    })));
  }

  function getFriendlyCompetencies() {
    return parseFieldJson('competencies-json-field', []);
  }

  function setFriendlyCompetencies(items) {
    setTextarea('competencies-json-field', items.map((item) => ({
      kicker: item.kicker || '',
      subtle: item.subtle || '',
    })));
  }

  function normalizeCertCompleted(c) {
    if (typeof c === 'string') return { text: c, date: '', issued: '', expires: '', note: '' };
    return {
      text: c.text || c.title || '',
      date: c.date || c.issued || c.earned || '',
      issued: c.issued || c.date || c.earned || '',
      expires: c.expires || c.expiry || '',
      note: c.note || '',
    };
  }

  function normalizeCertProgress(c) {
    if (typeof c === 'string') return { text: c, date: '', issued: '', expected: '', note: '' };
    return {
      text: c.text || c.title || '',
      date: c.date || c.expected || '',
      issued: c.issued || c.started || '',
      expected: c.expected || c.expectedBy || c.date || '',
      note: c.note || '',
    };
  }

  function getFriendlyCompletedCerts() {
    const certifications = parseFieldJson('certifications-json-field', {});
    return Array.isArray(certifications.completed) ? certifications.completed.map(normalizeCertCompleted) : [];
  }

  function setFriendlyCompletedCerts(items) {
    const certifications = parseFieldJson('certifications-json-field', {});
    certifications.completed = items.map((item) => {
      const issued = monthInputToLabel(item.issuedMonth) || item.issued || item.date || '';
      const expires = monthInputToLabel(item.expiresMonth) || item.expires || '';
      const out = { text: item.text || '', note: item.note || '' };
      if (issued) out.issued = issued;
      if (expires) out.expires = expires;
      return out;
    });
    setTextarea('certifications-json-field', certifications);
  }

  function getFriendlyProgressCerts() {
    const certifications = parseFieldJson('certifications-json-field', {});
    return Array.isArray(certifications.inProgress) ? certifications.inProgress.map(normalizeCertProgress) : [];
  }

  function setFriendlyProgressCerts(items) {
    const certifications = parseFieldJson('certifications-json-field', {});
    certifications.inProgress = items.map((item) => {
      const issued = monthInputToLabel(item.issuedMonth) || item.issued || '';
      const expected = monthInputToLabel(item.expectedMonth) || item.expected || item.date || '';
      const out = { text: item.text || '', note: item.note || '' };
      if (issued) out.issued = issued;
      if (expected) out.expected = expected;
      return out;
    });
    setTextarea('certifications-json-field', certifications);
  }

  function syncFriendlyTextFields() {
    setTextarea('home-hero-json-field', {
      eyebrow: document.getElementById('friendly-home-eyebrow')?.value?.trim() || '',
      titleHtml: (() => {
        const value = document.getElementById('friendly-home-title')?.value?.trim() || '';
        return value ? `<h1>${escapeHtml(value)}</h1>` : '';
      })(),
      lead: document.getElementById('friendly-home-lead')?.value?.trim() || '',
    });
    setTextarea('projects-page-json-field', {
      heading: document.getElementById('friendly-projects-heading')?.value?.trim() || '',
      intro: document.getElementById('friendly-projects-intro')?.value?.trim() || '',
    });
    setTextarea('events-page-json-field', {
      heading: document.getElementById('friendly-events-heading')?.value?.trim() || '',
      intro: document.getElementById('friendly-events-intro')?.value?.trim() || '',
      competitionsHeading: document.getElementById('friendly-events-competitions-heading')?.value?.trim() || '',
      competitionsIntro: document.getElementById('friendly-events-competitions-intro')?.value?.trim() || '',
    });
    setTextarea('timeline-page-json-field', {
      heading: document.getElementById('friendly-timeline-heading')?.value?.trim() || '',
      intro: document.getElementById('friendly-timeline-intro')?.value?.trim() || '',
    });
    setTextarea('experience-page-json-field', {
      heading: document.getElementById('friendly-experience-heading')?.value?.trim() || '',
      intro: document.getElementById('friendly-experience-intro')?.value?.trim() || '',
      professionalHeading: document.getElementById('friendly-experience-professional-heading')?.value?.trim() || '',
      campusHeading: document.getElementById('friendly-experience-campus-heading')?.value?.trim() || '',
    });
    setTextarea('achievements-page-json-field', {
      heading: document.getElementById('friendly-achievements-heading')?.value?.trim() || '',
    });
    const contact = parseFieldJson('contact-page-json-field', {});
    contact.heading = document.getElementById('friendly-contact-heading')?.value?.trim() || '';
    contact.introHtml = (() => {
      const value = document.getElementById('friendly-contact-intro')?.value?.trim() || '';
      return value ? `<p>${value.split('\n').join('</p><p>')}</p>` : '';
    })();
    setTextarea('contact-page-json-field', contact);
    const coursework = parseFieldJson('coursework-page-json-field', {});
    coursework.panelTitle = document.getElementById('friendly-coursework-heading')?.value?.trim() || '';
    coursework.panelSubtitle = document.getElementById('friendly-coursework-subtitle')?.value?.trim() || '';
    const note = document.getElementById('friendly-coursework-note')?.value?.trim() || '';
    coursework.noteHtml = note ? `<p>${note.split('\n').join('</p><p>')}</p>` : '';
    setTextarea('coursework-page-json-field', coursework);
    const homeSummary = document.getElementById('friendly-home-summary')?.value?.trim() || '';
    setTextarea('home-summary-html-field', homeSummary ? `<p>${homeSummary.split('\n').join('</p><p>')}</p>` : '');
  }

  function setFriendlyInput(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? '';
  }

  function loadFriendlyTextFields() {
    const homeHero = parseFieldJson('home-hero-json-field', {});
    const projectsPage = parseFieldJson('projects-page-json-field', {});
    const eventsPage = parseFieldJson('events-page-json-field', {});
    const timelinePage = parseFieldJson('timeline-page-json-field', {});
    const experiencePage = parseFieldJson('experience-page-json-field', {});
    const achievementsPage = parseFieldJson('achievements-page-json-field', {});
    const contact = parseFieldJson('contact-page-json-field', {});
    const coursework = parseFieldJson('coursework-page-json-field', {});
    const theme = parseFieldJson('theme-json-field', {});

    setFriendlyInput('friendly-home-eyebrow', homeHero.eyebrow || '');
    setFriendlyInput('friendly-home-title', htmlToText(homeHero.titleHtml));
    setFriendlyInput('friendly-home-lead', homeHero.lead || '');
    setFriendlyInput('friendly-home-summary', htmlToText(document.getElementById('home-summary-html-field')?.value || ''));
    setFriendlyInput('friendly-projects-heading', projectsPage.heading || '');
    setFriendlyInput('friendly-projects-intro', projectsPage.intro || '');
    setFriendlyInput('friendly-events-heading', eventsPage.heading || '');
    setFriendlyInput('friendly-events-intro', eventsPage.intro || '');
    setFriendlyInput('friendly-events-competitions-heading', eventsPage.competitionsHeading || '');
    setFriendlyInput('friendly-events-competitions-intro', eventsPage.competitionsIntro || '');
    setFriendlyInput('friendly-timeline-heading', timelinePage.heading || '');
    setFriendlyInput('friendly-timeline-intro', timelinePage.intro || '');
    setFriendlyInput('friendly-experience-heading', experiencePage.heading || '');
    setFriendlyInput('friendly-experience-intro', experiencePage.intro || '');
    setFriendlyInput('friendly-experience-professional-heading', experiencePage.professionalHeading || '');
    setFriendlyInput('friendly-experience-campus-heading', experiencePage.campusHeading || '');
    setFriendlyInput('friendly-achievements-heading', achievementsPage.heading || '');
    setFriendlyInput('friendly-contact-heading', contact.heading || '');
    setFriendlyInput('friendly-contact-intro', htmlToText(contact.introHtml || contact.intro || ''));
    setFriendlyInput('friendly-coursework-heading', coursework.panelTitle || '');
    setFriendlyInput('friendly-coursework-subtitle', coursework.panelSubtitle || '');
    setFriendlyInput('friendly-coursework-note', htmlToText(coursework.noteHtml));

    setFriendlyInput('friendly-theme-accent', theme.accent || '');
    setFriendlyInput('friendly-theme-accent2', theme.accent2 || '');
    setFriendlyInput('friendly-theme-bg', theme.bg || '');
    setFriendlyInput('friendly-theme-surface', theme.surface || '');
    setFriendlyInput('friendly-theme-surface2', theme.surface2 || '');
    setFriendlyInput('friendly-theme-text', theme.text || '');
    setFriendlyInput('friendly-theme-muted', theme.muted || '');
    setFriendlyInput('friendly-theme-border', theme.border || '');
    setFriendlyInput('friendly-theme-timeline-role', theme.timelineRole || '');
    setFriendlyInput('friendly-theme-timeline-project', theme.timelineProject || '');
    setFriendlyInput('friendly-theme-timeline-event', theme.timelineEvent || '');
    setFriendlyInput('friendly-theme-timeline-line', theme.timelineLine || '');
  }

  function renderFriendlyEditors() {
    try {
      loadFriendlyTextFields();
    } catch (err) {
      console.error('[admin-cms] loadFriendlyTextFields failed', err);
    }
    renderFriendlyList('friendly-project-list', getFriendlyProjects(), projectEditorCard);
    renderFriendlyList('friendly-event-list', getFriendlyEvents(), eventEditorCard);
    renderFriendlyList('friendly-experience-list', getFriendlyExperience(), experienceEditorCard);
    renderFriendlyList('friendly-role-list', getFriendlyRoles(), roleEditorCard);
    renderFriendlyList('friendly-highlight-list', getFriendlyQuickHighlights(), highlightEditorCard);
    renderFriendlyList('friendly-competency-list', getFriendlyCompetencies(), competencyEditorCard);
    renderFriendlyList('friendly-cert-completed-list', getFriendlyCompletedCerts(), (item, index) => certificationEditorCard(item, index, 'completed'));
    renderFriendlyList('friendly-cert-progress-list', getFriendlyProgressCerts(), (item, index) => certificationEditorCard(item, index, 'progress'));
    renderFriendlyList('friendly-school-list', getFriendlySchools(), schoolEditorCard);
    renderFriendlyList('friendly-contact-action-list', getFriendlyContactActions(), contactActionEditorCard);
    renderFriendlyList('friendly-contact-card-list', getFriendlyContactCards(), contactCardEditorCard);
    renderFriendlyList('friendly-achievement-card-list', getFriendlyAchievementCards(), achievementCardEditorCard);
  }

  function syncFriendlyEditorsToJson() {
    const collectFromCards = (containerId, mapper) =>
      [...document.querySelectorAll(`#${containerId} .admin-editor-card`)].map(mapper);

    const readDateRange = (card) => ({
      startMonth: card.querySelector('[data-field="startMonth"]')?.value || '',
      endMonth: card.querySelector('[data-field="endMonth"]')?.value || '',
      ongoing: !!card.querySelector('[data-field="ongoing"]')?.checked,
      dateLine: card.querySelector('[data-field="dateLine"]')?.value.trim() || '',
    });
    setFriendlyProjects(
      collectFromCards('friendly-project-list', (card) => ({
        title: card.querySelector('[data-field="title"]').value.trim(),
        slug: card.querySelector('[data-field="slug"]').value.trim(),
        ...readDateRange(card),
        category: card.querySelector('[data-field="category"]').value,
        showHardwareGear: !!card.querySelector('[data-field="showHardwareGear"]')?.checked,
        summaryText: card.querySelector('[data-field="summary"]').value.trim(),
        detailText: card.querySelector('[data-field="details"]').value.trim(),
        chips: card.querySelector('[data-field="chips"]').value.trim(),
        media: card.querySelector('[data-field="media"]').value.trim(),
      }))
    );
    setFriendlyEvents(
      collectFromCards('friendly-event-list', (card) => ({
        title: card.querySelector('[data-field="title"]').value.trim(),
        slug: card.querySelector('[data-field="slug"]').value.trim(),
        ...readDateRange(card),
        bucket: card.querySelector('[data-field="bucket"]').value,
        summaryText: card.querySelector('[data-field="summary"]').value.trim(),
        detailText: card.querySelector('[data-field="details"]').value.trim(),
        chips: card.querySelector('[data-field="chips"]').value.trim(),
        media: card.querySelector('[data-field="media"]').value.trim(),
      }))
    );
    setFriendlyExperience(
      collectFromCards('friendly-experience-list', (card) => ({
        title: card.querySelector('[data-field="title"]').value.trim(),
        slug: card.querySelector('[data-field="slug"]').value.trim(),
        ...readDateRange(card),
        section: card.querySelector('[data-field="section"]').value,
        meta: card.querySelector('[data-field="meta"]').value.trim(),
        bullets: card.querySelector('[data-field="bullets"]').value.trim(),
        chips: card.querySelector('[data-field="chips"]').value.trim(),
      }))
    );
    setFriendlyRoles(
      collectFromCards('friendly-role-list', (card) => ({
        title: card.querySelector('[data-field="title"]').value.trim(),
        slug: card.querySelector('[data-field="slug"]').value.trim(),
        timelineDateLabel: card.querySelector('[data-field="timelineDateLabel"]').value.trim(),
        summaryText: card.querySelector('[data-field="summary"]').value.trim(),
      }))
    );
    setFriendlyQuickHighlights(
      collectFromCards('friendly-highlight-list', (card) => ({
        title: card.querySelector('[data-field="title"]').value.trim(),
        bodyText: card.querySelector('[data-field="body"]').value.trim(),
      }))
    );
    setFriendlyCompetencies(
      collectFromCards('friendly-competency-list', (card) => ({
        kicker: card.querySelector('[data-field="kicker"]').value.trim(),
        subtle: card.querySelector('[data-field="subtle"]').value.trim(),
      }))
    );
    setFriendlyCompletedCerts(
      collectFromCards('friendly-cert-completed-list', (card) => ({
        text: card.querySelector('[data-field="text"]').value.trim(),
        issuedMonth: card.querySelector('[data-field="issuedMonth"]')?.value || '',
        expiresMonth: card.querySelector('[data-field="expiresMonth"]')?.value || '',
        note: card.querySelector('[data-field="note"]').value.trim(),
      }))
    );
    setFriendlyProgressCerts(
      collectFromCards('friendly-cert-progress-list', (card) => ({
        text: card.querySelector('[data-field="text"]').value.trim(),
        issuedMonth: card.querySelector('[data-field="issuedMonth"]')?.value || '',
        expectedMonth: card.querySelector('[data-field="expectedMonth"]')?.value || '',
        note: card.querySelector('[data-field="note"]').value.trim(),
      }))
    );
    setFriendlySchools(
      collectFromCards('friendly-school-list', (card) => ({
        name: card.querySelector('[data-field="name"]').value.trim(),
        subtitle: card.querySelector('[data-field="subtitle"]').value.trim(),
        categories: card.querySelector('[data-field="categories"]').value.trim(),
        noteText: card.querySelector('[data-field="noteHtml"]').value.trim(),
      }))
    );
    setFriendlyContactActions(
      collectFromCards('friendly-contact-action-list', (card) => ({
        label: card.querySelector('[data-field="label"]').value.trim(),
        href: card.querySelector('[data-field="href"]').value.trim(),
        variant: card.querySelector('[data-field="variant"]').value,
        external: card.querySelector('[data-field="external"]').value,
      }))
    );
    setFriendlyContactCards(
      collectFromCards('friendly-contact-card-list', (card) => ({
        title: card.querySelector('[data-field="title"]').value.trim(),
        bodyText: card.querySelector('[data-field="body"]').value.trim(),
      }))
    );
    setFriendlyAchievementCards(
      collectFromCards('friendly-achievement-card-list', (card) => ({
        title: card.querySelector('[data-field="title"]').value.trim(),
        meta: card.querySelector('[data-field="meta"]').value.trim(),
        bodyText: card.querySelector('[data-field="body"]').value.trim(),
      }))
    );
    syncFriendlyTextFields();
    setTextarea('theme-json-field', {
      accent: document.getElementById('friendly-theme-accent')?.value?.trim() || '',
      accent2: document.getElementById('friendly-theme-accent2')?.value?.trim() || '',
      bg: document.getElementById('friendly-theme-bg')?.value?.trim() || '',
      surface: document.getElementById('friendly-theme-surface')?.value?.trim() || '',
      surface2: document.getElementById('friendly-theme-surface2')?.value?.trim() || '',
      text: document.getElementById('friendly-theme-text')?.value?.trim() || '',
      muted: document.getElementById('friendly-theme-muted')?.value?.trim() || '',
      border: document.getElementById('friendly-theme-border')?.value?.trim() || '',
      timelineRole: document.getElementById('friendly-theme-timeline-role')?.value?.trim() || '',
      timelineProject: document.getElementById('friendly-theme-timeline-project')?.value?.trim() || '',
      timelineEvent: document.getElementById('friendly-theme-timeline-event')?.value?.trim() || '',
      timelineLine: document.getElementById('friendly-theme-timeline-line')?.value?.trim() || '',
    });
  }

  /** Expose immediately so “Save Changes” can sync friendly fields → hidden JSON before initAdminCmsExtensions finishes. */
  window.syncFriendlyCmsEditors = syncFriendlyEditorsToJson;

  async function publishAllFromEditor() {
    if (!window.CmsApi.isAdminUser()) throw new Error('Admin sign-in required');
    await window.CmsApi.saveConfigSite(collectConfigPayloadFromEditor());
    await publishCollection('site_projects', document.getElementById('bulk-projects-json')?.value, 'slug');
    await publishCollection('site_events', document.getElementById('bulk-events-json')?.value, 'slug');
    await publishCollection('site_roles', document.getElementById('bulk-roles-json')?.value, 'slug');
    await publishCollection('site_experience', document.getElementById('bulk-experience-json')?.value, 'slug');
  }

  window.initAdminCmsExtensions = async function initAdminCmsExtensions() {
    ts('info', 'admin-cms', 'initAdminCmsExtensions: START');
    const firebaseOk = !!(window.CmsApi && typeof window.CmsApi.firebaseConfigured === 'function' && window.CmsApi.firebaseConfigured());
    ts('info', 'admin-cms', 'initAdminCmsExtensions: flags', {
      firebaseOk,
      firebaseApps:
        typeof firebase !== 'undefined' && firebase.apps ? firebase.apps.length : '(n/a)',
      cmsApi: typeof window.CmsApi !== 'undefined',
      editorEmptyBeforeLoad: editorLooksEmpty(),
    });

    try {
      if (firebaseOk) {
        await fillFormFromFirebase();
        ts('debug', 'admin-cms', 'After Firebase fill: editorLooksEmpty=', editorLooksEmpty());
      } else {
        ts('warn', 'admin-cms', 'Skipping Firebase fill (firebaseConfigured() false — check js/firebase-config.js)');
      }
      if (!firebaseOk || editorLooksEmpty()) {
        ts('info', 'admin-cms', 'Data path: full static import (loadStaticSiteIntoEditor)');
        await loadStaticSiteIntoEditor();
      } else {
        ts('info', 'admin-cms', 'Data path: partial hydrate from static HTML (hydrateMissingEditorSectionsFromStatic)');
        await hydrateMissingEditorSectionsFromStatic();
      }
    } catch (err) {
      ts('error', 'admin-cms', 'Primary load/hydrate failed — trying full static import fallback', err);
      console.error('[admin-cms] Failed to load or hydrate editor data', err);
      try {
        await loadStaticSiteIntoEditor();
        ts('info', 'admin-cms', 'Fallback loadStaticSiteIntoEditor succeeded after error');
      } catch (err2) {
        ts('error', 'admin-cms', 'Fallback static import also failed', err2);
        console.error('[admin-cms] Static site import failed', err2);
      }
    }

    window.refreshAdminFriendlyEditors = renderFriendlyEditors;
    const openAdminTab = bindAdminTabs();
    ts('info', 'admin-cms', 'bindAdminTabs() executed; rendering friendly editors');
    try {
      renderFriendlyEditors();
      ts('info', 'admin-cms', 'renderFriendlyEditors: OK', {
        eyebrowLen: document.getElementById('friendly-home-eyebrow')?.value?.length ?? -1,
        titleLen: document.getElementById('friendly-home-title')?.value?.length ?? -1,
        leadLen: document.getElementById('friendly-home-lead')?.value?.length ?? -1,
        resumeField: (document.getElementById('resume-url-field')?.value || '').slice(0, 80),
        highlightCards: document.getElementById('friendly-highlight-list')?.children?.length ?? -1,
        competencyCards: document.getElementById('friendly-competency-list')?.children?.length ?? -1,
      });
    } catch (err) {
      ts('error', 'admin-cms', 'renderFriendlyEditors failed', err);
      console.error('[admin-cms] renderFriendlyEditors failed', err);
    }

    const msg = document.getElementById('admin-message');
    const loadBtn = document.getElementById('load-static-cms-btn');
    const publishAllBtn = document.getElementById('publish-all-rtdb-btn');
    const saveBtn = document.getElementById('save-blocks');
    const openLinksBtn = document.getElementById('open-links-tab-btn');
    const openMediaBtn = document.getElementById('open-media-tab-btn');

    const addTemplates = {
      'friendly-add-project': [getFriendlyProjects, setFriendlyProjects, { title: '', slug: '', dateLine: '', startMonth: '', endMonth: '', ongoing: false, category: 'software', summaryText: '', detailText: '', chips: '', media: '' }],
      'friendly-add-event': [getFriendlyEvents, setFriendlyEvents, { title: '', slug: '', dateLine: '', startMonth: '', endMonth: '', ongoing: false, bucket: 'professional', summaryText: '', detailText: '', chips: '', media: '' }],
      'friendly-add-experience': [getFriendlyExperience, setFriendlyExperience, { title: '', slug: '', dateLine: '', startMonth: '', endMonth: '', ongoing: false, section: 'professional', meta: '', bullets: [], chips: '' }],
      'friendly-add-role': [getFriendlyRoles, setFriendlyRoles, { title: '', slug: '', timelineDateLabel: '', summaryText: '' }],
      'friendly-add-highlight': [getFriendlyQuickHighlights, setFriendlyQuickHighlights, { title: '', bodyText: '' }],
      'friendly-add-competency': [getFriendlyCompetencies, setFriendlyCompetencies, { kicker: '', subtle: '' }],
      'friendly-add-cert-completed': [getFriendlyCompletedCerts, setFriendlyCompletedCerts, { text: '', date: '', note: '' }],
      'friendly-add-cert-progress': [getFriendlyProgressCerts, setFriendlyProgressCerts, { text: '', date: '', note: '' }],
      'friendly-add-school': [getFriendlySchools, setFriendlySchools, { name: '', subtitle: '', categories: '', noteText: '' }],
      'friendly-add-achievement-card': [getFriendlyAchievementCards, setFriendlyAchievementCards, { title: '', meta: '', bodyText: '' }],
      'friendly-add-contact-action': [getFriendlyContactActions, setFriendlyContactActions, { label: '', href: '', variant: 'ghost', external: false }],
      'friendly-add-contact-card': [getFriendlyContactCards, setFriendlyContactCards, { title: '', bodyText: '' }],
    };

    if (!document.body.dataset.adminCmsDelegateBound) {
      document.body.dataset.adminCmsDelegateBound = '1';
      document.addEventListener(
        'click',
        (event) => {
          const target = event.target.closest('button, [data-admin-tab]');
          if (!target) return;

          const tabName = target.getAttribute('data-admin-tab');
          if (tabName) {
            event.preventDefault();
            event.stopImmediatePropagation();
            openAdminTab(tabName);
            ts('debug', 'admin-cms', 'Delegated tab open', { tab: tabName });
            return;
          }

          if (target.id === 'open-links-tab-btn' || target.id === 'open-media-tab-btn') {
            event.preventDefault();
            event.stopImmediatePropagation();
            openAdminTab('media');
            ts('debug', 'admin-cms', 'Delegated media tab shortcut', { source: target.id });
            return;
          }

          const action = addTemplates[target.id];
          if (!action) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          const [getter, setter, template] = action;
          const list = getter();
          list.push(template);
          setter(list);
          renderFriendlyEditors();
          ts('info', 'admin-cms', 'Delegated add action', {
            button: target.id,
            countAfter: Array.isArray(getter()) ? getter().length : '(n/a)',
          });
        },
        true
      );
    }

    if (openLinksBtn && !openLinksBtn.dataset.bound) {
      openLinksBtn.dataset.bound = '1';
      openLinksBtn.addEventListener('click', () => openAdminTab('media'));
    }
    if (openMediaBtn && !openMediaBtn.dataset.bound) {
      openMediaBtn.dataset.bound = '1';
      openMediaBtn.addEventListener('click', () => openAdminTab('media'));
    }

    Object.entries(addTemplates).forEach(([id, [getter, setter, template]]) => {
      const btn = document.getElementById(id);
      if (!btn || btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        const list = getter();
        list.push(template);
        setter(list);
        renderFriendlyEditors();
      });
    });

    if (saveBtn && !saveBtn.dataset.friendlySyncBound) {
      saveBtn.dataset.friendlySyncBound = '1';
      saveBtn.addEventListener('click', () => {
        syncFriendlyEditorsToJson();
      }, true);
    }

    if (loadBtn && !loadBtn.dataset.bound) {
      loadBtn.dataset.bound = '1';
      loadBtn.addEventListener('click', async () => {
        ts('info', 'admin-cms', 'User clicked "Load Current Site Into CMS"');
        msg.textContent = 'Loading current static site into the CMS editor…';
        try {
          await loadStaticSiteIntoEditor();
          renderFriendlyEditors();
          msg.textContent = 'Loaded current site content into the CMS editor. Review and publish when ready.';
          ts('info', 'admin-cms', 'Manual static load completed', { editorLooksEmpty: editorLooksEmpty() });
        } catch (e) {
          ts('error', 'admin-cms', 'Manual static load failed', e);
          msg.textContent = e.message || 'Static import failed.';
        }
        setTimeout(() => (msg.textContent = ''), 5000);
      });
    }

    if (publishAllBtn && !publishAllBtn.dataset.bound) {
      publishAllBtn.dataset.bound = '1';
      publishAllBtn.addEventListener('click', async () => {
        msg.textContent = 'Publishing config and all collections to Realtime Database…';
        try {
          await publishAllFromEditor();
          msg.textContent = 'Published config, projects, events, roles, and experience to Realtime Database.';
        } catch (e) {
          msg.textContent = e.message || 'Full Realtime Database publish failed.';
        }
        setTimeout(() => (msg.textContent = ''), 5000);
      });
    }

    const resumeUploadBtn = document.getElementById('resume-upload-btn');
    if (resumeUploadBtn && resumeUploadBtn.dataset.bound !== '1') {
      resumeUploadBtn.dataset.bound = '1';
      resumeUploadBtn.addEventListener('click', async () => {
        const input = document.getElementById('resume-file-input');
        const file = input?.files?.[0];
        if (!file) {
          msg.textContent = 'Choose a PDF first.';
          setTimeout(() => (msg.textContent = ''), 2500);
          return;
        }
        if (typeof firebase === 'undefined' || typeof firebase.storage !== 'function') {
          msg.textContent = 'Firebase SDK not loaded — cannot upload.';
          setTimeout(() => (msg.textContent = ''), 4000);
          return;
        }
        try {
          window.CmsApi.initFirebase();
          const storageRef = firebase.storage().ref(`site/resume/${file.name.replace(/\s+/g, '_')}`);
          ts('info', 'admin-cms', 'Resume upload: starting Storage put', { name: file.name, size: file.size });
          await storageRef.put(file);
          const url = await storageRef.getDownloadURL();
          const resumeEl = document.getElementById('resume-url-field');
          if (resumeEl) resumeEl.value = url;
          msg.textContent = 'Resume uploaded. URL filled — click Save Changes to sync config to Firebase.';
          ts('info', 'admin-cms', 'Resume upload: success', { urlPreview: url.slice(0, 96) });
          setTimeout(() => (msg.textContent = ''), 4000);
        } catch (e) {
          ts('error', 'admin-cms', 'Resume upload failed', e);
          msg.textContent = e.message || 'Upload failed.';
          setTimeout(() => (msg.textContent = ''), 4000);
        }
      });
    }

    const publishCollBtn = document.getElementById('publish-collections-btn');
    if (publishCollBtn && publishCollBtn.dataset.bound !== '1') {
      publishCollBtn.dataset.bound = '1';
      publishCollBtn.addEventListener('click', async () => {
        if (!window.CmsApi.isAdminUser()) return;
        syncFriendlyEditorsToJson();
        msg.textContent = 'Publishing collections…';
        try {
          await publishCollection(
            'site_projects',
            document.getElementById('bulk-projects-json')?.value,
            'slug'
          );
          await publishCollection(
            'site_events',
            document.getElementById('bulk-events-json')?.value,
            'slug'
          );
          await publishCollection('site_roles', document.getElementById('bulk-roles-json')?.value, 'slug');
          await publishCollection(
            'site_experience',
            document.getElementById('bulk-experience-json')?.value,
            'slug'
          );
          msg.textContent = 'Published projects, events, roles, and experience to Realtime Database.';
          setTimeout(() => (msg.textContent = ''), 3500);
        } catch (e) {
          msg.textContent = e.message || 'Publish failed.';
          setTimeout(() => (msg.textContent = ''), 5000);
        }
      });
    }

    const help = document.getElementById('cms-json-help');
    if (help) {
      help.innerHTML = `
        <p class="subtle"><strong>Projects / events / experience:</strong> add <code>media</code>: <code>[{ type: "image"|"video"|"youtube"|"link", src, caption?, alt? }]</code> and optional <code>actions</code>: <code>[{ label, href, variant?, external? }]</code>.</p>
        <p class="subtle"><strong>Projects tagging:</strong> use <code>chips</code>: <code>["AI","Hardware","Security"]</code> for visible tags and <code>category</code>: <code>hardware</code> | <code>software</code> | <code>hybrid</code> for filtering.</p>
        <p class="subtle"><strong>Timeline:</strong> entries auto-link by <code>slug</code>. Use <code>timelineSortMs</code> for exact ordering, or let the site infer order from <code>dateLine</code>. Optional <code>timelineLinkKind</code>: <code>project</code> | <code>event</code> | <code>experience</code> | <code>external</code> | <code>custom</code>.</p>
        <p class="subtle"><strong>Experience entries:</strong> <code>section</code>: <code>professional</code> or <code>campus</code>; <code>orderIndex</code> (higher = closer to top). Experience rows now auto-feed the timeline when they have a date.</p>
        <p class="subtle"><strong>Events:</strong> <code>bucket</code>: <code>professional</code> | <code>competitions</code>.</p>
        <p class="subtle"><strong>Coursework:</strong> use <code>courseworkPage.institutions</code> for schools and per-school course groups. Use <code>noteHtml</code> for Coursework Note.</p>
        <p class="subtle"><strong>Contact / collaboration:</strong> use <code>contactPage.actions</code> and <code>contactPage.cards</code> to control links, emails, profile URLs, and contact methods.</p>
      `;
    }

    ts('info', 'admin-cms', 'initAdminCmsExtensions: FINISHED (tabs, friendly buttons, save/load/publish handlers attached)');
  };
})();
