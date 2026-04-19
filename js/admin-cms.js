/**
 * Extended admin: Realtime Database resume, config JSON fields, collection bulk publish.
 */
(function () {
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

  async function fillFormFromFirebase() {
    let data;
    try {
      data = await window.CmsApi.loadAllCmsData();
    } catch (e) {
      console.warn(e);
      return;
    }
    if (!data) return;
    const c = data.config || {};

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

  async function fetchPageDoc(path) {
    const res = await fetch(`./${path}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load ${path}`);
    const raw = await res.text();
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
    const docs = await fetchStaticDocs();
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
  }

  function collectConfigPayloadFromEditor() {
    const payload = {
      achievementsBlocks: typeof getBlocks === 'function' ? getBlocks() : [],
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
    const card = document.createElement('article');
    card.className = 'admin-editor-card';
    card.innerHTML = `<h4>${title}</h4><div class="form-grid">${fieldsHtml}</div><div class="actions"><button class="btn ghost" type="button" data-action="remove">Remove</button></div>`;
    return card;
  }

  function renderFriendlyList(containerId, items, renderer) {
    const mount = document.getElementById(containerId);
    if (!mount) return;
    mount.innerHTML = '';
    items.forEach((item, index) => mount.appendChild(renderer(item, index)));
  }

  function projectEditorCard(item, index) {
    const card = makeFriendlyEditorCard(`Project ${index + 1}`, `
      <label>Title<input data-field="title" value="${escapeAttr(item.title)}" /></label>
      <label>Slug<input data-field="slug" value="${escapeAttr(item.slug)}" /></label>
      <label>Date<input data-field="dateLine" value="${escapeAttr(item.dateLine)}" /></label>
      <label>Category<select data-field="category"><option value="software">Software</option><option value="hardware">Hardware</option><option value="hybrid">Hybrid</option></select></label>
      <label class="full">Summary<textarea data-field="summary" rows="3">${escapeAttr(item.summaryText)}</textarea></label>
      <label class="full">Details<textarea data-field="details" rows="4">${escapeAttr(item.detailText)}</textarea></label>
      <label>Tags<input data-field="chips" value="${escapeAttr((item.chips || []).join(', '))}" /></label>
      <label>Media URLs (one per line)<textarea data-field="media" rows="4">${escapeAttr((item.media || []).map((m) => m.src || '').join('\n'))}</textarea></label>
    `);
    card.querySelector('[data-field="category"]').value = item.category || 'software';
    card.querySelector('[data-action="remove"]').addEventListener('click', () => {
      const list = getFriendlyProjects();
      list.splice(index, 1);
      setFriendlyProjects(list);
      renderFriendlyEditors();
    });
    return card;
  }

  function eventEditorCard(item, index) {
    const card = makeFriendlyEditorCard(`Event ${index + 1}`, `
      <label>Title<input data-field="title" value="${escapeAttr(item.title)}" /></label>
      <label>Slug<input data-field="slug" value="${escapeAttr(item.slug)}" /></label>
      <label>Date<input data-field="dateLine" value="${escapeAttr(item.dateLine)}" /></label>
      <label>Bucket<select data-field="bucket"><option value="professional">Professional</option><option value="competitions">Competitions</option></select></label>
      <label class="full">Summary<textarea data-field="summary" rows="3">${escapeAttr(item.summaryText)}</textarea></label>
      <label class="full">Details<textarea data-field="details" rows="4">${escapeAttr(item.detailText)}</textarea></label>
      <label>Tags<input data-field="chips" value="${escapeAttr((item.chips || []).join(', '))}" /></label>
      <label>Media URLs (one per line)<textarea data-field="media" rows="4">${escapeAttr((item.media || []).map((m) => m.src || '').join('\n'))}</textarea></label>
    `);
    card.querySelector('[data-field="bucket"]').value = item.bucket || 'professional';
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
      <label>Date<input data-field="dateLine" value="${escapeAttr(item.dateLine)}" /></label>
      <label>Section<select data-field="section"><option value="professional">Professional</option><option value="campus">Campus</option></select></label>
      <label>Meta<input data-field="meta" value="${escapeAttr(item.meta)}" /></label>
      <label class="full">Bullets (one per line)<textarea data-field="bullets" rows="5">${escapeAttr((item.bullets || []).join('\n'))}</textarea></label>
      <label>Tags<input data-field="chips" value="${escapeAttr((item.chips || []).join(', '))}" /></label>
    `);
    card.querySelector('[data-field="section"]').value = item.section || 'professional';
    card.querySelector('[data-action="remove"]').addEventListener('click', () => {
      const list = getFriendlyExperience();
      list.splice(index, 1);
      setFriendlyExperience(list);
      renderFriendlyEditors();
    });
    return card;
  }

  function schoolEditorCard(item, index) {
    const categoriesText = (item.categories || [])
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
    const out = items.map((item, index) => ({
      slug: item.slug || makeSlug(item.title, `project-${index + 1}`),
      title: item.title || '',
      dateLine: item.dateLine || '',
      category: item.category || 'software',
      summaryHtml: item.summaryText ? `<p>${item.summaryText}</p>` : '',
      detailHtml: item.detailText ? `<p>${item.detailText.split('\n').join('</p><p>')}</p>` : '',
      chips: splitComma(item.chips || ''),
      media: splitLines(item.media || '').map((src) => ({ type: 'image', src })),
      timelineDateLabel: item.timelineDateLabel || item.dateLine || '',
      timelineEnabled: item.timelineEnabled !== false,
      timelineSortMs: item.timelineSortMs || parseTimelineSortMs(item.dateLine || ''),
      orderIndex: item.orderIndex || 1000 - index,
    }));
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
    const out = items.map((item, index) => ({
      slug: item.slug || makeSlug(item.title, `event-${index + 1}`),
      title: item.title || '',
      dateLine: item.dateLine || '',
      bucket: item.bucket || 'professional',
      summaryHtml: item.summaryText ? `<p>${item.summaryText}</p>` : '',
      detailHtml: item.detailText ? `<p>${item.detailText.split('\n').join('</p><p>')}</p>` : '',
      chips: splitComma(item.chips || ''),
      media: splitLines(item.media || '').map((src) => ({ type: 'image', src })),
      timelineDateLabel: item.timelineDateLabel || item.dateLine || '',
      timelineEnabled: item.timelineEnabled !== false,
      timelineSortMs: item.timelineSortMs || parseTimelineSortMs(item.dateLine || ''),
      orderIndex: item.orderIndex || 1000 - index,
    }));
    setTextarea('bulk-events-json', out);
  }

  function getFriendlyExperience() {
    return parseFieldJson('bulk-experience-json', []);
  }

  function setFriendlyExperience(items) {
    const out = items.map((item, index) => ({
      slug: item.slug || makeSlug(item.title, `experience-${index + 1}`),
      title: item.title || '',
      meta: item.meta || '',
      dateLine: item.dateLine || '',
      section: item.section || 'professional',
      bullets: Array.isArray(item.bullets) ? item.bullets : splitLines(item.bullets || ''),
      chips: splitComma(item.chips || ''),
      timelineDateLabel: item.timelineDateLabel || item.dateLine || '',
      timelineEnabled: item.timelineEnabled !== false,
      timelineSortMs: item.timelineSortMs || parseTimelineSortMs(item.dateLine || ''),
      orderIndex: item.orderIndex || 1000 - index,
    }));
    setTextarea('bulk-experience-json', out);
  }

  function getFriendlySchools() {
    const coursework = parseFieldJson('coursework-page-json-field', {});
    return Array.isArray(coursework.institutions) ? coursework.institutions.map((item) => ({ ...item, noteText: htmlToText(item.noteHtml) })) : [];
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

  function syncFriendlyTextFields() {
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
    setTextarea('experience-page-json-field', {
      heading: document.getElementById('friendly-experience-heading')?.value?.trim() || '',
      intro: document.getElementById('friendly-experience-intro')?.value?.trim() || '',
      professionalHeading: document.getElementById('friendly-experience-professional-heading')?.value?.trim() || '',
      campusHeading: document.getElementById('friendly-experience-campus-heading')?.value?.trim() || '',
    });
    setTextarea('achievements-page-json-field', {
      heading: document.getElementById('friendly-achievements-heading')?.value?.trim() || '',
      editableHeading: document.getElementById('friendly-achievements-editable-heading')?.value?.trim() || '',
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
  }

  function loadFriendlyTextFields() {
    const projectsPage = parseFieldJson('projects-page-json-field', {});
    const eventsPage = parseFieldJson('events-page-json-field', {});
    const experiencePage = parseFieldJson('experience-page-json-field', {});
    const achievementsPage = parseFieldJson('achievements-page-json-field', {});
    const contact = parseFieldJson('contact-page-json-field', {});
    const coursework = parseFieldJson('coursework-page-json-field', {});
    document.getElementById('friendly-projects-heading').value = projectsPage.heading || '';
    document.getElementById('friendly-projects-intro').value = projectsPage.intro || '';
    document.getElementById('friendly-events-heading').value = eventsPage.heading || '';
    document.getElementById('friendly-events-intro').value = eventsPage.intro || '';
    document.getElementById('friendly-events-competitions-heading').value = eventsPage.competitionsHeading || '';
    document.getElementById('friendly-events-competitions-intro').value = eventsPage.competitionsIntro || '';
    document.getElementById('friendly-experience-heading').value = experiencePage.heading || '';
    document.getElementById('friendly-experience-intro').value = experiencePage.intro || '';
    document.getElementById('friendly-experience-professional-heading').value = experiencePage.professionalHeading || '';
    document.getElementById('friendly-experience-campus-heading').value = experiencePage.campusHeading || '';
    document.getElementById('friendly-achievements-heading').value = achievementsPage.heading || '';
    document.getElementById('friendly-achievements-editable-heading').value = achievementsPage.editableHeading || '';
    document.getElementById('friendly-contact-heading').value = contact.heading || '';
    document.getElementById('friendly-contact-intro').value = htmlToText(contact.introHtml);
    document.getElementById('friendly-coursework-heading').value = coursework.panelTitle || '';
    document.getElementById('friendly-coursework-subtitle').value = coursework.panelSubtitle || '';
    document.getElementById('friendly-coursework-note').value = htmlToText(coursework.noteHtml);
  }

  function renderFriendlyEditors() {
    loadFriendlyTextFields();
    renderFriendlyList('friendly-project-list', getFriendlyProjects(), projectEditorCard);
    renderFriendlyList('friendly-event-list', getFriendlyEvents(), eventEditorCard);
    renderFriendlyList('friendly-experience-list', getFriendlyExperience(), experienceEditorCard);
    renderFriendlyList('friendly-school-list', getFriendlySchools(), schoolEditorCard);
    renderFriendlyList('friendly-contact-action-list', getFriendlyContactActions(), contactActionEditorCard);
    renderFriendlyList('friendly-contact-card-list', getFriendlyContactCards(), contactCardEditorCard);
  }

  function syncFriendlyEditorsToJson() {
    const collectFromCards = (containerId, mapper) =>
      [...document.querySelectorAll(`#${containerId} .admin-editor-card`)].map(mapper);

    setFriendlyProjects(
      collectFromCards('friendly-project-list', (card) => ({
        title: card.querySelector('[data-field="title"]').value.trim(),
        slug: card.querySelector('[data-field="slug"]').value.trim(),
        dateLine: card.querySelector('[data-field="dateLine"]').value.trim(),
        category: card.querySelector('[data-field="category"]').value,
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
        dateLine: card.querySelector('[data-field="dateLine"]').value.trim(),
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
        dateLine: card.querySelector('[data-field="dateLine"]').value.trim(),
        section: card.querySelector('[data-field="section"]').value,
        meta: card.querySelector('[data-field="meta"]').value.trim(),
        bullets: card.querySelector('[data-field="bullets"]').value.trim(),
        chips: card.querySelector('[data-field="chips"]').value.trim(),
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
    syncFriendlyTextFields();
  }

  async function publishAllFromEditor() {
    if (!window.CmsApi.isAdminUser()) throw new Error('Admin sign-in required');
    await window.CmsApi.saveConfigSite(collectConfigPayloadFromEditor());
    await publishCollection('site_projects', document.getElementById('bulk-projects-json')?.value, 'slug');
    await publishCollection('site_events', document.getElementById('bulk-events-json')?.value, 'slug');
    await publishCollection('site_roles', document.getElementById('bulk-roles-json')?.value, 'slug');
    await publishCollection('site_experience', document.getElementById('bulk-experience-json')?.value, 'slug');
  }

  window.initAdminCmsExtensions = async function initAdminCmsExtensions() {
    if (!window.CmsApi?.firebaseConfigured?.()) return;

    await fillFormFromFirebase();
    renderFriendlyEditors();

    const msg = document.getElementById('admin-message');
    const loadBtn = document.getElementById('load-static-cms-btn');
    const publishAllBtn = document.getElementById('publish-all-firestore-btn');
    const saveBtn = document.getElementById('save-blocks');

    window.syncFriendlyCmsEditors = syncFriendlyEditorsToJson;

    [
      ['friendly-add-project', getFriendlyProjects, setFriendlyProjects, { title: '', slug: '', dateLine: '', category: 'software', summaryText: '', detailText: '', chips: '', media: '' }],
      ['friendly-add-event', getFriendlyEvents, setFriendlyEvents, { title: '', slug: '', dateLine: '', bucket: 'professional', summaryText: '', detailText: '', chips: '', media: '' }],
      ['friendly-add-experience', getFriendlyExperience, setFriendlyExperience, { title: '', slug: '', dateLine: '', section: 'professional', meta: '', bullets: [], chips: '' }],
      ['friendly-add-school', getFriendlySchools, setFriendlySchools, { name: '', subtitle: '', categories: '', noteText: '' }],
      ['friendly-add-contact-action', getFriendlyContactActions, setFriendlyContactActions, { label: '', href: '', variant: 'ghost', external: false }],
      ['friendly-add-contact-card', getFriendlyContactCards, setFriendlyContactCards, { title: '', bodyText: '' }],
    ].forEach(([id, getter, setter, template]) => {
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
        msg.textContent = 'Loading current static site into the CMS editor…';
        try {
          await loadStaticSiteIntoEditor();
          renderFriendlyEditors();
          msg.textContent = 'Loaded current site content into the CMS editor. Review and publish when ready.';
        } catch (e) {
          msg.textContent = e.message || 'Static import failed.';
        }
        setTimeout(() => (msg.textContent = ''), 5000);
      });
    }

    if (publishAllBtn && !publishAllBtn.dataset.bound) {
      publishAllBtn.dataset.bound = '1';
      publishAllBtn.addEventListener('click', async () => {
        syncFriendlyEditorsToJson();
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

    document.getElementById('resume-upload-btn')?.addEventListener('click', async () => {
      const input = document.getElementById('resume-file-input');
      const file = input?.files?.[0];
      if (!file) {
        msg.textContent = 'Choose a PDF first.';
        setTimeout(() => (msg.textContent = ''), 2500);
        return;
      }
      try {
        const storageRef = firebase.storage().ref(`site/resume/${file.name.replace(/\s+/g, '_')}`);
        await storageRef.put(file);
        const url = await storageRef.getDownloadURL();
        const resumeEl = document.getElementById('resume-url-field');
        if (resumeEl) resumeEl.value = url;
        msg.textContent = 'Resume uploaded. URL filled — click Save Changes to sync config to Firebase.';
        setTimeout(() => (msg.textContent = ''), 4000);
      } catch (e) {
        msg.textContent = e.message || 'Upload failed.';
        setTimeout(() => (msg.textContent = ''), 4000);
      }
    });

    document.getElementById('publish-collections-btn')?.addEventListener('click', async () => {
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
  };
})();
