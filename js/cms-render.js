/**
 * Loads CMS documents and renders dynamic regions. Falls back to static HTML when empty.
 */
(function () {
  function escapeHtml(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  function stripHtml(html) {
    if (!html) return '';
    const d = document.createElement('div');
    d.innerHTML = String(html);
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function parseSortMs(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  /** Resolve timeline link: internal project/event/experience slug or external URL. */
  function timelineHref(entry, kind) {
    if (entry.timelineHref) return entry.timelineHref;
    const lk = (entry.timelineLinkKind || '').toLowerCase();
    const slug = String(entry.timelineLinkSlug || entry.slug || '').replace(/^#/, '');
    if (lk === 'external' && entry.timelineExternalUrl) return entry.timelineExternalUrl;
    if (lk === 'project' || (!lk && kind === 'project')) return `./projects.html#${slug}`;
    if (lk === 'event') return `./events.html#${slug}`;
    if (lk === 'experience') return `./experience.html#${slug}`;
    if (lk === 'custom' && entry.timelineExternalUrl) return entry.timelineExternalUrl;
    if (kind === 'project') return `./projects.html#${slug}`;
    if (kind === 'event') return `./events.html#${slug}`;
    if (kind === 'role') return entry.href || `./experience.html#${slug}`;
    return '#';
  }

  function clearCmsThemeInlineVars() {
    [
      '--accent',
      '--accent-2',
      '--bg',
      '--surface',
      '--surface-2',
      '--text',
      '--muted',
      '--border',
      '--timeline-role',
      '--timeline-project',
      '--timeline-event',
      '--timeline-line',
      '--chip',
    ].forEach((v) => document.documentElement.style.removeProperty(v));
  }

  function applyTheme(theme) {
    try {
      const mode = localStorage.getItem('mam_a11y_color');
      if (mode && mode !== 'default') return;
    } catch {
      /* ignore */
    }
    if (!theme || typeof theme !== 'object') return;
    const root = document.documentElement;
    const map = [
      ['accent', '--accent'],
      ['accent2', '--accent-2'],
      ['bg', '--bg'],
      ['surface', '--surface'],
      ['surface2', '--surface-2'],
      ['text', '--text'],
      ['muted', '--muted'],
      ['border', '--border'],
      ['timelineRole', '--timeline-role'],
      ['timelineProject', '--timeline-project'],
      ['timelineEvent', '--timeline-event'],
      ['timelineLine', '--timeline-line'],
      ['chip', '--chip'],
    ];
    map.forEach(([key, cssVar]) => {
      if (theme[key]) root.style.setProperty(cssVar, theme[key]);
    });
  }

  function buildProjectCard(p) {
    const slug = escapeAttr((p.slug || '').replace(/^#/, ''));
    const title = escapeHtml(p.title || 'Untitled');
    const meta = p.meta ? `<p class="meta">${escapeHtml(p.meta)}</p>` : '';
    const dateLine = p.dateLine ? `<p class="date">${escapeHtml(p.dateLine)}</p>` : '';
    const purpose = p.summaryHtml
      ? `<div class="cms-project-summary">${p.summaryHtml}</div>`
      : '';
    const detail = p.detailHtml ? `<details><summary>Expand details</summary>${p.detailHtml}</details>` : '';
    const chipsArr = Array.isArray(p.chips) ? p.chips : [];
    const cat = (p.category || 'software').toLowerCase();
    const chips = chipsArr
      .map((t) => {
        const label = escapeHtml(t);
        const hw =
          cat === 'hardware' || cat === 'hybrid' || /\bhardware\b/i.test(String(t))
            ? ' class="chip-hardware"'
            : '';
        return `<span${hw}>${label}</span>`;
      })
      .join('');
    return `<article id="${slug}" class="card" data-project-category="${escapeAttr(cat)}"><h3>${title}</h3>${meta}${dateLine}${purpose}${detail}<div class="chips">${chips}</div></article>`;
  }

  function buildEventCard(e) {
    const slug = escapeAttr((e.slug || '').replace(/^#/, ''));
    const title = escapeHtml(e.title || 'Untitled');
    const meta = e.meta ? `<p class="meta">${escapeHtml(e.meta)}</p>` : '';
    const dateLine = e.dateLine ? `<p class="date">${escapeHtml(e.dateLine)}</p>` : '';
    const body = e.summaryHtml ? `<div class="cms-event-body">${e.summaryHtml}</div>` : '';
    const detail = e.detailHtml ? `<details><summary>Expand details</summary>${e.detailHtml}</details>` : '';
    const chipsArr = Array.isArray(e.chips) ? e.chips : [];
    const chips = chipsArr.map((t) => `<span>${escapeHtml(t)}</span>`).join('');
    return `<article id="${slug}" class="card"><h3>${title}</h3>${meta}${dateLine}${body}${detail}<div class="chips">${chips}</div></article>`;
  }

  function buildExperienceArticle(ex) {
    const slug = escapeAttr((ex.slug || '').replace(/^#/, ''));
    const title = escapeHtml(ex.title || '');
    const meta = ex.meta ? `<p class="meta">${escapeHtml(ex.meta)}</p>` : '';
    const dateLine = ex.dateLine ? `<p class="date">${escapeHtml(ex.dateLine)}</p>` : '';
    const bullets = (Array.isArray(ex.bullets) ? ex.bullets : [])
      .map((b) => `<li>${escapeHtml(b)}</li>`)
      .join('');
    const ul = bullets ? `<ul>${bullets}</ul>` : '';
    const chips = (Array.isArray(ex.chips) ? ex.chips : [])
      .map((c) => `<span>${escapeHtml(c)}</span>`)
      .join('');
    const chipsHtml = chips ? `<div class="chips">${chips}</div>` : '';
    return `<article id="${slug}" class="card"><h3>${title}</h3>${meta}${dateLine}${ul}${chipsHtml}</article>`;
  }

  function mergeTimelineRows(data, settings) {
    const hideProjects = !!(settings && settings.timelineHideProjects);
    const rows = [];

    (data.projects || []).forEach((p) => {
      if (hideProjects) return;
      if (p.timelineEnabled === false) return;
      const ms = parseSortMs(p.timelineSortMs);
      if (!ms) return;
      rows.push({
        kind: 'project',
        timelineSortMs: ms,
        timelineDateLabel: p.timelineDateLabel || p.dateLine || '',
        title: p.title || '',
        summary: stripHtml(p.summaryHtml) || stripHtml(p.detailHtml) || '',
        href: timelineHref(p, 'project'),
      });
    });

    (data.events || []).forEach((ev) => {
      if (ev.timelineEnabled === false) return;
      const ms = parseSortMs(ev.timelineSortMs);
      if (!ms) return;
      rows.push({
        kind: 'event',
        timelineSortMs: ms,
        timelineDateLabel: ev.timelineDateLabel || ev.dateLine || '',
        title: ev.title || '',
        summary: stripHtml(ev.summaryHtml) || stripHtml(ev.detailHtml) || '',
        href: timelineHref(ev, 'event'),
      });
    });

    (data.roles || []).forEach((r) => {
      if (r.timelineEnabled === false) return;
      const ms = parseSortMs(r.timelineSortMs);
      if (!ms) return;
      rows.push({
        kind: 'role',
        timelineSortMs: ms,
        timelineDateLabel: r.timelineDateLabel || r.dateLabel || '',
        title: r.title || '',
        summary: stripHtml(r.summaryHtml) || '',
        href: timelineHref(r, 'role'),
      });
    });

    rows.sort((a, b) => b.timelineSortMs - a.timelineSortMs);
    return rows;
  }

  function buildTimelineArticle(row) {
    const cls =
      row.kind === 'role'
        ? 'timeline-item role-item job-item'
        : row.kind === 'event'
          ? 'timeline-item event-item'
          : 'timeline-item project-item';
    const dateStr = escapeHtml(row.timelineDateLabel || '');
    const title = escapeHtml(row.title || '');
    const sum = escapeHtml(row.summary || '');
    const href = escapeAttr(row.href || '#');
    return `<article class="${cls}"><p class="timeline-date">${dateStr}</p><h3><a class="timeline-title-link" href="${href}">${title}</a></h3><p>${sum}</p></article>`;
  }

  function applyResumeLinks(url) {
    if (!url) return;
    document.querySelectorAll('a[data-resume-link], a.resume-dynamic').forEach((a) => {
      a.href = url;
    });
  }

  function applyHomeSummary(html) {
    const el = document.getElementById('home-summary');
    if (!el || !html || !html.trim()) return;
    const h2 = el.querySelector('h2.page-title');
    const titleHtml = h2 ? h2.outerHTML : '';
    el.innerHTML = `${titleHtml}<div class="cms-home-summary">${html}</div>`;
  }

  function applyHomeHero(cfg) {
    const mount = document.getElementById('home-hero-dynamic');
    const fb = document.getElementById('home-hero-static');
    if (!mount || !fb || !cfg) return;
    const eyebrow = cfg.eyebrow ? `<p class="eyebrow">${escapeHtml(cfg.eyebrow)}</p>` : '';
    const titleHtml = cfg.titleHtml || `<h1>${escapeHtml(cfg.title || '')}</h1>`;
    const lead = cfg.lead ? `<p class="lead">${escapeHtml(cfg.lead)}</p>` : '';
    const actions =
      cfg.actionsHtml ||
      `<div class="actions">
        <a class="btn primary" href="./experience.html">View Experience & Projects</a>
        <a class="btn ghost resume-dynamic" data-resume-link href="./resume.pdf">Download Resume</a>
      </div>`;
    mount.innerHTML = `<div class="cms-home-hero-inner">${eyebrow}${titleHtml}${lead}${actions}</div>`;
    mount.hidden = false;
    fb.hidden = true;
  }

  function applyCompetencies(items) {
    const mount = document.getElementById('competencies-dynamic');
    const fb = document.getElementById('competencies-static');
    if (!mount || !fb || !Array.isArray(items) || !items.length) return;
    mount.innerHTML = items
      .map(
        (row) =>
          `<div><p class="kicker">${escapeHtml(row.kicker || '')}</p><p class="subtle">${escapeHtml(row.subtle || row.body || '')}</p></div>`
      )
      .join('');
    mount.className = 'stack cms-competencies-stack';
    mount.hidden = false;
    fb.hidden = true;
  }

  function buildCertChip(raw, isCompleted) {
    if (typeof raw === 'string') {
      const t = raw.trim();
      return t ? `<span>${escapeHtml(t)}</span>` : '';
    }
    if (!raw || typeof raw !== 'object') return '';
    const title = (raw.text || raw.title || raw.name || '').trim();
    if (!title) return '';
    const issued = raw.date || raw.issued || raw.earned;
    const expires = raw.expires || raw.expiry;
    const expected = raw.expected || raw.expectedBy;
    const note = (raw.note || '').trim();
    const parts = [];
    if (issued) parts.push(`${isCompleted ? 'Issued' : 'Started'} ${escapeHtml(String(issued))}`);
    if (!isCompleted && expected) parts.push(`Expected ${escapeHtml(String(expected))}`);
    if (expires) parts.push(`Expires ${escapeHtml(String(expires))}`);
    if (note) parts.push(escapeHtml(note));
    const meta = parts.length
      ? `<span class="cert-chip-meta">${parts.join(' · ')}</span>`
      : '';
    const titleEsc = escapeHtml(title);
    if (!meta) return `<span>${titleEsc}</span>`;
    return `<span class="cert-chip"><span class="cert-chip-title">${titleEsc}</span>${meta}</span>`;
  }

  function applyCertifications(cert) {
    const mount = document.getElementById('certifications-dynamic');
    const fb = document.getElementById('certifications-static');
    if (!mount || !fb || !cert || typeof cert !== 'object') return;
    const done = (cert.completed || [])
      .map((x) => buildCertChip(x, true))
      .filter(Boolean)
      .join('');
    const prog = (cert.inProgress || [])
      .map((x) => buildCertChip(x, false))
      .filter(Boolean)
      .join('');
    mount.innerHTML = `<div class="grid-2 cert-grid">
      <article class="card"><h3>Completed</h3><div class="inline-list">${done}</div></article>
      <article class="card"><h3>In Progress</h3><div class="inline-list">${prog}</div></article>
    </div>`;
    mount.hidden = false;
    fb.hidden = true;
  }

  function applyQuickHighlights(items) {
    const mount = document.getElementById('highlights-dynamic');
    const fb = document.getElementById('highlights-static');
    if (!mount || !fb || !Array.isArray(items) || !items.length) return;
    mount.innerHTML = `<div class="grid-3">${items
      .map((h) => {
        const body =
          h.bodyHtml ||
          `<p class="subtle">${escapeHtml(h.body || h.description || '')}</p>`;
        return `<div class="card"><h3>${escapeHtml(h.title || '')}</h3>${body}</div>`;
      })
      .join('')}</div>`;
    mount.hidden = false;
    fb.hidden = true;
  }

  function applyExperienceMount(list) {
    const mount = document.getElementById('experience-dynamic-mount');
    const fb = document.getElementById('experience-static-fallback');
    if (!mount || !fb || !Array.isArray(list) || !list.length) return;
    const sorted = [...list].sort((a, b) => Number(b.orderIndex || 0) - Number(a.orderIndex || 0));
    const prof = sorted.filter((e) => (e.section || 'professional') !== 'campus');
    const campus = sorted.filter((e) => (e.section || '') === 'campus');
    let html = '';
    if (prof.length) {
      html += `<section class="section reveal"><h2 class="page-title">Professional Experience</h2><div class="stack">${prof.map(buildExperienceArticle).join('')}</div></section>`;
    }
    if (campus.length) {
      html += `<section class="section reveal"><h2 class="page-title">Additional Campus Roles</h2><div class="stack">${campus.map(buildExperienceArticle).join('')}</div></section>`;
    }
    if (!html) return;
    mount.innerHTML = html;
    mount.hidden = false;
    fb.hidden = true;
  }

  function formatCourseLine(line) {
    if (typeof line === 'string') return escapeHtml(line.trim());
    if (!line || typeof line !== 'object') return '';
    const code = (line.code || line.number || '').trim();
    const name = (line.name || line.title || line.course || '').trim();
    const combined = [code, name].filter(Boolean).join(' — ');
    if (combined) return escapeHtml(combined);
    const single = (line.text || '').trim();
    return single ? escapeHtml(single) : '';
  }

  function renderCourseCategoryCards(categories) {
    if (!Array.isArray(categories)) return '';
    return categories
      .map((cat) => {
        const items = (cat.items || [])
          .map(formatCourseLine)
          .filter(Boolean)
          .map((html) => `<li>${html}</li>`)
          .join('');
        const titleCat = escapeHtml(cat.title || '');
        return `<article class="card"><h3>${titleCat}</h3><ul>${items}</ul></article>`;
      })
      .join('');
  }

  function applyCourseworkPage(cp) {
    const mount = document.getElementById('coursework-dynamic-mount');
    const fb = document.getElementById('coursework-static-fallback');
    if (!mount || !fb || !cp || typeof cp !== 'object') return;

    const institutions = Array.isArray(cp.institutions) ? cp.institutions : [];
    const categories = Array.isArray(cp.categories) ? cp.categories : [];
    const hasGlobalNote = typeof cp.noteHtml === 'string' && cp.noteHtml.trim() !== '';
    const useInstitutions = institutions.length > 0;
    const hasLegacyGrid = categories.length > 0;

    if (!useInstitutions && !hasLegacyGrid && !hasGlobalNote) return;

    const title = escapeHtml(cp.panelTitle || 'Academic Coursework');
    const sub = cp.panelSubtitle ? `<p class="subtle">${escapeHtml(cp.panelSubtitle)}</p>` : '';
    const header = `<section class="section panel reveal"><h1 class="page-title">${title}</h1>${sub}</section>`;

    let body = '';
    if (useInstitutions) {
      body = institutions
        .map((inst) => {
          const h = escapeHtml((inst.name || inst.school || 'Education').trim() || 'Education');
          const subLine = inst.subtitle || inst.panelSubtitle;
          const instSub = subLine ? `<p class="subtle">${escapeHtml(String(subLine))}</p>` : '';
          const grid = renderCourseCategoryCards(inst.categories);
          const note =
            typeof inst.noteHtml === 'string' && inst.noteHtml.trim()
              ? `<section class="section panel reveal">${inst.noteHtml}</section>`
              : '';
          return `<section class="section panel reveal coursework-school"><h2 class="page-title">${h}</h2>${instSub}</section><section class="section grid-2 reveal">${grid}</section>${note}`;
        })
        .join('');
    } else if (hasLegacyGrid) {
      body = `<section class="section grid-2 reveal">${renderCourseCategoryCards(categories)}</section>`;
    }

    const globalNote = hasGlobalNote ? `<section class="section panel reveal">${cp.noteHtml}</section>` : '';

    mount.innerHTML = `${header}${body}${globalNote}`;
    mount.hidden = false;
    fb.hidden = true;
  }

  function applyContactPage(cp) {
    const mount = document.getElementById('contact-dynamic-mount');
    const fb = document.getElementById('contact-static-fallback');
    if (!mount || !fb || !cp || typeof cp !== 'object') return;
    const heading = escapeHtml(cp.heading || 'Interested in collaborating?');
    const intro = cp.introHtml ? `<div class="cms-contact-intro">${cp.introHtml}</div>` : `<p>${escapeHtml(cp.intro || '')}</p>`;
    const actions = (Array.isArray(cp.actions) ? cp.actions : [])
      .map((a) => {
        const cls = a.variant === 'primary' ? 'btn primary' : 'btn ghost';
        const ext = a.external ? ' target="_blank" rel="noopener"' : '';
        return `<a class="${cls}" href="${escapeAttr(a.href || '#')}"${ext}>${escapeHtml(a.label || '')}</a>`;
      })
      .join('');
    const cards = (Array.isArray(cp.cards) ? cp.cards : [])
      .map(
        (c) =>
          `<article class="card"><h3>${escapeHtml(c.title || '')}</h3><div class="cms-card-body">${c.bodyHtml || `<p>${escapeHtml(c.body || '')}</p>`}</div></article>`
      )
      .join('');
    mount.innerHTML = `<section class="section panel reveal"><h1 class="page-title">${heading}</h1>${intro}<div class="actions">${actions}</div></section><section class="section grid-2 reveal">${cards}</section>`;
    mount.hidden = false;
    fb.hidden = true;
  }

  function applyAchievementGrid(cards) {
    const mount = document.getElementById('achievements-static-grid');
    if (!mount || !Array.isArray(cards) || !cards.length) return;
    mount.innerHTML = cards
      .map((c) => {
        const body = c.bodyHtml || `<p>${escapeHtml(c.body || c.description || '')}</p>`;
        return `<article class="card"><h3>${escapeHtml(c.title || '')}</h3>${c.meta ? `<p class="meta">${escapeHtml(c.meta)}</p>` : ''}${body}</article>`;
      })
      .join('');
  }

  async function run() {
    if (!window.CmsApi || !window.CmsApi.firebaseConfigured()) return;
    window.CmsApi.initFirebase();
    let data;
    try {
      data = await window.CmsApi.loadAllCmsData();
    } catch (err) {
      console.warn('[CMS] load failed', err);
      return;
    }
    if (!data) return;

    window.__cmsData = data;
    const cfg = data.config || {};

    if (cfg.theme && typeof cfg.theme === 'object') applyTheme(cfg.theme);

    const payload = window.CmsApi.buildPortalPayload(cfg);
    if (payload && Object.keys(cfg).length) {
      window.__portalData = {
        ...(window.__portalData || {}),
        ...payload,
      };
    }

    const settings = {
      redPages: [],
      timelineHideProjects: false,
      iconStylePages: {},
      ...(typeof cfg.settings === 'object' && cfg.settings ? cfg.settings : {}),
    };

    const path = window.location.pathname.split('/').pop() || 'index.html';

    if (path === 'index.html') {
      if (cfg.homeHero && typeof cfg.homeHero === 'object') applyHomeHero(cfg.homeHero);
      if (payload && payload.homeSummaryHtml) applyHomeSummary(payload.homeSummaryHtml);
      if (Array.isArray(cfg.quickHighlights) && cfg.quickHighlights.length) applyQuickHighlights(cfg.quickHighlights);
      if (cfg.certifications && typeof cfg.certifications === 'object') applyCertifications(cfg.certifications);
      if (Array.isArray(cfg.competencies) && cfg.competencies.length) applyCompetencies(cfg.competencies);
    }

    if (path === 'achievements.html' && payload && payload.achievementCards && payload.achievementCards.length) {
      applyAchievementGrid(payload.achievementCards);
    }

    if (path === 'experience.html' && Array.isArray(data.experience) && data.experience.length) {
      applyExperienceMount(data.experience);
    }

    if (path === 'coursework.html' && cfg.courseworkPage && typeof cfg.courseworkPage === 'object') {
      applyCourseworkPage(cfg.courseworkPage);
    }

    if (path === 'contact.html' && cfg.contactPage && typeof cfg.contactPage === 'object') {
      applyContactPage(cfg.contactPage);
    }

    const projects = data.projects || [];
    const mountP = document.getElementById('projects-dynamic-mount');
    const fbP = document.getElementById('projects-static-fallback');
    if (mountP && fbP && projects.length) {
      mountP.innerHTML = projects
        .sort((a, b) => {
          const bo = Number(b.orderIndex);
          const ao = Number(a.orderIndex);
          if (Number.isFinite(bo) && Number.isFinite(ao) && bo !== ao) return bo - ao;
          return parseSortMs(b.timelineSortMs) - parseSortMs(a.timelineSortMs);
        })
        .map(buildProjectCard)
        .join('');
      mountP.hidden = false;
      fbP.hidden = true;
    }

    const events = data.events || [];
    const mountE = document.getElementById('events-dynamic-mount');
    const fbE = document.getElementById('events-static-fallback');
    if (mountE && fbE && events.length) {
      const prof = events.filter((e) => (e.bucket || 'professional') !== 'competitions');
      const comp = events.filter((e) => (e.bucket || '') === 'competitions');
      let html = '';
      if (prof.length) {
        html += `<section class="section stack reveal">${prof.map(buildEventCard).join('')}</section>`;
      }
      if (comp.length) {
        html += `<section class="section panel reveal"><h2 class="page-title">Capture The Flags & Hackathons Attended</h2><p class="subtle">Competition and challenge events focused on practical cybersecurity and collaborative problem solving.</p></section><section class="section stack reveal">${comp.map(buildEventCard).join('')}</section>`;
      }
      mountE.innerHTML = html || `<section class="section stack reveal">${events.map(buildEventCard).join('')}</section>`;
      mountE.hidden = false;
      fbE.hidden = true;
    }

    const timelineRows = mergeTimelineRows(data, settings);
    const mountT = document.getElementById('timeline-dynamic-mount');
    const fbT = document.getElementById('timeline-static-fallback');
    if (mountT && fbT && timelineRows.length) {
      mountT.innerHTML = timelineRows.map(buildTimelineArticle).join('');
      mountT.hidden = false;
      fbT.hidden = true;
    }

    if (payload && payload.resumeUrl) applyResumeLinks(payload.resumeUrl);

    window.dispatchEvent(new CustomEvent('mam-cms-ready', { detail: data }));

    if (typeof window.mamReinitAfterCms === 'function') {
      window.mamReinitAfterCms();
    }
  }

  window.MamCms = window.MamCms || {};
  window.MamCms.clearCmsThemeInlineVars = clearCmsThemeInlineVars;
  window.MamCms.reapplyFirestoreTheme = function reapplyFirestoreTheme() {
    try {
      const mode = localStorage.getItem('mam_a11y_color');
      if (mode && mode !== 'default') return;
    } catch {
      /* ignore */
    }
    clearCmsThemeInlineVars();
    const cfg = window.__cmsData?.config;
    if (cfg?.theme && typeof cfg.theme === 'object') applyTheme(cfg.theme);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
