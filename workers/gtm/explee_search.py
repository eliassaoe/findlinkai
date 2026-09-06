"""Explee as a lead-search API, with none of its sending.

Written against the published Explee Public API v1.0.0. Where the docs give an
exact field name it is used directly; where they describe a response without
naming its keys, the read goes through `first_of` so a mismatch raises a
ShapeError naming what it wanted instead of silently returning nothing. The
sandbox cannot reach api.explee.com, so nothing here has been run — print one
raw response per endpoint before the first real batch.

We keep Explee for discovery and drop its campaign product, because SENDING.md
records Explee confirming that sending from our own mailboxes "isn't live", and
staying on their sender means staying on the shared pool behind the 1.05% reply
rate in BASELINE.md.

## Pricing, corrected

The figures in SOURCES.md (~$0.025/lead) predate the published API and are wrong
in a way that matters. Actual, at 1 credit = $0.01:

    people search        1.0 credit/person   FIRST 100 RESULTS FREE
    + AI criteria       +0.1 credit/person/criterion, also free in the first 100
    companies search     0.5 credit/company  first 100 free
    email, basic         1.5 credits (~50% hit)   CHARGED ONLY WHEN FOUND
    email, premium       5.0 credits (~78% hit)   CHARGED ONLY WHEN FOUND
    find-and-enrich      search FREE; you pay only for emails actually found

`find_and_enrich` is the endpoint that matters: it searches for nothing and
charges only for the addresses it resolves. A 500-lead run that finds 390 emails
on premium costs 390 x 5 = 1,950 credits = $19.50, and the search itself is free.

Two quotas to respect: a positive balance is required for EVERY request, free
results included (402 otherwise), and entirely-free requests are rate-limited by
plan (free 500/day, starter 2000/day, and so on) with a 429 beyond.
"""

from __future__ import annotations

import os
import sys
import time
from typing import Any, Sequence

sys.path.insert(
    0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "explee-autogtm")
)

from explee import Explee, ShapeError, first_of  # noqa: E402  (re-exported)

from models import Campaign, Lead  # noqa: E402

__all__ = ["LeadSearch", "ShapeError", "first_of", "CREDIT_USD", "EMAIL_PRESETS"]

CREDIT_USD = 0.01

# preset -> (credits per found email, documented hit rate)
EMAIL_PRESETS = {"basic": (1.5, 0.50), "premium": (5.0, 0.78)}

FREE_RESULTS = 100          # first 100 search results cost nothing
CREDITS_PER_PERSON = 1.0
CREDITS_PER_CRITERION = 0.1


