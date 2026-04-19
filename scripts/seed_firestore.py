#!/usr/bin/env python3
"""Seed Firestore CMS documents from the site's static HTML fallbacks."""

from __future__ import annotations

import json
import os
import sys
from copy import deepcopy
from pathlib import Path

import requests
from lxml import html


ROOT = Path(__file__).resolve().parent.parent
PROJECT_ID = "website-9a938"
BASE_URL = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents"
FIREBASE_TOOLS = Path(os.path.expanduser("~/.config/configstore/firebase-tools.json"))

DEFAULT_BLOCKS = [
    {
        "title": "Future Achievement Slot",
        "subtitle": "Upcoming Competition / Award",
        "date": "Future",
        "description": "Use the portal to replace this with your next milestone, award, or certification update.",
        "tags": ["Future", "Editable", "Portal Managed"],
        "status": "Planned",
    }
]

DEFAULT_VERIFY_LINKS = [
    {
        "target": "AURA (HackUNCP26)",
        "page": "projects.html",
        "label": "Devpost (Add URL)",
        "url": "#",
        "category": "Hackathon",
    },
    {
        "target": "GUARDIAPASS (HackNC State26)",
        "page": "projects.html",
        "label": "Devpost (Add URL)",
        "url": "#",
        "category": "Hackathon",
    },
    {
        "target": "Gratitude (AfroPix26)",
        "page": "projects.html",
        "label": "Devpost / Proof (Add URL)",
        "url": "#",
        "category": "Hackathon",
    },
]

DEFAULT_SETTINGS = {
    "redPages": ["timeline.html"],
    "timelineHideProjects": False,
    "iconStylePages": {},
}


def norm_text(value: str | None) -> str:
    return " ".join((value or "").split())


def text(node, xpath: str) -> str:
    matches = node.xpath(xpath)
    if not matches:
      return ""
    first = matches[0]
    if isinstance(first, str):
        return norm_text(first)
    return norm_text(first.text_content())


def inner_html(node) -> str:
    return "".join(
        html.tostring(child, encoding="unicode")
        for child in node.iterchildren()
    ).strip()


def parse_doc(name: str):
    return html.fromstring((ROOT / name).read_text(encoding="utf-8"))


def parse_timeline_sort_ms(label: str) -> int:
    import email.utils

    raw = norm_text(label)
    if not raw:
        return 0
    cleaned = raw.split(" - ")[0].replace("Present", "").strip()
    attempts = [cleaned, f"{cleaned} 1", f"1 {cleaned}"]
    for attempt in attempts:
        try:
            parsed = email.utils.parsedate_to_datetime(attempt)
        except Exception:
            parsed = None
        if parsed is not None:
            return int(parsed.timestamp() * 1000)
    try:
        from datetime import datetime

        for fmt in ("%B %d, %Y", "%B %Y", "%Y"):
            try:
                return int(datetime.strptime(cleaned, fmt).timestamp() * 1000)
            except ValueError:
                continue
    except Exception:
        pass
    year = next((part for part in cleaned.split() if part.isdigit() and len(part) == 4), None)
    if year:
        from datetime import datetime

        return int(datetime(int(year), 1, 1).timestamp() * 1000)
    return 0


def make_slug(value: str, fallback: str) -> str:
    import re

    base = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return (base[:120] or fallback)


def top_level_paragraphs(article):
    out = []
    for child in article.iterchildren():
        if child.tag != "p":
            continue
        classes = set((child.get("class") or "").split())
        if {"meta", "date", "subtle"} & classes:
            continue
        out.append(html.tostring(child, encoding="unicode").strip())
    return out


def infer_project_category(article) -> str:
    sample = " ".join(
        [
            text(article, ".//h3"),
            text(article, './/p[contains(@class, "meta")]'),
            text(article, './/div[contains(@class, "chips")]'),
        ]
    ).lower()
    hardware_words = (
        "drone",
        "robot",
        "raspberry",
        "jetson",
        "iot",
        "doorbell",
        "hardware",
        "cluster",
        "wireless",
        "wifi",
        "sensor",
        "autonomous",
    )
    software_words = (
        "app",
        "software",
        "platform",
        "tool",
        "dashboard",
        "website",
        "studio",
        "analyzer",
        "detection",
        "security",
        "java",
        "ai",
    )
    has_hardware = any(word in sample for word in hardware_words)
    has_software = any(word in sample for word in software_words)
    if has_hardware and has_software:
        return "hybrid"
    if has_hardware:
        return "hardware"
    return "software"


