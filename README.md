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
