# Multi-Page Tech Profile Website

Firebase Hosting + Realtime Database portfolio and admin CMS.

## Pages
- `index.html` (home, summary, competencies, certifications)
- `experience.html` (professional experience + additional campus roles)
- `coursework.html` (17-course academic coursework breakdown)
- `projects.html` (key projects and technical work)
- `timeline.html` (chronological project + achievement timeline)
- `events.html` (professional events and networking)
- `achievements.html` (awards + portal-managed future blocks)
- `contact.html` (contact and profile links)
- `login.html` (portal login)
- `admin.html` (portal editor + metrics dashboard)

## Deploy on Firebase Hosting
1. Make sure `.firebaserc` points at the correct Firebase project.
2. Deploy hosting with `firebase deploy --only hosting`.
3. Deploy Realtime Database rules with `firebase deploy --only database`.
4. Deploy Storage rules with `firebase deploy --only storage` after Storage is initialized in Firebase Console.

## Resume Download
- Place your resume file at `resume.pdf` in the project root.
- Download buttons are already wired on Home and Contact pages.

## Portal + Metrics
- Open `login.html` to set/login with a portal password.
- After login, use `admin.html` to edit the site through page-based CMS tabs.
- Visitor metrics tracked:
  - Local per-page views and last visit (browser-local)
  - Global counter via CountAPI (`https://api.countapi.xyz`)

## Firebase CMS
- Firebase project is configured as `website-9a938` in `.firebaserc`.
- The site reads live content from Firebase Realtime Database and is hosted on Firebase Hosting.
- Open `admin.html`, click `Load Current Site Into CMS` to convert the current static pages into CMS JSON, then click `Publish All To Realtime DB`.
- Or seed directly from the terminal with `python3 scripts/seed_rtdb.py`.
- Deploy RTDB rules with `firebase deploy --only database`.
- Firebase Storage must be initialized in the Firebase console before resume uploads and `storage.rules` deployment will work.

## What Is Database-Editable
- `experiencePage` plus `site_experience`: Experience page heading/intro, professional/campus section titles, cards, media, actions, and timeline participation.
- `courseworkPage`: Academic Coursework title/subtitle, schools, course groups, and Coursework Note.
- `site_projects` plus `projectsPage`: Key Projects & Technical Work heading/intro, per-project tags via `chips`, category filtering via `category`, media, actions, and timeline auto-linking.
- `site_events` plus `eventsPage`: Professional Events & Networking heading/intro and Capture The Flags & Hackathons Attended heading/intro.
- `achievementCards`, `achievementsPage`: Achievements & Recognition.
- `contactPage`: Interested in collaborating, links, contact methods, and profile cards.
- `theme`: site colors and page theme variables. Accessibility color overrides still take precedence in the browser session.
