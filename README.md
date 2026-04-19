# Multi-Page Tech Profile Website

Black-theme portfolio website ready for GitHub Pages deployment.

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

## Deploy on GitHub Pages
1. Create a GitHub repository.
2. Push all files in this folder to the repository root.
3. Open `Settings -> Pages`.
4. Set Source to `Deploy from a branch`.
5. Select branch `main` and folder `/ (root)`.
6. Save and wait for deploy.

Your site URL format:
`https://<your-username>.github.io/<repo-name>/`

## Resume Download
- Place your resume file at `resume.pdf` in the project root.
- Download buttons are already wired on Home and Contact pages.

## Portal + Metrics
- Open `login.html` to set/login with a portal password.
- After login, use `admin.html` to add/edit/delete achievement blocks.
- Blocks render automatically on `achievements.html`.
- Visitor metrics tracked:
  - Local per-page views and last visit (browser-local)
  - Global counter via CountAPI (`https://api.countapi.xyz`)

## Firebase CMS
- Firebase project is configured as `website-9a938` in `.firebaserc`.
- The site now reads live content from Firebase Realtime Database, which works fine on GitHub Pages because the browser fetches data client-side.
- Open `admin.html`, click `Load Current Site Into CMS` to convert the current static pages into CMS JSON, then click `Publish All To Realtime DB`.
- Or seed directly from the terminal with `python3 scripts/seed_rtdb.py`.
- Deploy RTDB rules with `firebase deploy --only database`.
- Firestore rules remain in the repo if you want to keep the existing Firestore copy, but the live site no longer depends on Firestore.
- Firebase Storage must be initialized in the Firebase console before resume uploads and `storage.rules` deployment will work.

## What Is Database-Editable
- `experiencePage` plus `site_experience`: Experience page heading/intro, professional/campus section titles, cards, media, actions, and timeline participation.
- `courseworkPage`: Academic Coursework title/subtitle, schools, course groups, and Coursework Note.
- `site_projects` plus `projectsPage`: Key Projects & Technical Work heading/intro, per-project tags via `chips`, category filtering via `category`, media, actions, and timeline auto-linking.
- `site_events` plus `eventsPage`: Professional Events & Networking heading/intro and Capture The Flags & Hackathons Attended heading/intro.
- `achievementCards`, `achievementsPage`, `achievementsBlocks`: Achievements & Recognition and Future / Portal-Managed Blocks.
- `contactPage`: Interested in collaborating, links, contact methods, and profile cards.
- `theme`: site colors and page theme variables. Accessibility color overrides still take precedence in the browser session.
