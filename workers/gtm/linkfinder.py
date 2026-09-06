"""LinkFinder AI as the email resolver.

The whole API is one POST with a `type` discriminator plus a status endpoint for
operations that answer async. Shapes derived from `integrations/zapier/lib/linkfinder.js`
and `integrations/catalog/operations.json`, which are authoritative in this repo.

Credit costs come from the catalog and match CLAUDE.md. Note the catalog settles
a discrepancy: `linkedin_profile_to_email` is **10 credits**, not the 1 the
LinkFinder MCP tool description claims.

Resolution order is cheapest-reliable-first, and every result carries where it
came from, because `pipeline.run` gates sending on `verified` and an unverified
address must never be able to masquerade as a resolved one.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from models import Lead

API_BASE = os.environ.get("LINKFINDER_API_BASE", "https://api.linkfinderai.com")
TIMEOUT = 60
MAX_RETRIES = 3
NO_RETRY = (400, 401, 402, 403, 404, 422)

# integrations/catalog/operations.json — authoritative, and confirms CLAUDE.md.
CREDITS = {
    "linkedin_profile_to_email": 10,
    "lead_full_name_to_email": 7,
    "lead_full_name_to_linkedin_url": 1,
}


class LinkFinderError(RuntimeError):
    def __init__(self, status: int, detail: str) -> None:
        super().__init__(f"LinkFinder {status}: {detail[:300]}")
        self.status, self.detail = status, detail

    @property
    def retryable(self) -> bool:
        return self.status not in NO_RETRY


def _is_upstream_error(result: Any) -> bool:
    """A 200 can still carry a provider failure in `result`.

    Seen in production on the Zapier app: a lookup returned an array whose only
    element was a provider permissions error. Treat that as "not found", never
    as a value.
    """
    probe = result[0] if isinstance(result, list) and result else result
    if not isinstance(probe, dict):
        return False
    return any(k.lower() in ("error", "detail", "message") for k in probe)


def _scalar(result: Any, field: str) -> str:
    if not result or _is_upstream_error(result):
        return ""
    row = result[0] if isinstance(result, list) and result else result
    if not isinstance(row, dict):
        return ""
    value = row.get(field)
    return value.strip() if isinstance(value, str) and value.strip() else ""


class LinkFinder:
    def __init__(self, api_key: str | None = None, opener: Any = None, sleep: Any = time.sleep):
        self.api_key = api_key or os.environ.get("LINKFINDER_API_KEY", "")
        if not self.api_key:
            raise SystemExit("LINKFINDER_API_KEY is not set.")
        self._opener, self._sleep = opener, sleep
        self.credits_spent = 0

    # -- transport ---------------------------------------------------------

    def _send(self, method: str, url: str, payload: bytes | None) -> dict[str, Any]:
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
            raise LinkFinderError(err.code, err.read().decode(errors="replace"))
        except urllib.error.URLError as err:
            raise LinkFinderError(0, f"network: {err.reason}")

    def _post(self, body: dict[str, Any]) -> dict[str, Any]:
        payload = json.dumps(body).encode()
        for attempt in range(MAX_RETRIES):
            try:
                return self._send("POST", API_BASE, payload)
            except LinkFinderError as err:
                if not err.retryable or attempt == MAX_RETRIES - 1:
                    raise
                self._sleep(2 ** attempt)
        raise AssertionError("unreachable")

    def run(self, op: str, input_data: str, output_field: str, max_poll: float = 45.0) -> str:
        """One enrichment. "" means looked and found nothing — a credit may still
        have been spent. A raise means the call did not complete."""
        self.credits_spent += CREDITS.get(op, 0)
        data = self._post({"type": op, "input_data": input_data})

        job_id = data.get("job_id")
        if not job_id:
            return _scalar(data.get("result"), output_field)

        poll_url = data.get("poll_url") or f"{API_BASE}/status/{job_id}"
        deadline, delay = time.time() + max_poll, 1.5
        while time.time() < deadline:
            self._sleep(delay)
            body = self._send("GET", poll_url, None)
            status = str(body.get("status", "")).lower()
            if status in ("success", "completed") or "result" in body:
                return _scalar(body.get("result"), output_field)
            if status in ("failed", "error"):
                return ""
            delay = min(delay * 1.5, 5.0)
        raise LinkFinderError(504, "timed out waiting for the job")

    # -- operations --------------------------------------------------------

    def email_from_linkedin(self, url: str) -> str:
        return self.run("linkedin_profile_to_email", url, "email")

    def email_from_name(self, name: str, company: str = "", location: str = "", title: str = "") -> str:
        # Space-joined with empties dropped — the same string app.html builds.
        parts = [p.strip() for p in (name, company, location, title) if p and p.strip()]
        return self.run("lead_full_name_to_email", " ".join(parts), "email")


def make_resolver(client: LinkFinder, allow_name_fallback: bool = True):
    """Build the `resolver` callable `pipeline.run` expects.

    Returns (email, verified). `verified` is True only for an address LinkFinder
    resolved — never for one that merely arrived with the lead.
    """

    def resolve(lead: Lead) -> tuple[str, bool]:
        if lead.linkedin_url:
            try:
                email = client.email_from_linkedin(lead.linkedin_url)
                if email:
                    return (email, True)
            except LinkFinderError as err:
                # A bad key or an empty balance must stop the batch, not quietly
                # degrade to the unverified address Explee supplied.
                if not err.retryable:
                    raise

        if allow_name_fallback and lead.full_name.strip():
            try:
                email = client.email_from_name(
                    lead.full_name, lead.company, lead.location, lead.title
                )
                if email:
                    return (email, True)
            except LinkFinderError as err:
                if not err.retryable:
                    raise

        # Fall back to whatever the search returned, explicitly unverified.
        return (lead.email, False)

    return resolve