def build_timeline_index(doc):
    out = {"project": {}, "event": {}, "role": {}}
    for item in doc.xpath('//div[@id="timeline-static-fallback"]/article[contains(@class, "timeline-item")]'):
        href = text(item, './/a[contains(@class, "timeline-title-link")]/@href')
        slug = href.split("#", 1)[1] if "#" in href else ""
        if not slug:
            continue
        timeline_date = text(item, './/p[contains(@class, "timeline-date")]')
        payload = {
            "timelineEnabled": True,
            "timelineDateLabel": timeline_date,
            "timelineSortMs": parse_timeline_sort_ms(timeline_date),
            "summaryHtml": f"<p>{text(item, './p[last()]')}</p>" if text(item, "./p[last()]") else "",
        }
        if "role-item" in (item.get("class") or ""):
            out["role"][slug] = payload
        elif "events.html#" in href:
            out["event"][slug] = payload
        else:
            out["project"][slug] = payload
    return out


def build_projects(doc, timeline_index):
    items = []
    for index, article in enumerate(doc.xpath('//div[@id="projects-static-fallback"]/article[contains(@class, "card")]')):
        slug = article.get("id") or f"project-{index + 1}"
        paragraphs = top_level_paragraphs(article)
        details = article.xpath("./details")
        detail_html = ""
        if details:
            clone = deepcopy(details[0])
            for summary in clone.xpath("./summary"):
                summary.getparent().remove(summary)
            detail_html = inner_html(clone)
        elif len(paragraphs) > 1:
            detail_html = "".join(paragraphs[1:])

        item = {
            "slug": slug,
            "title": text(article, ".//h3"),
            "meta": text(article, './/p[contains(@class, "meta")]'),
            "dateLine": text(article, './/p[contains(@class, "date")]'),
            "summaryHtml": paragraphs[0] if paragraphs else "",
            "detailHtml": detail_html,
            "chips": [norm_text(chip.text_content()) for chip in article.xpath('./div[contains(@class, "chips")]/span')],
            "category": infer_project_category(article),
            "orderIndex": 1000 - index,
        }
        item.update(timeline_index["project"].get(slug, {}))
        items.append(item)
    return items


def build_events(doc, timeline_index):
    items = []
    sections = doc.xpath('//div[@id="events-static-fallback"]/section[contains(@class, "stack")]')
    for section_index, section in enumerate(sections):
        bucket = "professional" if section_index == 0 else "competitions"
        for index, article in enumerate(section.xpath('.//article[contains(@class, "card")]')):
            slug = article.get("id") or make_slug(text(article, ".//h3"), f"event-{section_index + 1}-{index + 1}")
            paragraphs = top_level_paragraphs(article)
            details = article.xpath("./details")
            detail_html = ""
            if details:
                clone = deepcopy(details[0])
                for summary in clone.xpath("./summary"):
                    summary.getparent().remove(summary)
                detail_html = inner_html(clone)
            elif len(paragraphs) > 1:
                detail_html = "".join(paragraphs[1:])

            item = {
                "slug": slug,
                "title": text(article, ".//h3"),
                "meta": text(article, './/p[contains(@class, "meta")]'),
                "dateLine": text(article, './/p[contains(@class, "date")]'),
                "summaryHtml": paragraphs[0] if paragraphs else "",
                "detailHtml": detail_html,
                "chips": [norm_text(chip.text_content()) for chip in article.xpath('./div[contains(@class, "chips")]/span')],
                "bucket": bucket,
                "orderIndex": 1000 - section_index * 100 - index,
            }
            item.update(timeline_index["event"].get(slug, {}))
            items.append(item)
    return items


def build_roles(doc):
    items = []
    for index, article in enumerate(doc.xpath('//div[@id="timeline-static-fallback"]/article[contains(@class, "role-item")]')):
        href = text(article, './/a[contains(@class, "timeline-title-link")]/@href')
        slug = href.split("#", 1)[1] if "#" in href else make_slug(text(article, ".//h3"), f"role-{index + 1}")
        timeline_date = text(article, './/p[contains(@class, "timeline-date")]')
        items.append(
            {
                "slug": slug,
                "title": text(article, ".//h3"),
                "summaryHtml": f"<p>{text(article, './p[last()]')}</p>" if text(article, "./p[last()]") else "",
                "timelineEnabled": True,
                "timelineDateLabel": timeline_date,
                "timelineSortMs": parse_timeline_sort_ms(timeline_date),
            }
        )
    return items


