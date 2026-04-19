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

  /**
   * Only swap a dynamic CMS mount over a static fallback when the new content
   * is at least as rich (article count + visible text length) as the static
   * version. Prevents the "loads correctly then breaks" regression where a
   * sparse CMS payload visibly downgrades the page after Firebase data lands.
   */
  function safeSwap(staticEl, dynamicEl, html, opts) {
    if (!staticEl || !dynamicEl) return false;
    const o = opts || {};
    const tmp = document.createElement('div');
    tmp.innerHTML = html || '';
    const dynArticles = tmp.querySelectorAll('article').length;
    const dynText = (tmp.textContent || '').replace(/\s+/g, ' ').trim().length;
    const stArticles = staticEl.querySelectorAll('article').length;
    const stText = (staticEl.textContent || '').replace(/\s+/g, ' ').trim().length;
    // If the static fallback has articles, require the dynamic to have at least as many.
    if (stArticles > 0 && dynArticles < stArticles) {
      console.info('[CMS] Skipped CMS swap (static richer):', staticEl.id || staticEl.className, '— static articles', stArticles, 'dynamic', dynArticles);
      return false;
    }
    // For non-article sections (contact intro etc.), require dynamic text to be at least 50% of static.
    if (stArticles === 0 && stText > 0 && dynText < stText * 0.5) {
      console.info('[CMS] Skipped CMS swap (static text richer):', staticEl.id || staticEl.className, '— static len', stText, 'dynamic len', dynText);
      return false;
    }
    dynamicEl.innerHTML = html;
    dynamicEl.hidden = false;
    staticEl.hidden = true;
    return true;
  }

  function stripHtml(html) {
    if (!html) return '';
    const d = document.createElement('div');
    d.innerHTML = String(html);
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Lightweight HTML sanitizer used for any CMS-supplied HTML field that gets
   * interpolated into innerHTML (project/event summaries, contact intro, notes,
   * featured-article bodies, etc.). It removes <script>/<style>/<iframe> nodes,
   * inline event handlers (onclick=...), and javascript:/data: URLs. Not a
   * full sanitizer — admin write rules are the primary defense — but blocks
   * the obvious stored-XSS shapes.
   */
  function sanitizeHtml(html) {
    if (html == null) return '';
    const str = String(html);
    if (!str.trim()) return '';
    const tmpl = document.createElement('template');
    tmpl.innerHTML = str;
    const walker = document.createTreeWalker(tmpl.content, NodeFilter.SHOW_ELEMENT, null);
    const drop = [];
    let node = walker.nextNode();
    while (node) {
      const tag = node.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'iframe' || tag === 'object' || tag === 'embed') {
        drop.push(node);
      } else {
        for (const attr of Array.from(node.attributes)) {
          const name = attr.name.toLowerCase();
          const value = String(attr.value || '').trim();
          if (name.startsWith('on')) {
            node.removeAttribute(attr.name);
            continue;
          }
          if ((name === 'href' || name === 'src' || name === 'xlink:href') && /^\s*(javascript|data|vbscript):/i.test(value)) {
            node.removeAttribute(attr.name);
          }
        }
      }
      node = walker.nextNode();
    }
    drop.forEach((n) => n.parentNode && n.parentNode.removeChild(n));
    return tmpl.innerHTML;
  }

  function parseSortMs(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function inferTimelineSortMs(entry) {
    const explicit = parseSortMs(entry?.timelineSortMs);
    if (explicit) return explicit;
    const raw = String(entry?.timelineDateLabel || entry?.dateLine || entry?.dateLabel || '').trim();
    if (!raw) return 0;
    const cleaned = raw.split(' - ')[0].replace(/\bPresent\b/gi, '').trim();
    const attempts = [cleaned, `${cleaned} 1`, `1 ${cleaned}`].filter(Boolean);
    for (const attempt of attempts) {
      const ms = Date.parse(attempt);
      if (Number.isFinite(ms)) return ms;
    }
    const yearMatch = cleaned.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      const ms = Date.parse(`January 1, ${yearMatch[0]}`);
      if (Number.isFinite(ms)) return ms;
    }
    return 0;
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

  function renderActions(actions, fallbackLabel) {
    const list = Array.isArray(actions) ? actions : [];
    if (!list.length) return '';
    const html = list
      .map((action) => {
        if (!action || typeof action !== 'object' || !action.href) return '';
        const cls = action.variant === 'primary' ? 'btn primary' : 'btn ghost';
        const ext = action.external ? ' target="_blank" rel="noopener"' : '';
        const label = escapeHtml(action.label || fallbackLabel || 'Open');
        return `<a class="${cls}" href="${escapeAttr(action.href)}"${ext}>${label}</a>`;
      })
      .filter(Boolean)
      .join('');
    return html ? `<div class="actions cms-actions">${html}</div>` : '';
  }

  function toYoutubeEmbed(url) {
    const u = String(url || '').trim();
    if (!u) return '';
    const short = u.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
    if (short) return `https://www.youtube.com/embed/${short[1]}`;
    const long = u.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
    if (long) return `https://www.youtube.com/embed/${long[1]}`;
    const embed = u.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/);
    if (embed) return u;
    return '';
  }

  function renderMediaGallery(items) {
    const media = Array.isArray(items) ? items : [];
    if (!media.length) return '';
    const tiles = media
      .map((m) => {
        if (!m || typeof m !== 'object' || !m.src) return '';
        const type = String(m.type || 'image').trim().toLowerCase();
        const caption = m.caption ? `<figcaption>${escapeHtml(m.caption)}</figcaption>` : '';
        const alt = escapeAttr(m.alt || m.caption || 'media');
        if (type === 'youtube') {
          const embed = toYoutubeEmbed(m.src);
          if (!embed) return '';
          return `<div class="video-embed media-item"><iframe src="${escapeAttr(embed)}" title="${alt}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`;
        }
        if (type === 'video') {
          return `<figure class="media-item"><video controls preload="metadata" src="${escapeAttr(m.src)}"></video>${caption}</figure>`;
        }
        if (type === 'link') {
          const label = escapeHtml(m.caption || m.label || 'Open link');
          return `<div class="media-item media-link"><a class="btn ghost" href="${escapeAttr(m.src)}" target="_blank" rel="noopener">${label}</a></div>`;
        }
        return `<figure class="media-item"><img loading="lazy" decoding="async" src="${escapeAttr(m.src)}" alt="${alt}" />${caption}</figure>`;
      })
      .filter(Boolean)
      .join('');
    return tiles ? `<div class="media-gallery cms-media-gallery"><div class="media-grid">${tiles}</div></div>` : '';
  }

  function buildLearnMoreAction(entry, kind) {
    const href = timelineHref(entry, kind);
    if (!href || href === '#') return '';
    return `<div class="actions cms-actions"><a class="btn ghost" href="${escapeAttr(href)}">Learn more</a></div>`;
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
    const cat = (p.category || 'software').toLowerCase();
    const rawTitleIn = String(p.title || '').trim() || 'Untitled';
    const titleHasGearChar = /⚙/.test(rawTitleIn);
    let titlePlain = rawTitleIn.replace(/^\s*⚙\s*/, '').trim() || 'Untitled';
    const showGear =
      cat === 'hardware' ||
      cat === 'hybrid' ||
      p.showHardwareGear === true ||
      titleHasGearChar;
    const gearHtml = showGear ? '<span class="hw-symbol" aria-label="hardware">⚙</span> ' : '';
    const title = `${gearHtml}${escapeHtml(titlePlain)}`;
    const meta = p.meta ? `<p class="meta">${escapeHtml(p.meta)}</p>` : '';
    const dateLine = p.dateLine ? `<p class="date">${escapeHtml(p.dateLine)}</p>` : '';
    const purpose = p.summaryHtml
      ? `<div class="cms-project-summary">${sanitizeHtml(p.summaryHtml)}</div>`
      : '';
    const detail = p.detailHtml ? `<details><summary>Expand details</summary>${sanitizeHtml(p.detailHtml)}</details>` : '';
    const chipsArr = Array.isArray(p.chips) ? p.chips : [];
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
    const media = renderMediaGallery(p.media);
    const actions = renderActions(p.actions, 'Open') || buildLearnMoreAction(p, 'project');
    return `<article id="${slug}" class="card" data-project-category="${escapeAttr(cat)}"><h3>${title}</h3>${meta}${dateLine}${purpose}${detail}${media}${actions}<div class="chips">${chips}</div></article>`;
  }

  function buildEventCard(e) {
    const slug = escapeAttr((e.slug || '').replace(/^#/, ''));
    const title = escapeHtml(e.title || 'Untitled');
    const meta = e.meta ? `<p class="meta">${escapeHtml(e.meta)}</p>` : '';
    const dateLine = e.dateLine ? `<p class="date">${escapeHtml(e.dateLine)}</p>` : '';
    const body = e.summaryHtml ? `<div class="cms-event-body">${sanitizeHtml(e.summaryHtml)}</div>` : '';
    const detail = e.detailHtml ? `<details><summary>Expand details</summary>${sanitizeHtml(e.detailHtml)}</details>` : '';
    const chipsArr = Array.isArray(e.chips) ? e.chips : [];
    const chips = chipsArr.map((t) => `<span>${escapeHtml(t)}</span>`).join('');
    const media = renderMediaGallery(e.media);
    const actions = renderActions(e.actions, 'Open') || buildLearnMoreAction(e, 'event');
    return `<article id="${slug}" class="card"><h3>${title}</h3>${meta}${dateLine}${body}${detail}${media}${actions}<div class="chips">${chips}</div></article>`;
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
    const summary = ex.summaryHtml ? `<div class="cms-experience-summary">${sanitizeHtml(ex.summaryHtml)}</div>` : '';
    const detail = ex.detailHtml ? `<details><summary>Expand details</summary>${sanitizeHtml(ex.detailHtml)}</details>` : '';
    const media = renderMediaGallery(ex.media);
    const actions = renderActions(ex.actions, 'Open');
    return `<article id="${slug}" class="card"><h3>${title}</h3>${meta}${dateLine}${summary}${ul}${detail}${media}${actions}${chipsHtml}</article>`;
  }

  function mergeTimelineRows(data, settings) {
    const hideProjects = !!(settings && settings.timelineHideProjects);
    const rowsByKey = new Map();

    function upsertRow(key, row) {
      const existing = rowsByKey.get(key);
      if (!existing || (Number(row.timelineSortMs) || 0) >= (Number(existing.timelineSortMs) || 0)) {
        rowsByKey.set(key, row);
      }
    }

    (data.projects || []).forEach((p) => {
      if (hideProjects) return;
      if (p.timelineEnabled === false) return;
      const ms = inferTimelineSortMs(p);
      if (!ms) return;
      upsertRow(`project:${p.slug || p.id || p.title || ms}`, {
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
      const ms = inferTimelineSortMs(ev);
      if (!ms) return;
      upsertRow(`event:${ev.slug || ev.id || ev.title || ms}`, {
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
      const ms = inferTimelineSortMs(r);
      if (!ms) return;
      upsertRow(`role:${r.slug || r.id || r.title || ms}`, {
        kind: 'role',
        timelineSortMs: ms,
        timelineDateLabel: r.timelineDateLabel || r.dateLabel || '',
        title: r.title || '',
        summary: stripHtml(r.summaryHtml) || '',
        href: timelineHref(r, 'role'),
      });
    });

    (data.experience || []).forEach((ex) => {
      if (ex.timelineEnabled === false) return;
      const ms = inferTimelineSortMs(ex);
      if (!ms) return;
      upsertRow(`role:${ex.slug || ex.id || ex.title || ms}`, {
        kind: 'role',
        timelineSortMs: ms,
        timelineDateLabel: ex.timelineDateLabel || ex.dateLine || '',
        title: ex.title || '',
        summary: stripHtml(ex.summaryHtml) || (Array.isArray(ex.bullets) ? ex.bullets[0] || '' : ''),
        href: timelineHref({ ...ex, timelineLinkKind: ex.timelineLinkKind || 'experience' }, 'role'),
      });
    });

    const rows = [...rowsByKey.values()];
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
    let titleHtml = '';
    if (h2) {
      const clone = h2.cloneNode(true);
      clone.classList.remove('expand-title-row');
      clone.querySelectorAll('.expand-arrow-btn').forEach((btn) => btn.remove());
      titleHtml = clone.outerHTML;
    }
    el.innerHTML = `${titleHtml}<div class="cms-home-summary">${html}</div>`;
    el.dataset.expandReady = '0';
    el.classList.remove('section-expandable', 'card-expandable', 'is-open');
  }

  /** Wrap the last 2 words of a plain name in an accent span (matches the original "Mohammad **Agha Mohammadi**" highlight). */
  function highlightNameLastWords(plain) {
    const words = String(plain || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '';
    if (words.length === 1) return `<span class="accent-block">${escapeHtml(words[0])}</span>`;
    if (words.length === 2) return `<span class="accent-block">${escapeHtml(words[0])} ${escapeHtml(words[1])}</span>`;
    const head = words.slice(0, words.length - 2).map(escapeHtml).join(' ');
    const tail = words.slice(-2).map(escapeHtml).join(' ');
    return `${head} <span class="accent-block">${tail}</span>`;
  }

  function applyHomeHero(cfg) {
    const mount = document.getElementById('home-hero-dynamic');
    const fb = document.getElementById('home-hero-static');
    if (!mount || !fb || !cfg) return;
    // If the CMS has nothing meaningful, leave the static hero alone.
    const hasAnything = !!(cfg.eyebrow || cfg.title || (cfg.titleHtml && stripHtml(cfg.titleHtml).trim()) || cfg.lead || cfg.actionsHtml);
    if (!hasAnything) return;
    const eyebrow = cfg.eyebrow ? `<p class="eyebrow">${escapeHtml(cfg.eyebrow)}</p>` : '';
    const rawTitleHtml = typeof cfg.titleHtml === 'string' ? cfg.titleHtml.trim() : '';
    // Use plain text from titleHtml/title, then auto-highlight last words so the static "accent-block" effect survives a CMS save.
    const plainTitle = stripHtml(rawTitleHtml).trim() || String(cfg.title || '').trim();
    // If the CMS string already contains an accent span, trust it; otherwise rebuild the highlight.
    const containsAccent = /class\s*=\s*["'][^"']*accent-block/i.test(rawTitleHtml);
    const innerTitle = containsAccent ? rawTitleHtml.replace(/^\s*<h1[^>]*>|<\/h1>\s*$/gi, '') : highlightNameLastWords(plainTitle);
    const titleHtml = `<h1>${innerTitle}</h1>`;
    const lead = cfg.lead ? `<p class="lead">${escapeHtml(cfg.lead)}</p>` : '';
    const actions =
      cfg.actionsHtml ||
      `<div class="actions">
        <a class="btn primary" href="./experience.html">View Experience & Projects</a>
        <a class="btn ghost resume-dynamic" data-resume-link href="./resume.pdf" download>Download Resume</a>
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
    safeSwap(fb, mount, html);
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

    if (!useInstitutions && !hasLegacyGrid) return;

    const title = escapeHtml(cp.panelTitle || 'Academic Coursework');
    const sub = cp.panelSubtitle ? `<p class="subtle">${escapeHtml(cp.panelSubtitle)}</p>` : '';
    const header = `<section class="section panel reveal"><h1 class="page-title">${title}</h1>${sub}</section>`;

    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const panelSubNorm = norm(cp.panelSubtitle);
    const panelTitleNorm = norm(cp.panelTitle);

    let body = '';
    if (useInstitutions) {
      const single = institutions.length === 1;
      body = institutions
        .map((inst) => {
          const rawName = (inst.name || inst.school || 'Education').trim() || 'Education';
          const subLine = inst.subtitle || inst.panelSubtitle || '';
          const grid = renderCourseCategoryCards(inst.categories);
          const noteHtmlRaw = typeof inst.noteHtml === 'string' ? inst.noteHtml.trim() : '';
          // Hide the institution name when there's only one school AND its name duplicates the panel title
          // (or is the generic placeholder "Education"). With multiple schools we always show the name.
          const hideName = single && (norm(rawName) === panelTitleNorm || norm(rawName) === 'education');
          // Hide the institution subtitle when it duplicates the panel-level subtitle.
          const hideSub = !!subLine && norm(subLine) === panelSubNorm;
          const headerHtml = hideName && hideSub
            ? ''
            : `<section class="section panel reveal coursework-school">${hideName ? '' : `<h2 class="page-title">${escapeHtml(rawName)}</h2>`}${hideSub || !subLine ? '' : `<p class="subtle">${escapeHtml(String(subLine))}</p>`}</section>`;
          // Hide institution note if it duplicates the panel-level note.
          const hideNote = noteHtmlRaw && hasGlobalNote && norm(stripHtml(noteHtmlRaw)) === norm(stripHtml(cp.noteHtml));
          const noteSection = noteHtmlRaw && !hideNote
            ? `<section class="section panel reveal">${sanitizeHtml(noteHtmlRaw)}</section>`
            : '';
          return `${headerHtml}<section class="section grid-2 reveal">${grid}</section>${noteSection}`;
        })
        .join('');
    } else if (hasLegacyGrid) {
      body = `<section class="section grid-2 reveal">${renderCourseCategoryCards(categories)}</section>`;
    }

    const globalNote = hasGlobalNote ? `<section class="section panel reveal">${sanitizeHtml(cp.noteHtml)}</section>` : '';

    safeSwap(fb, mount, `${header}${body}${globalNote}`);
  }

  /**
   * Update every mailto: link site-wide AND any visible plain-text email so the
   * admin's "Contact Email" field is the single source of truth across the site.
   */
  function applyContactEmail(email) {
    const clean = String(email || '').trim();
    if (!clean) return;
    document.querySelectorAll('a[href^="mailto:"]').forEach((a) => {
      const old = a.getAttribute('href') || '';
      const tail = old.includes('?') ? old.slice(old.indexOf('?')) : '';
      a.setAttribute('href', `mailto:${clean}${tail}`);
      const txt = (a.textContent || '').trim();
      if (/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(txt)) {
        a.textContent = clean;
      }
    });
    document.querySelectorAll('[data-cms-email]').forEach((el) => {
      el.textContent = clean;
    });
  }

  /** Featured Articles (news/press) — rendered on achievements.html. */
  function applyFeaturedArticles(items) {
    const mount = document.getElementById('featured-articles-dynamic');
    const fb = document.getElementById('featured-articles-static');
    if (!mount || !fb || !Array.isArray(items) || !items.length) return;
    // Honor the same swap-safety rule used elsewhere
    if (items.length < (fb.querySelectorAll('article').length || 0)) return;
    const html = items
      .map((a) => {
        const title = escapeHtml(a.title || a.headline || 'Featured Article');
        const date = a.date ? `<p class="date">${escapeHtml(a.date)}</p>` : '';
        const summary = a.summaryHtml ? sanitizeHtml(a.summaryHtml) : (a.summary ? `<p>${escapeHtml(a.summary)}</p>` : '');
        const url = (a.url || a.href || '').trim();
        const linkLabel = escapeHtml(a.linkLabel || 'Read Full Article');
        const link = url ? `<p><a class="btn ghost" href="${escapeAttr(url)}" target="_blank" rel="noopener">${linkLabel}</a></p>` : '';
        const fallbackUrl = url ? `<p class="subtle">If the button fails, open: <br/>${escapeHtml(url)}</p>` : '';
        const tag = a.chip || a.tag ? `<div class="chips"><span>${escapeHtml(a.chip || a.tag)}</span></div>` : '';
        return `<article class="card">${title ? `<h3>${title}</h3>` : ''}${date}${summary}${link}${fallbackUrl}${tag}</article>`;
      })
      .join('');
    mount.innerHTML = `<section class="section stack reveal">${html}</section>`;
    mount.hidden = false;
    if (fb) fb.hidden = true;
  }

  function applyContactPage(cp) {
    const mount = document.getElementById('contact-dynamic-mount');
    const fb = document.getElementById('contact-static-fallback');
    if (!mount || !fb || !cp || typeof cp !== 'object') return;
    const actionsList = Array.isArray(cp.actions) ? cp.actions : [];
    const cardsList = Array.isArray(cp.cards) ? cp.cards : [];
    const hasIntro = !!((cp.introHtml && cp.introHtml.trim()) || (cp.intro && String(cp.intro).trim()));
    if (!hasIntro && !actionsList.length && !cardsList.length) return;
    const heading = escapeHtml(cp.heading || 'Interested in collaborating?');
    const intro = cp.introHtml ? `<div class="cms-contact-intro">${sanitizeHtml(cp.introHtml)}</div>` : `<p>${escapeHtml(cp.intro || '')}</p>`;
    const actions = actionsList
      .map((a) => {
        const cls = a.variant === 'primary' ? 'btn primary' : 'btn ghost';
        const ext = a.external ? ' target="_blank" rel="noopener"' : '';
        return `<a class="${cls}" href="${escapeAttr(a.href || '#')}"${ext}>${escapeHtml(a.label || '')}</a>`;
      })
      .join('');
    const cards = cardsList
      .map(
        (c) =>
          `<article class="card"><h3>${escapeHtml(c.title || '')}</h3><div class="cms-card-body">${c.bodyHtml ? sanitizeHtml(c.bodyHtml) : `<p>${escapeHtml(c.body || '')}</p>`}</div></article>`
      )
      .join('');
    const actionsHtml = actions ? `<div class="actions">${actions}</div>` : '';
    const cardsHtml = cards ? `<section class="section grid-2 reveal">${cards}</section>` : '';
    safeSwap(fb, mount, `<section class="section panel reveal"><h1 class="page-title">${heading}</h1>${intro}${actionsHtml}</section>${cardsHtml}`);
  }

  function applyAchievementGrid(cards) {
    const mount = document.getElementById('achievements-static-grid');
    if (!mount || !Array.isArray(cards) || !cards.length) return;
    // The achievement grid is its own static fallback — only swap if CMS produces
    // at least as many cards as currently rendered.
    const staticCount = mount.querySelectorAll('article').length;
    if (cards.length < staticCount) return;
    mount.innerHTML = cards
      .map((c) => {
        const body = c.bodyHtml ? sanitizeHtml(c.bodyHtml) : `<p>${escapeHtml(c.body || c.description || '')}</p>`;
        return `<article class="card"><h3>${escapeHtml(c.title || '')}</h3>${c.meta ? `<p class="meta">${escapeHtml(c.meta)}</p>` : ''}${body}</article>`;
      })
      .join('');
  }

  function applyTextConfig(config, selectors) {
    if (!config || typeof config !== 'object') return;
    selectors.forEach(([key, selector, prop]) => {
      const value = config[key];
      if (!value) return;
      const el = document.querySelector(selector);
      if (!el) return;
      if (prop === 'html') el.innerHTML = value;
      else el.textContent = value;
    });
  }

  function applyPanelCopy(panel, config) {
    if (!panel || !config || typeof config !== 'object') return;
    const heading = panel.querySelector('.page-title');
    if (heading && config.heading) heading.textContent = config.heading;
    if (config.intro) {
      let subtle = panel.querySelector('.subtle');
      if (!subtle) {
        subtle = document.createElement('p');
        subtle.className = 'subtle';
        panel.appendChild(subtle);
      }
      subtle.textContent = config.intro;
    }
  }

  function renderData(data) {
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

    if (path === 'achievements.html' && Array.isArray(cfg.featuredArticles) && cfg.featuredArticles.length) {
      applyFeaturedArticles(cfg.featuredArticles);
    }

    if (path === 'projects.html') applyPanelCopy(document.querySelector('main .section.panel'), cfg.projectsPage);
    if (path === 'timeline.html') applyPanelCopy(document.querySelector('main .section.panel'), cfg.timelinePage);
    if (path === 'achievements.html') {
      applyPanelCopy(document.querySelector('main .section.panel'), cfg.achievementsPage);
      applyTextConfig(cfg.achievementsPage, [
        ['editableHeading', 'main .section.panel + .section.panel .page-title', 'text'],
        ['editableIntro', 'main .section.panel + .section.panel .subtle', 'text'],
      ]);
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

    // Contact email: site-wide override of every mailto link from the admin field.
    const contactEmail = (cfg.contactPage && cfg.contactPage.email) || cfg.contactEmail;
    if (contactEmail) applyContactEmail(contactEmail);

    // Projects, Events, Timeline: admin owns the source of truth, but we only
    // replace the static fallback if the CMS list is "complete enough" so that
    // a stale or partial Firebase snapshot can't wipe a richer static page.
    // Threshold: CMS must have at least ~50% as many items as the static
    // fallback (and at least 1). Below that, we keep the static and log why.
    function canTrustCmsList(staticCount, cmsCount, label) {
      const min = Math.max(1, Math.floor(staticCount * 0.5));
      const ok = cmsCount >= min;
      if (!ok) {
        console.info(`[CMS] Keeping static ${label} (CMS has ${cmsCount}, needs ≥ ${min} of ${staticCount} static).`);
      }
      return ok;
    }

    const projects = data.projects || [];
    const mountP = document.getElementById('projects-dynamic-mount');
    const fbP = document.getElementById('projects-static-fallback');
    if (mountP && fbP && projects.length) {
      const staticCount = fbP.querySelectorAll('article').length;
      if (canTrustCmsList(staticCount, projects.length, 'projects')) {
        const projHtml = projects
          .sort((a, b) => {
            const bo = Number(b.orderIndex);
            const ao = Number(a.orderIndex);
            if (Number.isFinite(bo) && Number.isFinite(ao) && bo !== ao) return bo - ao;
            return parseSortMs(b.timelineSortMs) - parseSortMs(a.timelineSortMs);
          })
          .map(buildProjectCard)
          .join('');
        mountP.innerHTML = projHtml;
        mountP.hidden = false;
        fbP.hidden = true;
      }
    }

    const events = data.events || [];
    const mountE = document.getElementById('events-dynamic-mount');
    const fbE = document.getElementById('events-static-fallback');
    if (mountE && fbE && events.length) {
      const staticCount = fbE.querySelectorAll('article').length;
      if (canTrustCmsList(staticCount, events.length, 'events')) {
        const prof = events.filter((e) => (e.bucket || 'professional') !== 'competitions');
        const comp = events.filter((e) => (e.bucket || '') === 'competitions');
        const eventsPageCfg = cfg.eventsPage && typeof cfg.eventsPage === 'object' ? cfg.eventsPage : {};
        let html = '';
        if (prof.length) {
          html += `<section class="section stack reveal">${prof.map(buildEventCard).join('')}</section>`;
        }
        if (comp.length) {
          html += `<section class="section panel reveal"><h2 class="page-title">${escapeHtml(eventsPageCfg.competitionsHeading || 'Capture The Flags & Hackathons Attended')}</h2><p class="subtle">${escapeHtml(eventsPageCfg.competitionsIntro || 'Competition and challenge events focused on practical cybersecurity and collaborative problem solving.')}</p></section><section class="section stack reveal">${comp.map(buildEventCard).join('')}</section>`;
        }
        mountE.innerHTML = html || `<section class="section stack reveal">${events.map(buildEventCard).join('')}</section>`;
        mountE.hidden = false;
        fbE.hidden = true;
      }
    }

    const timelineRows = mergeTimelineRows(data, settings);
    const mountT = document.getElementById('timeline-dynamic-mount');
    const fbT = document.getElementById('timeline-static-fallback');
    if (mountT && fbT && timelineRows.length) {
      const staticCount = fbT.querySelectorAll('article').length;
      if (canTrustCmsList(staticCount, timelineRows.length, 'timeline')) {
        mountT.innerHTML = timelineRows.map(buildTimelineArticle).join('');
        mountT.hidden = false;
        fbT.hidden = true;
      }
    }

    if (payload && payload.resumeUrl) applyResumeLinks(payload.resumeUrl);

    if (path === 'events.html') {
      applyPanelCopy(document.querySelector('main .section.panel'), cfg.eventsPage);
    }

    if (path === 'experience.html') {
      applyPanelCopy(document.querySelector('main .section.panel'), cfg.experiencePage);
      const mount = document.getElementById('experience-dynamic-mount');
      if (mount && !mount.hidden && cfg.experiencePage && typeof cfg.experiencePage === 'object') {
        const headings = mount.querySelectorAll('.page-title');
        if (headings[0] && cfg.experiencePage.professionalHeading) headings[0].textContent = cfg.experiencePage.professionalHeading;
        if (headings[1] && cfg.experiencePage.campusHeading) headings[1].textContent = cfg.experiencePage.campusHeading;
      }
    }

    window.dispatchEvent(new CustomEvent('mam-cms-ready', { detail: data }));

    if (typeof window.mamReinitAfterCms === 'function') {
      window.mamReinitAfterCms();
    }
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
    try {
      renderData(data);
    } catch (err) {
      console.warn('[CMS] render failed', err);
    }
  }

  window.MamCms = window.MamCms || {};
  window.MamCms.clearCmsThemeInlineVars = clearCmsThemeInlineVars;
  window.MamCms.reapplyCmsTheme = function reapplyCmsTheme() {
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
