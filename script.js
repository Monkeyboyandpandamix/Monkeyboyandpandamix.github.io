const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

const currentFile = window.location.pathname.split('/').pop() || 'index.html';
document.body.dataset.page = currentFile;
document.querySelectorAll('nav a[data-page]').forEach((link) => {
  if (link.dataset.page === currentFile) link.classList.add('active');
});

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) entry.target.classList.add('show');
    }
  },
  { threshold: 0.03, rootMargin: "0px 0px -8% 0px" }
);

document.querySelectorAll('.reveal').forEach((el, i) => {
  el.style.transitionDelay = `${i * 70}ms`;
  observer.observe(el);
  const rect = el.getBoundingClientRect();
  if (rect.top < window.innerHeight * 0.98 && rect.bottom > 0) {
    el.classList.add('show');
  }
});

if (currentFile === 'projects.html') {
  document.querySelectorAll('.reveal').forEach((el) => el.classList.add('show'));
}

function initExpandableBlocks() {
  const isInteractiveTarget = (target) => {
    return !!target.closest('a, button, input, select, textarea, video, iframe, label, summary, [role="button"]');
  };

  const isAnimating = (container) => container.dataset.animating === '1';

  const animateOpen = (container, content, btn) => {
    if (isAnimating(container)) return;
    container.dataset.animating = '1';
    container.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    content.style.display = 'block';
    content.style.overflow = 'hidden';
    content.style.height = '0px';
    content.style.opacity = '0';
    requestAnimationFrame(() => {
      content.style.transition = 'height 240ms ease, opacity 200ms ease';
      content.style.height = `${content.scrollHeight}px`;
      content.style.opacity = '1';
    });
    const done = () => {
      content.style.height = 'auto';
      content.style.overflow = '';
      content.style.transition = '';
      container.dataset.animating = '0';
      content.removeEventListener('transitionend', done);
    };
    content.addEventListener('transitionend', done);
  };

  const animateClose = (container, content, btn) => {
    if (isAnimating(container)) return;
    container.dataset.animating = '1';
    container.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    content.style.display = 'block';
    content.style.overflow = 'hidden';
    content.style.height = `${content.scrollHeight}px`;
    content.style.opacity = '1';
    requestAnimationFrame(() => {
      content.style.transition = 'height 220ms ease, opacity 170ms ease';
      content.style.height = '0px';
      content.style.opacity = '0';
    });
    const done = () => {
      content.style.display = 'none';
      content.style.height = '';
      content.style.opacity = '';
      content.style.overflow = '';
      content.style.transition = '';
      container.dataset.animating = '0';
      content.removeEventListener('transitionend', done);
    };
    content.addEventListener('transitionend', done);
  };

  const toggle = (container, content, btn) => {
    if (isAnimating(container)) return;
    if (container.classList.contains('is-open')) animateClose(container, content, btn);
    else animateOpen(container, content, btn);
  };

  const makeExpandable = (container, keepCount, kind) => {
    if (!container || container.dataset.expandReady === '1') return;
    const kids = [...container.children];
    if (kids.length <= keepCount) return;

    const keep = kids.slice(0, keepCount);
    const rest = kids.slice(keepCount);
    if (!rest.length) return;

    const content = document.createElement('div');
    content.className = 'card-expand-content';
    rest.forEach((n) => content.appendChild(n));
    container.appendChild(content);

    const btn = document.createElement('button');
    btn.className = 'expand-arrow-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Expand section');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span aria-hidden="true">▾</span>';

    if (kind === 'section') {
      keep[0]?.classList.add('expand-title-row');
      keep[0]?.appendChild(btn);
      container.classList.add('section-expandable');
    } else {
      container.insertBefore(btn, content);
      container.classList.add('card-expandable');
    }

    content.style.display = 'none';
    container.dataset.expandReady = '1';
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggle(container, content, btn);
    });

    container.addEventListener('click', (event) => {
      if (isInteractiveTarget(event.target)) return;
      toggle(container, content, btn);
    });
  };

  if (currentFile === 'index.html') {
    makeExpandable(document.getElementById('home-summary'), 1, 'section');
    makeExpandable(document.getElementById('home-competencies'), 1, 'section');
  }

  if (currentFile === 'experience.html') {
    document.querySelectorAll('main .stack > .card').forEach((card) => {
      let keepCount = 1;
      const kids = [...card.children];
      for (let i = 1; i < kids.length; i += 1) {
        const el = kids[i];
        if (el.matches('.meta, .date')) keepCount += 1;
        else break;
      }
      makeExpandable(card, keepCount, 'card');
    });
  }

  if (currentFile === 'events.html') {
    document.querySelectorAll('main .stack > .card').forEach((card) => {
      let keepCount = 1;
      const kids = [...card.children];
      for (let i = 1; i < kids.length; i += 1) {
        const el = kids[i];
        if (el.matches('.meta, .date')) keepCount += 1;
        else break;
      }
      makeExpandable(card, keepCount, 'card');
    });
  }

  if (currentFile === 'achievements.html') {
    document.querySelectorAll('main .grid-2 > .card').forEach((card) => {
      let keepCount = 1;
      const kids = [...card.children];
      for (let i = 1; i < kids.length; i += 1) {
        const el = kids[i];
        if (el.matches('.meta, .date')) keepCount += 1;
        else break;
      }
      makeExpandable(card, keepCount, 'card');
    });
  }

  if (currentFile === 'coursework.html') {
    document.querySelectorAll('main .grid-2 > .card').forEach((card) => {
      let keepCount = 1;
      const kids = [...card.children];
      for (let i = 1; i < kids.length; i += 1) {
        const el = kids[i];
        if (el.matches('.meta, .date')) keepCount += 1;
        else break;
      }
      makeExpandable(card, keepCount, 'card');
    });
  }
}

