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
