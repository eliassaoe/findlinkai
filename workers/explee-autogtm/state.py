#!/usr/bin/env python3
"""The one file every task writes into, and the report page reads from.

    reports/state.json
      balance      credits, from the last run that checked
      runs         the last 40 runs: when, which task, dry or armed, one-line outcome
      followups    the last recover.py run: every lead, what they said, what happened
      measure      the last sequence.py measure: replies by step, per campaign
      prequalify   the last prequalify.py run: plan, counts, the campaign it created

Nothing here talks to the network. Every write is a whole-section replace, so
a task never has to know what the others left behind.
"""

import datetime as dt
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
STATE = HERE / "reports" / "state.json"
MAX_RUNS = 40


def load(path=None):
    path = path or STATE
    if not path.exists():
        return {"runs": []}
    try:
        data = json.loads(path.read_text())
    except ValueError:
        return {"runs": []}
    data.setdefault("runs", [])
    return data


def save(data, path=STATE):
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False, default=str) + "\n")


def stamp(now=None):
    return (now or dt.datetime.now(dt.timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ")


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", str(name or "project").lower()).strip("-") or "project"


def record(task, outcome, applied, section=None, payload=None, balance=None, now=None,
           path=None, project=None):
    """Append a run line and replace one section. Returns the whole state.

    With `project`, the section holds one entry per project (keyed by its slug)
    instead of one entry overall - a run over several customer projects must not
    leave only the last one on the page.
    """
    path = path or STATE
    data = load(path)
    data["runs"] = ([{"at": stamp(now), "task": task, "applied": bool(applied),
                      "outcome": ("{}: {}".format(project, outcome) if project else outcome)}]
                    + data["runs"])[:MAX_RUNS]
    if section:
        entry = dict(payload or {}, at=stamp(now), applied=bool(applied))
        if project:
            current = data.get(section)
            if not isinstance(current, dict) or "rows" in current or "campaigns" in current:
                current = {}                      # a pre-project single entry: start over
            current[slug(project)] = dict(entry, project=project)
            data[section] = current
        else:
            data[section] = entry
    if balance is not None:
        data["balance"] = balance
        data["balance_at"] = stamp(now)
    save(data, path)
    return data
