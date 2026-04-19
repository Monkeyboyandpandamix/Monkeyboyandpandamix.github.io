# Mohammad Agha Mohammadi Portfolio

## Overview
A static portfolio website for Mohammad Agha Mohammadi, a Computer Science and Cybersecurity professional. Features a dark "Black-theme" design showcasing professional experience, academic coursework, technical projects, hackathon achievements, and certifications.

## Tech Stack
- **Frontend:** Vanilla HTML5, CSS3, JavaScript (ES6+)
- **No build system** — pure static files served directly
- **Data Persistence:** LocalStorage/SessionStorage for admin portal data

## Project Structure
```
/
├── index.html          # Home page
├── experience.html     # Professional experience
├── coursework.html     # Academic courses
├── projects.html       # Portfolio projects
├── timeline.html       # Chronological history
├── events.html         # Networking events
├── achievements.html   # Awards
├── contact.html        # Contact info
├── login.html          # Admin portal login
├── admin.html          # Admin portal dashboard
├── styles.css          # Main stylesheet
├── script.js           # Core UI logic
├── portal.js           # Admin portal logic
├── resume.pdf          # Resume
└── assets/media/       # Project images/videos
```

## Running the App
- Workflow: "Start application"
- Command: `python3 -m http.server 5000 --bind 0.0.0.0`
- Port: 5000

## Deployment
- Type: Static site
- Public directory: `.` (project root)

## CMS Admin Upgrades (Apr 2026)
- Project/Event/Experience editors now use `<input type="month">` Start/End + Ongoing checkbox; auto-populates Display date and `timelineSortMs` for timeline auto-sync.
- Project & Event cards have a file-upload picker that converts images to base64 data URLs and appends them to the media list (with thumb gallery + remove buttons). Stored under `media:[{type:"image",src}]` in RTDB so existing renderMediaGallery works unchanged. Per-file warning at 1.5MB.
- Certifications: split single date into Issued + Expires (completed) and Started + Expected (in progress). normalizeCertCompleted/Progress preserve all four fields. cms-render.js buildCertChip already renders "Issued ... · Expires ..." meta.
- Project category dropdown (software/hardware/hybrid) drives both the ⚙ gear in render and the Projects page filter. All 16 static `<article>` cards in projects.html are now tagged with `data-project-category`. script.js refreshProjectCardKinds maps explicit categories correctly.

## Site Fixes (Apr 19, 2026)
- Home hero name accent: `applyHomeHero` now skips when CMS payload is empty AND auto-rebuilds the `<span class="accent-block">` highlight on the last 1-2 words of the title so saving plain text in the CMS no longer drops the highlight (`highlightNameLastWords`).
- Coursework dedup: `applyCourseworkPage` now hides the per-institution name when there is a single school whose name matches the panel title (or is the placeholder "Education"), hides duplicate institution subtitles, and dedups institution `noteHtml` against panel `noteHtml`. Multi-school setups still render every school name.
- Featured Articles: moved Guilford article from `events.html` to a new "Featured Articles & Press" section on `achievements.html`. New CMS array `featuredArticles` rendered by `applyFeaturedArticles`; admin field `featured-articles-json-field` wired through both `js/admin-cms.js` config payload AND `portal.js` `collectCmsFirestoreExtras` so Save Changes persists it.
- Responsive + a11y: appended phone (≤640) / very-small (≤380) / tablet (641-1024) media queries to `styles.css`, plus `prefers-reduced-motion`, `prefers-contrast`/`forced-colors`, stronger `:focus-visible` outline, skip-link helper, and 44px tap targets for buttons and nav links.
