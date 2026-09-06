"""Explee as a lead-search API, with no Explee sending.

Explee is the cheapest lead in the eight sources reviewed in
`workers/explee-autogtm/SOURCES.md` (~$0.025 vs Pharow's ~EUR 0.18), and its
`definition` field takes plain English. We keep it for discovery and drop its
campaign product, because `SENDING.md` records Explee confirming that sending
from our own mailboxes "isn't live" — so staying on their sender means staying
on the shared pool that produced a 1.05% reply rate.

Conventions match `workers/explee-autogtm/explee.py`, deliberately: `X-API-Key`,
retries with backoff, and `first_of` rather than `payload["field"]` — the search
endpoints' response field names are not published, so every read tries the
plausible spellings and raises a ShapeError naming what it wanted when none hit.

NO CALL IN THIS FILE HAS REACHED THE REAL API. Same standing caveat as the
explee-autogtm directory: api.explee.com is blocked from the sandbox. Before the
first real run, print one raw response per endpoint and fix the key lists:

    python3 workers/explee-autogtm/explee.py POST /public/api/v1/search/nl-to-filters
    python3 workers/explee-autogtm/explee.py POST /public/api/v1/search/people
"""

from __future__ import annotations

import os
import sys
from typing import Any, Sequence

sys.path.insert(
    0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "explee-autogtm")
)

from explee import Explee, ShapeError, first_of  # noqa: E402  (re-exported)

from models import Campaign, Lead  # noqa: E402

__all__ = ["LeadSearch", "ShapeError", "first_of", "campaign_to_definition"]

# Prices from SOURCES.md, for the cost gate. Explee bills 1 credit per person
# and 1.5 when it also returns an email.
CREDITS_PER_PERSON = 1.0
CREDITS_PER_PERSON_WITH_EMAIL = 1.5


def campaign_to_definition(campaign: Campaign) -> str:
    """Turn our campaign config into the plain-English `definition` Explee takes.

    Explee's natural-language search is the good half of their product; this just
    renders the fields the UI already collects into it, so the operator never
    writes the query twice.
    """
    parts: list[str] = []
    if campaign.target_role:
        parts.append(campaign.target_role)
    if campaign.keywords:
        parts.append("at " + ", ".join(campaign.keywords))
    elif campaign.customer_problem:
        parts.append(f"at companies where {campaign.customer_problem}")
    if campaign.target_geography:
        parts.append(f"in {campaign.target_geography}")
    if campaign.positive_criteria:
        parts.append("who " + ", ".join(campaign.positive_criteria))
    if campaign.negative_criteria:
        parts.append("excluding " + ", ".join(campaign.negative_criteria))
    return " ".join(parts).strip()


class LeadSearch:
    """The three Explee endpoints we use. Nothing about campaigns or sending."""

    def __init__(self, client: Explee | None = None, **kw: Any) -> None:
        self.api = client or Explee(**kw)

    # -- cost gate ---------------------------------------------------------

    def balance(self) -> float:
        """Explee 402s EVERY request, free-tier included, at or below zero.

        BASELINE.md recorded the balance at -$46.32, which is why nothing in
        explee-autogtm could run. Check it before a batch, not after.
        """
        return self.api.balance()

    def affordable(self, wanted: int, with_email: bool = True) -> tuple[bool, float]:
        """(can we run this batch, estimated credit cost)."""
        rate = CREDITS_PER_PERSON_WITH_EMAIL if with_email else CREDITS_PER_PERSON
        cost = wanted * rate
        return self.balance() >= cost, cost

    # -- search ------------------------------------------------------------

    def filters_from_text(self, definition: str) -> dict[str, Any]:
        """Plain English -> Explee's filter shape. Free; no credits."""
        got = self.api.request(
            "POST", "/public/api/v1/search/nl-to-filters", body={"definition": definition}
        )
        return first_of(got, "filters", "filter", "result", default={})

    def people(
        self, filters: dict[str, Any], limit: int = 50, with_email: bool = True
    ) -> list[dict[str, Any]]:
        got = self.api.request(
            "POST",
            "/public/api/v1/search/people",
            body={"filters": filters, "limit": limit, "include_email": with_email},
        )
        return first_of(got, "people", "results", "items", default=[])

    def people_by_domains(
        self, domains: Sequence[str], role: str = "", limit_per_domain: int = 1
    ) -> list[dict[str, Any]]:
        """The buyer at each of a list of companies — for lists sourced elsewhere."""
        got = self.api.request(
            "POST",
            "/public/api/v1/search/people-by-domains",
            body={
                "domains": list(domains),
                "role": role or None,
                "limit_per_domain": limit_per_domain,
            },
        )
        return first_of(got, "people", "results", "items", default=[])

    # -- mapping -----------------------------------------------------------

    @staticmethod
    def to_lead(row: dict[str, Any]) -> Lead:
        """One Explee row -> our Lead.

        Every field is optional with a default: a missing title must produce a
        thinner email, never a crash mid-batch. `raw` keeps the whole row so the
        qualifier can read fields this mapping does not know about — which is
        also how we find out what those fields are called.
        """
        full = str(first_of(row, "full_name", "name", default="")).strip()
        first = str(first_of(row, "first_name", "firstname", default="")).strip()
        if not first and full:
            first = full.split(" ")[0]
        return Lead(
            email=str(first_of(row, "email", "email_address", default="")).strip(),
            full_name=full,
            first_name=first,
            title=str(first_of(row, "title", "job_title", "position", default="")).strip(),
            company=str(first_of(row, "company", "company_name", "organization", default="")).strip(),
            company_domain=str(
                first_of(row, "company_domain", "domain", "website", default="")
            ).strip(),
            linkedin_url=str(
                first_of(row, "linkedin_url", "linkedin", "linkedin_profile", default="")
            ).strip(),
            location=str(first_of(row, "location", "city", "country", default="")).strip(),
            language=str(first_of(row, "language", "lang", default="")).strip(),
            raw=row,
        )

    def search(
        self, campaign: Campaign, limit: int = 50, with_email: bool = True
    ) -> list[Lead]:
        """Campaign config -> qualified-shaped Leads. Costs credits."""
        definition = campaign_to_definition(campaign)
        if not definition:
            raise ValueError(
                "campaign has no targeting fields set — refusing to run an "
                "unbounded search that would spend credits on everyone"
            )
        filters = self.filters_from_text(definition)
        rows = self.people(filters, limit=limit, with_email=with_email)
        return [self.to_lead(r) for r in rows]
