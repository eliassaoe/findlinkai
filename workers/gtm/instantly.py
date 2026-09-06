"""Instantly as the sender, on our own warmed mailboxes.

Endpoint shapes follow `api.instantly.ai/api/v2` as used by cmn-labs/autogtm's
`clients/instantly.ts`, which is the closest thing to a worked reference we have.
Instantly takes A/B variants inline, which SmartLead does not — so a sequence is
one call, not one plus a second pass per step.

Two things this module refuses to do, both deliberate:

- **It will not create a campaign with `activate=True` in one step.** Arming a
  campaign is a separate, explicit call, because there is no undo on a send.
- **It will not add a lead whose address is unverified.** The caller has already
  gated on that in `pipeline.run`; this is the second lock on the same door.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Iterable, Sequence

API_BASE = os.environ.get("INSTANTLY_API_BASE", "https://api.instantly.ai/api/v2")
TIMEOUT = 60
MAX_RETRIES = 3
NO_RETRY = (400, 401, 403, 404, 422)

# Instantly account status: 1 is active. All nine of ours read -1 on 2026-09-06
# (docs/own-gtm-agent-plan.md) — verify before trusting a send.
STATUS_ACTIVE = 1


class InstantlyError(RuntimeError):
    def __init__(self, status: int, detail: str) -> None:
        super().__init__(f"Instantly {status}: {detail[:300]}")
        self.status, self.detail = status, detail

    @property
    def retryable(self) -> bool:
        return self.status not in NO_RETRY


class Instantly:
    def __init__(self, api_key: str | None = None, opener: Any = None, sleep: Any = time.sleep):
        self.api_key = api_key or os.environ.get("INSTANTLY_API_KEY", "")
        if not self.api_key:
            raise SystemExit("INSTANTLY_API_KEY is not set.")
        self._opener, self._sleep = opener, sleep

    def request(self, method: str, path: str, body: Any = None, params: dict | None = None) -> Any:
        url = API_BASE + path
        if params:
            clean = {k: v for k, v in params.items() if v is not None}
            if clean:
                url += "?" + urllib.parse.urlencode(clean)
        payload = json.dumps(body).encode() if body is not None else None

        for attempt in range(MAX_RETRIES):
            req = urllib.request.Request(url, data=payload, method=method)
            req.add_header("Authorization", f"Bearer {self.api_key}")
            req.add_header("Accept", "application/json")
            if payload is not None:
                req.add_header("Content-Type", "application/json")
            opener = self._opener or urllib.request.urlopen
            try:
                with opener(req, timeout=TIMEOUT) as resp:
                    return json.loads(resp.read().decode() or "{}")
            except urllib.error.HTTPError as err:
                e = InstantlyError(err.code, err.read().decode(errors="replace"))
                if not e.retryable or attempt == MAX_RETRIES - 1:
                    raise e
                self._sleep(2 ** attempt)
            except urllib.error.URLError as err:
                if attempt == MAX_RETRIES - 1:
                    raise InstantlyError(0, f"network: {err.reason}")
                self._sleep(2 ** attempt)
        raise AssertionError("unreachable")

    # -- mailboxes ---------------------------------------------------------

    def accounts(self, limit: int = 100) -> list[dict[str, Any]]:
        got = self.request("GET", "/accounts", params={"limit": limit})
        return got.get("items", []) if isinstance(got, dict) else (got or [])

    def sendable_accounts(self) -> tuple[list[dict], list[dict]]:
        """(ready to send, not ready). Checks status AND warmup, not just status."""
        ready, blocked = [], []
        for a in self.accounts():
            ok = a.get("status") == STATUS_ACTIVE and a.get("stat_warmup_score", 0) >= 80
            (ready if ok else blocked).append(a)
        return ready, blocked

    def daily_capacity(self) -> int:
        """Sum of daily limits over mailboxes that can actually send.

        This is the real ceiling on a day's work — 135 across nine mailboxes at
        the last check. Read it, do not assume it.
        """
        ready, _ = self.sendable_accounts()
        return sum(int(a.get("daily_limit") or 0) for a in ready)

    # -- campaigns ---------------------------------------------------------

    @staticmethod
    def sequence(steps: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
        """[{day, subject, body, subject_b?, body_b?}] -> Instantly's shape.

        Variants go inline, which is why this is one call and not two.
        """
        out = []
        for i, step in enumerate(steps):
            variants = [{"subject": step.get("subject", ""), "body": _html(step.get("body", ""))}]
            if step.get("body_b"):
                variants.append(
                    {"subject": step.get("subject_b", step.get("subject", "")),
                     "body": _html(step["body_b"])}
                )
            out.append({"type": "email", "delay": int(step.get("day", i * 3)), "variants": variants})
        return [{"steps": out}]

    def create_campaign(
        self,
        name: str,
        steps: Sequence[dict[str, Any]],
        sending_emails: Sequence[str] = (),
        daily_limit: int = 15,
        email_gap: int = 5,
    ) -> dict[str, Any]:
        """Create PAUSED. Arming is `activate()`, a separate deliberate call."""
        body: dict[str, Any] = {
            "name": name,
            "sequences": self.sequence(steps),
            "daily_limit": daily_limit,
            "email_gap": email_gap,
            "stop_on_reply": True,
            "stop_on_auto_reply": True,
            "link_tracking": False,   # link tracking hurts placement on cold mail
            "open_tracking": False,   # so does a tracking pixel
            "text_only": True,
        }
        if sending_emails:
            body["email_list"] = list(sending_emails)
        return self.request("POST", "/campaigns", body=body)

    def add_leads(self, campaign_id: str, leads: Iterable[dict[str, Any]]) -> dict[str, Any]:
        """Add leads. Every one must carry verified=True; this raises otherwise."""
        payload = []
        for lead in leads:
            if not lead.get("verified"):
                raise ValueError(
                    f"refusing to add unverified address {lead.get('email')!r} — "
                    "sending to an unverified address is how a domain burns"
                )
            entry = {"email": lead["email"]}
            for src, dst in (
                ("first_name", "first_name"), ("last_name", "last_name"),
                ("company", "company_name"), ("linkedin_url", "linkedin"),
                ("title", "title"),
            ):
                if lead.get(src):
                    entry[dst] = lead[src]
            payload.append(entry)
        return self.request(
            "POST", "/leads/list",
            body={"campaign_id": campaign_id, "leads": payload,
                  "skip_if_in_workspace": True, "skip_if_in_campaign": True},
        )

    def activate(self, campaign_id: str) -> Any:
        return self.request("POST", f"/campaigns/{campaign_id}/activate")

    def pause(self, campaign_id: str) -> Any:
        return self.request("POST", f"/campaigns/{campaign_id}/pause")

    def analytics(self, campaign_id: str) -> dict[str, Any]:
        got = self.request("GET", "/campaigns/analytics", params={"campaign_id": campaign_id})
        row = got[0] if isinstance(got, list) and got else got
        return row if isinstance(row, dict) else {}

    # -- replies -----------------------------------------------------------

    def replies(self, campaign_id: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        """Inbound messages. This is the poll the reply loop runs on."""
        got = self.request(
            "GET", "/emails",
            params={"campaign_id": campaign_id, "limit": limit, "email_type": "received"},
        )
        return got.get("items", []) if isinstance(got, dict) else (got or [])

    def send_reply(self, reply_to_uuid: str, body: str, subject: str = "") -> Any:
        return self.request(
            "POST", "/emails/reply",
            body={"reply_to_uuid": reply_to_uuid, "subject": subject,
                  "body": {"html": _html(body)}},
        )


def _html(text: str) -> str:
    """Plain text -> the minimal HTML Instantly renders.

    Deliberately minimal: no wrapper div, no styles, no tracking. A cold email
    that looks like a newsletter in source lands like one.
    """
    if "<" in text and ">" in text:
        return text
    return text.replace("\r\n", "\n").replace("\n", "<br>")
