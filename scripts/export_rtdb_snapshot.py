#!/usr/bin/env python3
"""Export public RTDB CMS paths into versioned JSON snapshots in the repo."""

from __future__ import annotations

import json
from pathlib import Path

import requests


RTDB_BASE = "https://website-9a938-default-rtdb.firebaseio.com"
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

PATHS = {
    "config.site": "config/site",
    "site_projects": "site_projects",
    "site_events": "site_events",
    "site_roles": "site_roles",
    "site_experience": "site_experience",
}


def fetch_json(path: str):
    response = requests.get(f"{RTDB_BASE}/{path}.json", timeout=30)
    response.raise_for_status()
    return response.json()


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> int:
    snapshot = {}
    for key, remote_path in PATHS.items():
        snapshot[key] = fetch_json(remote_path)

    write_json(DATA_DIR / "rtdb-export.json", snapshot)

    for key, payload in snapshot.items():
        write_json(DATA_DIR / "rtdb" / f"{key}.json", payload)

    manifest = {
        "paths": list(PATHS.keys()),
        "exported_files": ["data/rtdb-export.json", *[f"data/rtdb/{key}.json" for key in PATHS]],
    }
    write_json(DATA_DIR / "rtdb-manifest.json", manifest)
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