initExpandableBlocks();

function initProjectAccordions() {
  if (currentFile !== 'projects.html') return;
  const isInteractiveTarget = (target) => {
    return !!target.closest('a, button, input, select, textarea, video, iframe, label, summary, [role="button"]');
  };
  const isAnimating = (details) => details.dataset.animating === '1';

  const detailsNodes = [...document.querySelectorAll('.card details')];
  if (!detailsNodes.length) return;

  const animateOpen = (details, content) => {
    if (isAnimating(details)) return;
    details.dataset.animating = '1';
    details.closest('.project-click-expand')?.classList.remove('project-collapsed');
    details.open = true;
    content.style.display = 'block';
    content.style.overflow = 'hidden';
    content.style.height = '0px';
    content.style.opacity = '0';

    const endHeight = `${content.scrollHeight}px`;
    requestAnimationFrame(() => {
      content.style.transition = 'height 260ms ease, opacity 220ms ease';
      content.style.height = endHeight;
      content.style.opacity = '1';
    });

    const done = () => {
      content.style.height = 'auto';
      content.style.overflow = '';
      content.style.transition = '';
      details.dataset.animating = '0';
      content.removeEventListener('transitionend', done);
    };
    content.addEventListener('transitionend', done);
  };

  const animateClose = (details, content) => {
    if (isAnimating(details)) return;
    details.dataset.animating = '1';
    content.style.display = 'block';
    content.style.overflow = 'hidden';
    content.style.height = `${content.scrollHeight}px`;
    content.style.opacity = '1';

    requestAnimationFrame(() => {
      content.style.transition = 'height 240ms ease, opacity 180ms ease';
      content.style.height = '0px';
      content.style.opacity = '0';
    });

    const done = () => {
      details.open = false;
      details.closest('.project-click-expand')?.classList.add('project-collapsed');
      content.style.display = 'none';
      content.style.height = '';
      content.style.opacity = '';
      content.style.overflow = '';
      content.style.transition = '';
      details.dataset.animating = '0';
      content.removeEventListener('transitionend', done);
    };
    content.addEventListener('transitionend', done);
  };

  const toggle = (details, content) => {
    if (isAnimating(details)) return;
    if (details.open) animateClose(details, content);
    else animateOpen(details, content);
  };

  detailsNodes.forEach((details) => {
    const summary = details.querySelector('summary');
    if (!summary) return;
    summary.classList.add('project-arrow-summary');
    summary.setAttribute('aria-label', 'Toggle project details');
    summary.innerHTML = '<span class="sr-only">Toggle project details</span><span aria-hidden="true">▾</span>';

    const content = document.createElement('div');
    content.className = 'details-content';

    [...details.children].forEach((child) => {
      if (child.tagName !== 'SUMMARY') content.appendChild(child);
    });
    details.appendChild(content);

    if (!details.open) content.style.display = 'none';

    summary.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggle(details, content);
    });

    const card = details.closest('.card');
    if (card) {
      card.classList.add('project-click-expand');
      if (!details.open) card.classList.add('project-collapsed');
      card.addEventListener('click', (event) => {
        if (isInteractiveTarget(event.target)) return;
        toggle(details, content);
      });
    }
  });

  const expandAllBtn = document.getElementById('expand-all-projects');
  const collapseAllBtn = document.getElementById('collapse-all-projects');

  if (expandAllBtn) {
    expandAllBtn.addEventListener('click', () => {
      detailsNodes.forEach((details) => {
        if (details.open) return;
        const content = details.querySelector('.details-content');
        if (content) animateOpen(details, content);
      });
    });
  }

  if (collapseAllBtn) {
    collapseAllBtn.addEventListener('click', () => {
      detailsNodes.forEach((details) => {
        if (!details.open) return;
        const content = details.querySelector('.details-content');
        if (content) animateClose(details, content);
      });
    });
  }
}

