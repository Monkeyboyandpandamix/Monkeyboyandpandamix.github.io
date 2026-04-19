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

    const msg = document.getElementById('admin-message');
    const loadBtn = document.getElementById('load-static-cms-btn');
    const publishAllBtn = document.getElementById('publish-all-firestore-btn');

    if (loadBtn && !loadBtn.dataset.bound) {
      loadBtn.dataset.bound = '1';
      loadBtn.addEventListener('click', async () => {
        msg.textContent = 'Loading current static site into the CMS editor…';
        try {
          await loadStaticSiteIntoEditor();
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
        <p class="subtle"><strong>Timeline:</strong> entries auto-link by <code>slug</code>. Use <code>timelineSortMs</code> for exact ordering, or let the site infer order from <code>dateLine</code>. Optional <code>timelineLinkKind</code>: <code>project</code> | <code>event</code> | <code>experience</code> | <code>external</code> | <code>custom</code>.</p>
        <p class="subtle"><strong>Experience entries:</strong> <code>section</code>: <code>professional</code> or <code>campus</code>; <code>orderIndex</code> (higher = closer to top). Experience rows now auto-feed the timeline when they have a date.</p>
        <p class="subtle"><strong>Events:</strong> <code>bucket</code>: <code>professional</code> | <code>competitions</code>.</p>
      `;
    }
  };
})();