def build_experience(doc):
    items = []
    sections = doc.xpath('//div[@id="experience-static-fallback"]/section[contains(@class, "section")]')
    for section_index, section in enumerate(sections):
        heading = text(section, './/h2[contains(@class, "page-title")]').lower()
        section_name = "campus" if "campus" in heading else "professional"
        for index, article in enumerate(section.xpath('.//article[contains(@class, "card")]')):
            items.append(
                {
                    "slug": article.get("id") or make_slug(text(article, ".//h3"), f"experience-{section_index + 1}-{index + 1}"),
                    "title": text(article, ".//h3"),
                    "meta": text(article, './/p[contains(@class, "meta")]'),
                    "dateLine": text(article, './/p[contains(@class, "date")]'),
                    "bullets": [norm_text(li.text_content()) for li in article.xpath(".//li")],
                    "chips": [norm_text(chip.text_content()) for chip in article.xpath('.//div[contains(@class, "chips")]/span')],
                    "section": section_name,
                    "orderIndex": 1000 - section_index * 100 - index,
                }
            )
    return items


def children_html_without_heading(section, heading_xpath: str) -> str:
    parts = []
    for child in section.iterchildren():
        if child in section.xpath(heading_xpath):
            continue
        parts.append(html.tostring(child, encoding="unicode"))
    return "".join(parts).strip()


def build_config(index_doc, contact_doc, coursework_doc, achievements_doc):
    hero = index_doc.get_element_by_id("home-hero-static")
    summary = index_doc.get_element_by_id("home-summary")
    contact_panel = contact_doc.xpath('//div[@id="contact-static-fallback"]/section[contains(@class, "panel")]')[0]
    coursework_panels = coursework_doc.xpath('//div[@id="coursework-static-fallback"]/section[contains(@class, "panel")]')
    coursework_cards = coursework_doc.xpath('//div[@id="coursework-static-fallback"]//section[contains(@class, "grid-2")]//article[contains(@class, "card")]')

    return {
        "resumeUrl": "./resume.pdf",
        "homeHero": {
            "eyebrow": text(hero, './/p[contains(@class, "eyebrow")]'),
            "titleHtml": html.tostring(hero.xpath(".//h1")[0], encoding="unicode").strip(),
            "lead": text(hero, './/p[contains(@class, "lead")]'),
            "actionsHtml": inner_html(hero.xpath('.//div[contains(@class, "actions")]')[0]),
        },
        "homeSummaryHtml": children_html_without_heading(summary, './/h2[contains(@class, "page-title")]'),
        "competencies": [
            {
                "kicker": text(item, './/p[contains(@class, "kicker")]'),
                "subtle": text(item, './/p[contains(@class, "subtle")]'),
            }
            for item in index_doc.xpath('//div[@id="competencies-static"]/div')
        ],
        "certifications": {
            "completed": [
                {"text": norm_text(node.text_content())}
                for node in index_doc.xpath('(//div[@id="certifications-static"]//article[contains(@class, "card")])[1]//span')
            ],
            "inProgress": [
                {"text": norm_text(node.text_content())}
                for node in index_doc.xpath('(//div[@id="certifications-static"]//article[contains(@class, "card")])[2]//span')
            ],
        },
        "quickHighlights": [
            {
                "title": text(card, ".//h3"),
                "body": text(card, ".//p"),
            }
            for card in index_doc.xpath('//div[@id="highlights-static"]/div[contains(@class, "card")]')
        ],
        "contactPage": {
            "heading": text(contact_panel, './/h1[contains(@class, "page-title")]'),
            "introHtml": "".join(
                html.tostring(p, encoding="unicode")
                for p in contact_panel.xpath('./p[not(contains(@class, "subtle"))]')
            ).strip(),
            "actions": [
                {
                    "label": norm_text(a.text_content()),
                    "href": a.get("href", "#"),
                    "variant": "primary" if "primary" in (a.get("class") or "") else "ghost",
                    "external": a.get("target") == "_blank",
                }
                for a in contact_panel.xpath('.//div[contains(@class, "actions")]/a')
            ],
            "cards": [
                {
                    "title": text(card, ".//h3"),
                    "bodyHtml": children_html_without_heading(card, ".//h3"),
                }
                for card in contact_doc.xpath('//div[@id="contact-static-fallback"]//section[contains(@class, "grid-2")]//article[contains(@class, "card")]')
            ],
        },
        "courseworkPage": {
            "panelTitle": text(coursework_panels[0], './/h1[contains(@class, "page-title")]'),
            "panelSubtitle": text(coursework_panels[0], './/p[contains(@class, "subtle")]'),
            "categories": [
                {
                    "title": text(card, ".//h3"),
                    "items": [norm_text(li.text_content()) for li in card.xpath(".//li")],
                }
                for card in coursework_cards
            ],
            "noteHtml": children_html_without_heading(coursework_panels[-1], './/h2[contains(@class, "page-title")]'),
        },
        "achievementCards": [
            {
                "title": text(card, ".//h3"),
                "meta": text(card, './/p[contains(@class, "meta")]'),
                "bodyHtml": "".join(
                    html.tostring(child, encoding="unicode")
                    for child in card.iterchildren()
                    if child.tag not in {"h3"} and "meta" not in (child.get("class") or "")
                ).strip(),
            }
            for card in achievements_doc.xpath('//section[@id="achievements-static-grid"]/article[contains(@class, "card")]')
        ],
        "achievementsBlocks": DEFAULT_BLOCKS,
        "verifyLinks": DEFAULT_VERIFY_LINKS,
        "media": [],
        "settings": DEFAULT_SETTINGS,
    }