initProjectAccordions();

function initProjectFilters() {
  if (currentFile !== 'projects.html') return;
  const wrap = document.getElementById('project-filters');
  if (!wrap) return;

  const cards = [...document.querySelectorAll('main .stack > .card')];
  const buttons = [...wrap.querySelectorAll('[data-project-filter]')];

  cards.forEach((card) => {
    const hasHardwareChip = !!card.querySelector('.chip-hardware');
    const h3Text = (card.querySelector('h3')?.textContent || '');
    const hasHardwareSymbol = h3Text.includes('⚙') || !!card.querySelector('.hw-symbol');
    card.dataset.projectKinds = (hasHardwareChip || hasHardwareSymbol) ? 'hardware software hybrid' : 'software';
  });

  const applyFilter = (filter) => {
    buttons.forEach((b) => b.classList.toggle('active', b.getAttribute('data-project-filter') === filter));
    cards.forEach((card) => {
      const kinds = (card.dataset.projectKinds || 'software').split(/\s+/).filter(Boolean);
      card.style.display = filter === 'all' || kinds.includes(filter) ? '' : 'none';
    });
  };

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => applyFilter(btn.getAttribute('data-project-filter') || 'all'));
  });

  applyFilter('all');
}

initProjectFilters();

function decorateHardwareSymbols() {
  document.querySelectorAll('h3').forEach((h3) => {
    if (!h3.textContent || !h3.textContent.includes('⚙')) return;
    if (h3.querySelector('.hw-symbol')) return;
    h3.innerHTML = h3.innerHTML.replace('⚙', '<span class="hw-symbol" aria-label="hardware">⚙</span>');
  });
}

decorateHardwareSymbols();

function iconForProjectTitle(title) {
  const t = (title || '').toLowerCase();
  if (t.includes('shape') || t.includes('studio') || t.includes('web')) return 'shapes';
  if (t.includes('drone') || t.includes('unmanned') || t.includes('m.o.u.s.e')) return 'drone';
  if (t.includes('intrusion') || t.includes('cyber') || t.includes('keylogger') || t.includes('guardiapass')) return 'shield';
  if (t.includes('robot') || t.includes('seagrant')) return 'robot';
  if (t.includes('cluster') || t.includes('infrastructure') || t.includes('lab')) return 'server';
  if (t.includes('hack') || t.includes('aura') || t.includes('gratitude') || t.includes('quickvest')) return 'trophy';
  return 'code';
}

function iconSvg(name) {
  const icons = {
    shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 4.9-3 8.5-7 10-4-1.5-7-5.1-7-10V6z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 12l2 2 4-4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    drone: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="2.3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 5v3M12 16v3M5 12h3M16 12h3" stroke="currentColor" stroke-width="1.8"/><circle cx="6" cy="6" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="18" cy="6" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="6" cy="18" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="18" cy="18" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    server: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="6" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="4" y="14" width="16" height="6" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8" cy="7" r="0.9" fill="currentColor"/><circle cx="8" cy="17" r="0.9" fill="currentColor"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v3a4 4 0 0 1-8 0z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 6H5a2 2 0 0 0 2 2M16 6h3a2 2 0 0 1-2 2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v3M9 20h6M10 17h4" stroke="currentColor" stroke-width="1.8"/></svg>',
    robot: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="8" width="12" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="10" cy="13" r="1" fill="currentColor"/><circle cx="14" cy="13" r="1" fill="currentColor"/><path d="M12 5v3M8 19v2M16 19v2" stroke="currentColor" stroke-width="1.8"/></svg>',
    shapes: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17" cy="7" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 20l-4-7h8z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    code: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13 6l-2 12" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  };
  return icons[name] || icons.code;
}

