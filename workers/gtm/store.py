"""The bridge: Supabase rows in, the dataclasses run.py uses out.

Without this the console and the runner are two separate programs that happen to
agree on a schema — you edit a prompt in the UI and the agent keeps using the
JSON file. This is what makes the UI actually drive the pipeline.

Uses PostgREST over plain urllib rather than the supabase-py client, for the same
reason `explee.py` does: no dependency to install in CI, and the failure mode is
a readable HTTP error instead of a library exception three layers down.

Reads use the anon key and respect RLS. Writes here are limited to what the
runner produces — leads, messages, outcomes — never config; config belongs to the
person in the UI.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from models import Campaign, Lead, Pattern, Project, Prompt, STAGES

TIMEOUT = 30


class StoreError(RuntimeError):
    pass


def _tuple(v: Any) -> tuple:
    return tuple(v) if isinstance(v, (list, tuple)) else ()


class Store:
    def __init__(self, url: str | None = None, key: str | None = None):
        self.url = (url or os.environ.get("SUPABASE_URL", "")).rstrip("/")
        self.key = key or os.environ.get("SUPABASE_KEY", "")
        if not self.url or not self.key:
            raise SystemExit("SUPABASE_URL and SUPABASE_KEY must be set.")
        self.rest = f"{self.url}/rest/v1"

    # -- transport ---------------------------------------------------------

    def _request(self, method: str, path: str, body: Any = None, prefer: str = "") -> Any:
        req = urllib.request.Request(self.rest + path, method=method,
                                     data=json.dumps(body).encode() if body is not None else None)
        req.add_header("apikey", self.key)
        req.add_header("Authorization", f"Bearer {self.key}")
        req.add_header("Accept", "application/json")
        if body is not None:
            req.add_header("Content-Type", "application/json")
        if prefer:
            req.add_header("Prefer", prefer)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                raw = resp.read().decode()
                return json.loads(raw) if raw.strip() else []
        except urllib.error.HTTPError as err:
            raise StoreError(f"{err.code}: {err.read().decode(errors='replace')[:300]}")
        except urllib.error.URLError as err:
            raise StoreError(f"network: {err.reason}")

    def select(self, table: str, **filters: Any) -> list[dict]:
        params = {"select": filters.pop("select", "*")}
        order = filters.pop("order", None)
        limit = filters.pop("limit", None)
        for k, v in filters.items():
            params[k] = f"eq.{v}"
        if order:
            params["order"] = order
        if limit:
            params["limit"] = limit
        return self._request("GET", f"/{table}?" + urllib.parse.urlencode(params))

    def insert(self, table: str, rows: list[dict]) -> list[dict]:
        if not rows:
            return []
        return self._request("POST", f"/{table}", body=rows, prefer="return=representation")

    def update(self, table: str, patch: dict, **filters: Any) -> list[dict]:
        params = {k: f"eq.{v}" for k, v in filters.items()}
        return self._request("PATCH", f"/{table}?" + urllib.parse.urlencode(params),
                             body=patch, prefer="return=representation")

    # -- config in ---------------------------------------------------------

    def resolve_campaign(self, campaign_name: str, project_name: str = "") -> dict:
        rows = self.select("gtm_campaigns", name=campaign_name)
        if not rows:
            raise StoreError(f"no campaign named {campaign_name!r}")
        if len(rows) > 1 and not project_name:
            raise StoreError(
                f"{len(rows)} campaigns named {campaign_name!r} across projects — "
                "pass --project to disambiguate"
            )
        if project_name:
            projects = {p["id"]: p for p in self.select("gtm_projects", name=project_name)}
            rows = [r for r in rows if r["project_id"] in projects]
            if not rows:
                raise StoreError(f"no campaign {campaign_name!r} in project {project_name!r}")
        return rows[0]

    def load(self, campaign_name: str, project_name: str = "") -> tuple[Project, Campaign, dict[str, Prompt], str]:
        """Everything run.py needs. Returns (project, campaign, prompts, campaign_id)."""
        crow = self.resolve_campaign(campaign_name, project_name)
        prow = self.select("gtm_projects", id=crow["project_id"])
        if not prow:
            raise StoreError("campaign points at a project that does not exist")
        prow = prow[0]

        project = Project(
            name=prow["name"], domain=prow.get("domain") or "",
            facts=prow.get("facts") or "", booking_link=prow.get("booking_link") or "",
            cc_email=prow.get("cc_email") or "",
            sending_emails=_tuple(prow.get("sending_emails")),
            daily_cap=int(prow.get("daily_cap") or 100),
        )
        campaign = Campaign(
            name=crow["name"], kind=crow.get("kind") or "b2b",
            offer=crow.get("offer") or "", customer_problem=crow.get("customer_problem") or "",
            example_clients=_tuple(crow.get("example_clients")),
            keywords=_tuple(crow.get("keywords")),
            target_role=crow.get("target_role") or "",
            target_geography=crow.get("target_geography") or "",
            positive_criteria=_tuple(crow.get("positive_criteria")),
            negative_criteria=_tuple(crow.get("negative_criteria")),
        )

        # Head version per stage. gtm_prompts is append-only, so "current" is
        # max(version) — never the most recently touched row.
        rows = self.select("gtm_prompts", campaign_id=crow["id"], order="version.desc")
        prompts: dict[str, Prompt] = {}
        for r in rows:
            if r["stage"] in prompts:
                continue
            prompts[r["stage"]] = Prompt(
                stage=r["stage"], version=int(r["version"]),
                instructions=r.get("instructions") or "",
                language=r.get("language") or "lead",
                follow_up_every_days=int(r.get("follow_up_every_days") or 3),
                max_follow_ups=int(r.get("max_follow_ups") or 2),
            )
        for stage in STAGES:
            prompts.setdefault(stage, Prompt(stage=stage))
        return project, campaign, prompts, crow["id"]

    def patterns(self, campaign_id: str, stage: str = "") -> list[Pattern]:
        """Only patterns that earned their place — the view enforces the threshold."""
        rows = self.select("gtm_active_patterns", campaign_id=campaign_id)
        return [
            Pattern(stage=r["stage"], kind=r["kind"], pattern=r["pattern"],
                    evidence=r.get("evidence") or "", wins=int(r["wins"]), losses=int(r["losses"]))
            for r in rows
            if not stage or r["stage"] == stage
        ]

    def suppression(self) -> frozenset[str]:
        return frozenset(
            (r.get("email") or "").lower()
            for r in self.select("gtm_suppression", select="email")
        )

    # -- results out -------------------------------------------------------

    def save_drafts(self, campaign_id: str, drafted: list) -> int:
        """Persist qualified leads and their first drafts. Returns rows written."""
        written = 0
        for d in drafted:
            lead: Lead = d.lead
            rows = self.insert("gtm_leads", [{
                "campaign_id": campaign_id,
                "email": lead.email or None,
                "email_source": "linkfinder_linkedin" if lead.linkedin_url else "linkfinder_name",
                "email_verified": True,   # pipeline.run only emits verified leads
                "full_name": lead.full_name or None,
                "first_name": lead.first_name or None,
                "title": lead.title or None,
                "company": lead.company or None,
                "company_domain": lead.company_domain or None,
                "linkedin_url": lead.linkedin_url or None,
                "location": lead.location or None,
                "language": d.draft.language or None,
                "raw": lead.raw or {},
                "fit_score": d.verdict.fit_score,
                "fit_reason": d.verdict.fit_reason,
            }])
            if not rows:
                continue
            self.insert("gtm_messages", [{
                "lead_id": rows[0]["id"], "stage": "first_email", "step": 1,
                "subject": d.draft.subject, "body": d.draft.body, "language": d.draft.language,
            }])
            written += 1
        return written

    def record_reply(self, lead_email: str, body: str, received_at: str, sentiment: str) -> None:
        rows = self.select("gtm_leads", email=lead_email, select="id")
        if not rows:
            return
        lead_id = rows[0]["id"]
        self.insert("gtm_replies", [{
            "lead_id": lead_id, "body": body, "received_at": received_at,
            "sentiment": sentiment, "classified_at": "now()",
        }])
        # The row BASELINE.md exists to make someone fill in.
        patch = {"lead_id": lead_id, "replied_at": received_at}
        if sentiment == "interested":
            patch["interested_at"] = received_at
        self._request("POST", "/gtm_outcomes", body=[patch],
                      prefer="resolution=merge-duplicates,return=minimal")

    def booked_and_lost(self, campaign_id: str, stage: str = "first_email") -> tuple[list, list]:
        """(booked, not booked) outbound messages — the input to mine_patterns.

        Anchored on booked_at, never interested_at. docs/outbound-angle.md:
        571 interested, 0 meetings.
        """
        leads = self.select("gtm_leads", campaign_id=campaign_id, select="id")
        ids = {r["id"] for r in leads}
        if not ids:
            return [], []
        outcomes = {o["lead_id"]: o for o in self.select("gtm_outcomes")}
        booked_ids = {lid for lid in ids if (outcomes.get(lid) or {}).get("booked_at")}

        won, lost = [], []
        for lid in ids:
            msgs = self.select("gtm_messages", lead_id=lid, stage=stage)
            for m in msgs:
                entry = {"subject": m.get("subject") or "", "body": m.get("body") or ""}
                (won if lid in booked_ids else lost).append(entry)
        return won, lost