def build_simple_page_config(doc, selectors):
    out = {}
    for key, xpath in selectors:
        value = text(doc, xpath)
        if value:
            out[key] = value
    return out


def firestore_value(value):
    if value is None:
        return {"nullValue": None}
    if isinstance(value, bool):
        return {"booleanValue": value}
    if isinstance(value, int):
        return {"integerValue": str(value)}
    if isinstance(value, float):
        return {"doubleValue": value}
    if isinstance(value, str):
        return {"stringValue": value}
    if isinstance(value, list):
        values = [firestore_value(item) for item in value]
        return {"arrayValue": {"values": values}} if values else {"arrayValue": {}}
    if isinstance(value, dict):
        fields = {key: firestore_value(item) for key, item in value.items() if item is not None}
        return {"mapValue": {"fields": fields}} if fields else {"mapValue": {}}
    raise TypeError(f"Unsupported value type: {type(value)!r}")


def session() -> requests.Session:
    cfg = json.loads(FIREBASE_TOOLS.read_text(encoding="utf-8"))
    token = cfg["tokens"]["access_token"]
    s = requests.Session()
    s.headers.update(
        {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
    )
    return s


def list_documents(sess: requests.Session, collection: str):
    resp = sess.get(f"{BASE_URL}/{collection}", params={"pageSize": 500}, timeout=60)
    if resp.status_code == 404:
        return []
    resp.raise_for_status()
    return resp.json().get("documents", [])


def delete_collection(sess: requests.Session, collection: str):
    for doc in list_documents(sess, collection):
        name = doc["name"].split("/documents/", 1)[1]
        resp = sess.delete(f"{BASE_URL}/{name}", timeout=60)
        resp.raise_for_status()


def write_document(sess: requests.Session, path: str, payload: dict):
    body = {"fields": {key: firestore_value(value) for key, value in payload.items() if value is not None}}
    resp = sess.patch(f"{BASE_URL}/{path}", json=body, timeout=60)
    resp.raise_for_status()


def main() -> int:
    docs = {
        "index": parse_doc("index.html"),
        "projects": parse_doc("projects.html"),
        "events": parse_doc("events.html"),
        "experience": parse_doc("experience.html"),
        "timeline": parse_doc("timeline.html"),
        "contact": parse_doc("contact.html"),
        "coursework": parse_doc("coursework.html"),
        "achievements": parse_doc("achievements.html"),
    }
    timeline_index = build_timeline_index(docs["timeline"])
    config = build_config(docs["index"], docs["contact"], docs["coursework"], docs["achievements"])
    projects = build_projects(docs["projects"], timeline_index)
    events = build_events(docs["events"], timeline_index)
    roles = build_roles(docs["timeline"])
    experience = build_experience(docs["experience"])

    sess = session()
    write_document(sess, "config/site", config)
    for collection in ("site_projects", "site_events", "site_roles", "site_experience"):
        delete_collection(sess, collection)

    for item in projects:
        write_document(sess, f"site_projects/{item['slug']}", item)
    for item in events:
        write_document(sess, f"site_events/{item['slug']}", item)
    for item in roles:
        write_document(sess, f"site_roles/{item['slug']}", item)
    for item in experience:
        write_document(sess, f"site_experience/{item['slug']}", item)

    print(
        json.dumps(
            {
                "config": "config/site",
                "site_projects": len(projects),
                "site_events": len(events),
                "site_roles": len(roles),
                "site_experience": len(experience),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