function enhanceProjectAndTimelineVisuals() {
  if (currentFile === 'projects.html') {
    document.querySelectorAll('main .stack > .card').forEach((card) => {
      const h3 = card.querySelector('h3');
      if (!h3 || h3.querySelector('.title-icon')) return;
      const iconName = iconForProjectTitle(h3.textContent || '');
      const icon = document.createElement('span');
      icon.className = `title-icon ${iconName}`;
      icon.innerHTML = iconSvg(iconName);
      h3.prepend(icon);
    });
  }

  if (currentFile === 'timeline.html') {
    document.querySelectorAll('.timeline-item').forEach((item) => {
      const h3 = item.querySelector('h3');
      if (!h3 || h3.querySelector('.title-icon')) return;

      let kind = 'project';
      if (item.classList.contains('role-item')) kind = 'role';
      if (item.classList.contains('event-item')) kind = 'event';
      const iconName = kind === 'role' ? 'shield' : kind === 'event' ? 'trophy' : 'code';

      const icon = document.createElement('span');
      icon.className = `title-icon ${iconName}`;
      icon.innerHTML = iconSvg(iconName);
      h3.prepend(icon);
    });
  }
}

enhanceProjectAndTimelineVisuals();

function initTimelineFilters() {
  if (currentFile !== 'timeline.html') return;
  const wrap = document.getElementById('timeline-filters');
  if (!wrap) return;

  const buttons = [...wrap.querySelectorAll('[data-timeline-filter]')];
  const items = [...document.querySelectorAll('.timeline-item')];

  const itemType = (item) => {
    if (item.classList.contains('role-item')) return 'role';
    if (item.classList.contains('event-item')) return 'event';
    return 'project';
  };

  const applyFilter = (filter) => {
    buttons.forEach((b) => b.classList.toggle('active', b.getAttribute('data-timeline-filter') === filter));
    items.forEach((item) => {
      if (item.dataset.hiddenBySetting === '1') {
        item.style.display = 'none';
        return;
      }
      const type = itemType(item);
      item.style.display = filter === 'all' || type === filter ? '' : 'none';
    });
  };

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => applyFilter(btn.getAttribute('data-timeline-filter') || 'all'));
  });

  applyFilter('all');
}