class LeadSearch:
    """Discovery and email enrichment. Nothing about campaigns or sending."""

    def __init__(self, client: Explee | None = None, **kw: Any) -> None:
        self.api = client or Explee(**kw)

    # -- cost gate ---------------------------------------------------------

    def balance(self) -> float:
        """Net credits. Can be negative — the org carries postpaid AutoGTM debt.

        Every request needs a POSITIVE balance, free-tier requests included, so
        this is the first thing to check and the reason nothing in
        explee-autogtm could run at -$46.32 (BASELINE.md).
        """
        return float(first_of(self.api.request("GET", "/public/api/v1/billing/balance"),
                              "remain", "balance"))

    @staticmethod
    def estimate(people: int, criteria: int = 0, preset: str = "premium") -> dict[str, float]:
        """What a run costs, honouring the free-results zone.

        Search is what you pay for per head; emails are charged only when found,
        so the email line is an expectation, not a ceiling.
        """
        billable = max(0, people - FREE_RESULTS)
        search = billable * (CREDITS_PER_PERSON + CREDITS_PER_CRITERION * criteria)
        per_email, hit = EMAIL_PRESETS[preset]
        emails = people * hit * per_email
        return {
            "search_credits": round(search, 1),
            "expected_email_credits": round(emails, 1),
            "total_credits": round(search + emails, 1),
            "total_usd": round((search + emails) * CREDIT_USD, 2),
            "expected_emails": int(people * hit),
        }

    # -- search ------------------------------------------------------------

    def filters_from_text(self, query: str) -> dict[str, Any]:
        """Plain English -> {companies_filters, people_filters, focus}. Free.

        The request field name is not given in the published docs; `query` is
        sent and `q` retried once on a 422 rather than guessing silently.
        """
        path = "/public/api/v1/search/nl-to-filters"
        try:
            got = self.api.request("POST", path, body={"query": query})
        except Exception as err:
            if getattr(err, "status", None) != 422:
                raise
            got = self.api.request("POST", path, body={"q": query})
        return {
            "companies_filters": first_of(got, "companies_filters", default={}),
            "people_filters": first_of(got, "people_filters", default={}),
            "focus": first_of(got, "focus", default="people"),
        }

    def people(
        self,
        job_titles: Sequence[str],
        definition: str = "",
        criteria: Sequence[str] = (),
        limit: int = 100,
        exclude_lists: Sequence[str] = (),
        extra_people_filters: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """People at companies matching a definition.

        `criteria` is Explee's own AI scoring: each person comes back scored 0-5
        with reasoning per criterion, at +0.1 credit each beyond the free 100.
        That is the cheap way to enforce the campaign's criteria — far cheaper
        than an LLM call per lead — so pass them here and let the qualifier
        spend its budget on finding something to say instead.
        """
        people_filters: dict[str, Any] = {"job_titles": list(job_titles)}
        if criteria:
            people_filters["criteria"] = list(criteria)
        if extra_people_filters:
            people_filters.update(extra_people_filters)

        body: dict[str, Any] = {"people_filters": people_filters, "limit": limit}
        if definition:
            body["company_filters"] = {"definition": definition}
        if exclude_lists:
            body["exclude_lists"] = list(exclude_lists)

        got = self.api.request("POST", "/public/api/v1/search/people", body=body)
        return first_of(got, "people", "results", "items", default=[])

    def people_by_domains(
        self,
        domains: Sequence[str],
        job_titles: Sequence[str],
        people_per_company: int = 1,
        exclude_lists: Sequence[str] = (),
    ) -> list[dict[str, Any]]:
        """The buyer at each of a list of companies. 1 credit per person returned.

        Job titles match semantically — "Head of Sales" also hits "VP Sales" and
        "Sales Director" — so a short list beats an exhaustive one. Max 1000
        domains and 20 job titles per request.
        """
        if len(domains) > 1000:
            raise ValueError("Explee caps this at 1000 domains per request")
        if len(job_titles) > 20:
            raise ValueError("Explee caps this at 20 job titles per request")
        body: dict[str, Any] = {
            "domains": list(domains),
            "job_titles": list(job_titles),
            "people_per_company": people_per_company,
        }
        if exclude_lists:
            body["exclude_lists"] = list(exclude_lists)
        got = self.api.request("POST", "/public/api/v1/search/people-by-domains", body=body)
        return first_of(got, "people", "results", "items", default=[])

    # -- find and enrich (the one that matters) ----------------------------

    def find_and_enrich(
        self,
        job_titles: Sequence[str],
        definition: str = "",
        criteria: Sequence[str] = (),
        max_contacts: int = 100,
        preset: str = "premium",
        exclude_lists: Sequence[str] = (),
        poll_every: float = 5.0,
        timeout: float = 900.0,
        on_progress: Any = None,
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        """Search and resolve emails in one async job. Returns (contacts, meta).

        The search half is free and only found emails are charged, so this is
        strictly cheaper than searching and enriching separately. Worst-case
        credits are held up front, which is why a thin balance 402s here even
        though the eventual charge would have fit.

        Only contacts WITH an email come back. `meta.next_cursor` pages beyond
        `max_contacts` (Explee caps it at 500 per call).
        """
        if max_contacts > 500:
            raise ValueError("Explee caps max_contacts at 500 per call; page with next_cursor")

        people_filters: dict[str, Any] = {"job_titles": list(job_titles)}
        if criteria:
            people_filters["criteria"] = list(criteria)
        body: dict[str, Any] = {
            "people_filters": people_filters,
            "max_contacts": max_contacts,
            "preset": preset,
        }
        if definition:
            body["company_filters"] = {"definition": definition}
        if exclude_lists:
            body["exclude_lists"] = list(exclude_lists)

        started = self.api.request("POST", "/public/api/v1/find-and-enrich", body=body)
        task_id = first_of(started, "task_id", "id")

        deadline = time.time() + timeout
        while time.time() < deadline:
            got = self.api.request("GET", f"/public/api/v1/find-and-enrich/{task_id}")
            meta = first_of(got, "meta", default={})
            status = str(first_of(meta, "status", default="pending")).lower()
            if status == "completed":
                return (first_of(got, "contacts", default=[]) or []), meta
            if status == "failed":
                raise RuntimeError(f"find-and-enrich failed: {first_of(meta, 'error', default='?')}")
            if on_progress:
                on_progress(first_of(meta, "progress", default={}))
            time.sleep(poll_every)
        raise TimeoutError(f"find-and-enrich {task_id} still running after {timeout}s")

    # -- deduplication -----------------------------------------------------

    def dedup_list(self, name: str, people: Sequence[dict[str, Any]]) -> str:
        """Register people we already own. Returns the list id for `exclude_lists`.

        Cheaper and more reliable than filtering after the fact: a matched person
        is neither returned nor charged. Lists are immutable — make one per batch
        and pass every id.
        """
        got = self.api.request(
            "POST", "/public/api/v1/dedup/people", body={"name": name, "people": list(people)}
        )
        return str(first_of(got, "id", "list_id"))

    # -- mapping -----------------------------------------------------------

    @staticmethod
    def to_lead(row: dict[str, Any]) -> Lead:
        """One Explee row -> our Lead. Every field optional: a missing title must
        produce a thinner email, never a crash mid-batch. `raw` keeps the whole
        row, including Explee's `criteria` scores, so the qualifier can read them.
        """
        full = str(first_of(row, "full_name", "name", default="")).strip()
        first = str(first_of(row, "first_name", "firstname", default="")).strip()
        if not first and full:
            first = full.split(" ")[0]
        return Lead(
            email=str(first_of(row, "email", "email_address", default="")).strip(),
            full_name=full,
            first_name=first,
            title=str(first_of(row, "job_title", "title", "position", default="")).strip(),
            company=str(first_of(row, "company_name", "company", "organization", default="")).strip(),
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

    # -- campaign config -> a search --------------------------------------

    @staticmethod
    def job_titles(campaign: Campaign) -> list[str]:
        """Split the campaign's target role into the list Explee wants."""
        raw = campaign.target_role.replace(" or ", ",").replace("/", ",")
        return [t.strip() for t in raw.split(",") if t.strip()][:20]

    @staticmethod
    def subject(campaign: Campaign) -> str:
        """What KIND of company, in plain English — the part that bounds the search.

        Separate from `definition` because the geography alone does not bound
        anything: "in France" plus a job title is every director in the country.
        """
        if campaign.keywords:
            return ", ".join(campaign.keywords)
        if campaign.customer_problem:
            return campaign.customer_problem
        return campaign.offer.strip()

    @staticmethod
    def definition(campaign: Campaign) -> str:
        """The company `definition` — plain English, which is Explee's good half."""
        parts = [LeadSearch.subject(campaign)]
        if campaign.target_geography:
            parts.append(f"in {campaign.target_geography}")
        return " ".join(p for p in parts if p).strip()

    @staticmethod
    def criteria(campaign: Campaign) -> list[str]:
        """Campaign criteria as Explee AI-scoring criteria.

        Negatives are phrased as their absence, because Explee scores rather than
        filters — a low score on "is NOT purely subsidised" is the signal.
        """
        out = list(campaign.positive_criteria)
        out += [f"is NOT: {c}" for c in campaign.negative_criteria]
        return out[:5]

    def search(
        self, campaign: Campaign, limit: int = 100, use_criteria: bool = True,
        exclude_lists: Sequence[str] = (),
    ) -> list[Lead]:
        """Campaign config -> Leads. Search only; no emails, no credits under 100."""
        titles = self.job_titles(campaign)
        if not titles:
            raise ValueError(
                "campaign has no target_role — refusing to run an unbounded search"
            )
        if not self.subject(campaign):
            # A geography is not a bound. Without keywords, a customer problem or
            # an offer, "Dirigeant in France" is every director in the country —
            # a search that would burn credits and return nothing usable.
            raise ValueError(
                "campaign has no keywords, customer_problem or offer, so the search "
                "would be bounded only by job title and geography. Set at least one."
            )
        rows = self.people(
            titles,
            definition=self.definition(campaign),
            criteria=self.criteria(campaign) if use_criteria else (),
            limit=limit,
            exclude_lists=exclude_lists,
        )
        return [self.to_lead(r) for r in rows]


    # -- single email enrichment, as a pipeline resolver -------------------

    def email(
        self, first_name: str, last_name: str, company_domain: str, preset: str = "premium"
    ) -> str:
        """One email by name + domain. Charged only when found.

        basic  1.5 credits (~50% hit) · premium 5.0 credits (~78% hit)
        """
        if preset not in EMAIL_PRESETS:
            raise ValueError(f"preset must be one of {sorted(EMAIL_PRESETS)}")
        got = self.api.request(
            "POST", "/public/api/v1/enrich/email",
            body={
                "first_name": first_name, "last_name": last_name,
                "company_domain": company_domain, "preset": preset,
            },
        )
        value = first_of(got, "email", default="") or ""
        return value.strip() if isinstance(value, str) else ""


def make_resolver(search: LeadSearch, preset: str = "premium"):
    """Explee's own enrichment as a `pipeline.run` resolver.

    Worth knowing before choosing this over LinkFinder: Explee charges 5 credits
    ($0.05) per FOUND email at ~78%, and nothing when it misses. LinkFinder's
    linkedin_profile_to_email is 10 credits at list price and is charged whether
    it finds one or not.

    On list price Explee wins. For LinkFinder AI's OWN outbound it does not,
    because LinkFinder is our product — the marginal cost is infrastructure, not
    the $0.098 a customer would pay. So: LinkFinder for our campaigns, Explee
    when running this for a client who does not own LinkFinder.
    """

    def resolve(lead: Lead) -> tuple[str, bool]:
        last = " ".join(lead.full_name.strip().split(" ")[1:]).strip()
        if not (lead.first_name or lead.full_name) or not lead.company_domain:
            return (lead.email, False)
        try:
            found = search.email(
                lead.first_name or lead.full_name.split(" ")[0],
                last,
                lead.company_domain,
                preset=preset,
            )
        except Exception as err:
            # 402/401 must stop the batch, not degrade to an unverified address.
            if getattr(err, "status", 0) in (401, 402):
                raise
            return (lead.email, False)
        return (found, True) if found else (lead.email, False)

    return resolve
