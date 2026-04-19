#!/usr/bin/env python3
"""Seed Firebase Realtime Database CMS paths from the site's static HTML fallbacks."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import requests

from seed_firestore import (
    DEFAULT_BLOCKS,
    DEFAULT_SETTINGS,
    DEFAULT_VERIFY_LINKS,
    FIREBASE_TOOLS,
    build_config,
    build_events,
    build_experience,
    build_projects,
    build_roles,
    build_simple_page_config,
    build_timeline_index,
    parse_doc,
)


RTDB_URL = "https://website-9a938-default-rtdb.firebaseio.com"


def session() -> requests.Session:
    cfg = json.loads(Path(FIREBASE_TOOLS).read_text(encoding="utf-8"))
    token = cfg["tokens"]["access_token"]
    s = requests.Session()
    s.params = {"access_token": token}
    s.headers.update({"Content-Type": "application/json"})
    return s


def put(sess: requests.Session, path: str, payload):
    resp = sess.put(f"{RTDB_URL}/{path}.json", json=payload, timeout=60)
    resp.raise_for_status()


def keyed(items: list[dict], key: str = "slug") -> dict[str, dict]:
    return {item[key]: item for item in items}


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
    config["projectsPage"] = build_simple_page_config(docs["projects"], [
        ("heading", '//main//section[contains(@class, "panel")]//h1[contains(@class, "page-title")]'),
        ("intro", '//main//section[contains(@class, "panel")]//p[contains(@class, "subtle")]'),
    ])
    config["eventsPage"] = build_simple_page_config(docs["events"], [
        ("heading", '(//main//section[contains(@class, "panel")]//h1[contains(@class, "page-title")])[1]'),
        ("competitionsHeading", '(//main//section[contains(@class, "panel")]//h2[contains(@class, "page-title")])[1]'),
        ("competitionsIntro", '(//main//section[contains(@class, "panel")]//p[contains(@class, "subtle")])[1]'),
    ])
    config["timelinePage"] = build_simple_page_config(docs["timeline"], [
        ("heading", '//main//section[contains(@class, "panel")]//h1[contains(@class, "page-title")]'),
        ("intro", '//main//section[contains(@class, "panel")]//p[contains(@class, "subtle")]'),
    ])
    config["experiencePage"] = build_simple_page_config(docs["experience"], [
        ("heading", '//main//section[contains(@class, "panel")]//h1[contains(@class, "page-title")]'),
        ("intro", '//main//section[contains(@class, "panel")]//p[contains(@class, "subtle")]'),
        ("professionalHeading", '(//div[@id="experience-static-fallback"]//h2[contains(@class, "page-title")])[1]'),
        ("campusHeading", '(//div[@id="experience-static-fallback"]//h2[contains(@class, "page-title")])[2]'),
    ])
    config["achievementsPage"] = build_simple_page_config(docs["achievements"], [
        ("heading", '(//main//section[contains(@class, "panel")]//h1[contains(@class, "page-title")])[1]'),
        ("editableHeading", '(//main//section[contains(@class, "panel")]//h2[contains(@class, "page-title")])[1]'),
        ("editableIntro", '(//main//section[contains(@class, "panel")]//p[contains(@class, "subtle")])[1]'),
    ])
    config["achievementsBlocks"] = DEFAULT_BLOCKS
    config["verifyLinks"] = DEFAULT_VERIFY_LINKS
    config["media"] = []
    config["settings"] = DEFAULT_SETTINGS
    projects = build_projects(docs["projects"], timeline_index)
    events = build_events(docs["events"], timeline_index)
    roles = build_roles(docs["timeline"])
    experience = build_experience(docs["experience"])

    sess = session()
    put(sess, "config/site", config)
    put(sess, "site_projects", keyed(projects))
    put(sess, "site_events", keyed(events))
    put(sess, "site_roles", keyed(roles))
    put(sess, "site_experience", keyed(experience))

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