initTimelineFilters();
function initGlobalFooterLinks() {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  if (page === 'admin.html' || page === 'login.html') return;

  const footer = document.querySelector('footer');
  if (!footer) return;

  footer.innerHTML = `
    <div class="container footer-stack">
      <nav class="footer-socials" aria-label="Social links">
        <a class="social-link" href="mailto:mo10141014@gmail.com" target="_blank" rel="noopener" aria-label="Email">
          <span class="social-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M3 6h18v12H3z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 7l9 7 9-7" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>
          </span>
          <span>Email</span>
        </a>
        <a class="social-link" href="https://instagram.com/mo10141014" target="_blank" rel="noopener" aria-label="Instagram">
          <span class="social-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><rect x="4.2" y="4.2" width="15.6" height="15.6" rx="4" ry="4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17.4" cy="6.8" r="1.1" fill="currentColor"/></svg>
          </span>
          <span>Instagram</span>
        </a>
        <a class="social-link" href="https://www.linkedin.com/in/mohammadam0" target="_blank" rel="noopener" aria-label="LinkedIn">
          <span class="social-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="7" y="10" width="2.6" height="7.2" fill="currentColor"/><circle cx="8.3" cy="7.8" r="1.3" fill="currentColor"/><path d="M12.1 10v7.2h2.6v-3.8c0-1.1.8-1.8 1.7-1.8.9 0 1.6.7 1.6 1.8v3.8h2.6v-4.4c0-2.1-1.1-3.3-3-3.3-1.1 0-1.8.5-2.3 1V10z" fill="currentColor"/></svg>
          </span>
          <span>LinkedIn</span>
        </a>
        <a class="social-link" href="https://github.com/Monkeyboyandpandamix" target="_blank" rel="noopener" aria-label="GitHub">
          <span class="social-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 3.2A8.8 8.8 0 0 0 3.2 12a8.8 8.8 0 0 0 6 8.4c.4.1.6-.2.6-.5v-1.8c-2.5.6-3.1-1.1-3.1-1.1-.4-1-.9-1.3-.9-1.3-.8-.5.1-.5.1-.5.8.1 1.3.9 1.3.9.8 1.3 2 1 2.5.8.1-.6.3-1 .6-1.2-2-.2-4-1-4-4.2 0-.9.3-1.6.9-2.2-.1-.2-.4-1.1.1-2.2 0 0 .7-.2 2.3.8a8 8 0 0 1 4.2 0c1.6-1.1 2.3-.8 2.3-.8.5 1.1.2 2 .1 2.2.6.6.9 1.3.9 2.2 0 3.2-2 4-4 4.2.3.3.6.8.6 1.7v2.5c0 .3.2.6.6.5a8.8 8.8 0 0 0 6-8.4A8.8 8.8 0 0 0 12 3.2z" fill="currentColor"/></svg>
          </span>
          <span>GitHub</span>
        </a>
        <a class="social-link" href="https://facebook.com/mohammad.mohammadi.880160" target="_blank" rel="noopener" aria-label="Facebook">
          <span class="social-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M13.4 20.8v-7h2.3l.4-2.8h-2.7V9.2c0-.8.2-1.4 1.4-1.4h1.5V5.3c-.3 0-1.1-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8V11H8v2.8h2.4v7z" fill="currentColor"/></svg>
          </span>
          <span>Facebook</span>
        </a>
      </nav>
      <p>&copy; 2026 Mohammad Agha Mohammadi Cyber - all rights reserved Content and design are monitored and protected for digital security compliance.</p>
    </div>
  `;
}

initGlobalFooterLinks();

(function applyPortalSettings() {
  const SETTINGS_KEY = 'portal_settings_v2';
  let settings = { redPages: [], timelineHideProjects: false, iconStylePages: {} };
  try {
    settings = { ...settings, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) };
  } catch {}

  const page = window.location.pathname.split('/').pop() || 'index.html';

  if (Array.isArray(settings.redPages) && settings.redPages.includes(page)) {
    document.body.classList.add('cyber-red-page');
  }

  const styleRaw = settings.iconStylePages && typeof settings.iconStylePages === 'object'
    ? settings.iconStylePages[page]
    : 'neon';
  const iconStyle = ['minimal', 'neon', 'solid'].includes((styleRaw || '').toLowerCase())
    ? styleRaw.toLowerCase()
    : 'neon';
  document.body.classList.remove('icon-style-minimal', 'icon-style-neon', 'icon-style-solid');
  document.body.classList.add(`icon-style-${iconStyle}`);

  if (page === 'timeline.html' && settings.timelineHideProjects) {
    document.querySelectorAll('.timeline-item.project-item').forEach((el) => {
      el.dataset.hiddenBySetting = '1';
      el.style.display = 'none';
    });
  }
})();

// Basic analytics: local metrics + optional global counter.
(function trackVisitorMetrics() {
  const LOCAL_KEY = 'site_metrics_local_v1';
  const GLOBAL_KEY = 'site_metrics_global_v1';
  const COUNTAPI_NAMESPACE = 'mohammad-techprofile';
  const COUNTAPI_KEY = 'website-visits';

  const path = window.location.pathname.split('/').pop() || 'index.html';
  const now = new Date().toISOString();

  let metrics = { total: 0, pages: {}, lastVisit: null };
  try {
    metrics = JSON.parse(localStorage.getItem(LOCAL_KEY)) || metrics;
  } catch {
    metrics = { total: 0, pages: {}, lastVisit: null };
  }

  metrics.total += 1;
  metrics.pages[path] = (metrics.pages[path] || 0) + 1;
  metrics.lastVisit = now;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(metrics));

  fetch(`https://api.countapi.xyz/hit/${COUNTAPI_NAMESPACE}/${COUNTAPI_KEY}`)
    .then((res) => res.json())
    .then((data) => {
      if (typeof data.value === 'number') {
        localStorage.setItem(GLOBAL_KEY, JSON.stringify({ value: data.value, updatedAt: now }));
      }
    })
    .catch(() => {
      // Ignore network failures so static hosting still works without interruption.
    });
})();
