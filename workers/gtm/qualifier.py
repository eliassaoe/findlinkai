"""The qualifier: the step between Explee's search and the copywriter.

## Why this exists

`workers/explee-autogtm/README.md`, on the vendor's own product:

    Explee matches 105M companies on firmographics; it cannot see intent.

AutoGTM writes the email straight off that firmographic row. You can see it in
the drafts: "J'ai vu que Foxglove-Partner vend de l'optimisation SEO senior a
Lyon" is the row read back as a sentence. Every lead in the segment gets the
same shaped opener, because the same three columns are all the writer was given.
BASELINE.md measures where that lands: 1.05% reply against 3-8% for good cold
email.

Two things are wrong and neither is fixable in the copy:

1. **Natural-language search returns approximate matches.** Some of what comes
   back does not actually fit the criteria, and AutoGTM mails all of it.
2. **A firmographic row contains no reason to write today.** No amount of
   prompt engineering invents one; the copywriter can only restate the row.

This module fixes both before a single email is drafted. It reads each lead
against the campaign's real criteria and returns a verdict, and — when
`research=True` — it reads the company's actual website first, so the
observation the email opens on is something that required looking rather than
a column.

## Why rejecting leads is the highest-value thing here

We have nine mailboxes at 15/day: **135 sends a day** against Explee's 747
(`docs/own-gtm-agent-plan.md`). When send capacity is the binding constraint,
who you do NOT email matters more than what you write. Spending a fraction of a
cent qualifying a lead to avoid burning one of 135 daily sends is correct
arithmetic — the opposite of the trade Explee makes at 747/day on a shared pool.

So this module is allowed, and expected, to say no.
"""

from __future__ import annotations

import json
from typing import Any, Sequence

from models import Campaign, Lead, Project

MODEL = "claude-opus-5"

# This verdict decides whether a send — one of only 135 a day — gets spent, and
# supplies the sentence the email opens on. It is the wrong place to save money;
# the cheap tier in this system is the reply classifier (Haiku, in learning.py).
# "medium" without research, "high" with, because reading a site is the harder
# judgement. Both are one-line changes if measurement says otherwise.
EFFORT_DESK = "medium"
EFFORT_RESEARCH = "high"

# Server-side web search. Only on the research path.
WEB_SEARCH_TOOL = {
    "type": "web_search_20260209",
    "name": "web_search",
    "max_uses": 4,
}

VERDICT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "verdict": {
            "type": "string",
            "enum": ["send", "skip"],
            "description": "skip when they do not match, or when there is nothing honest to open on.",
        },
        "fit_score": {"type": "integer", "minimum": 1, "maximum": 10},
        "fit_reason": {
            "type": "string",
            "description": "One sentence, for a human scanning a queue. Say what they do and why it matches or does not.",
        },
        "observation": {
            "type": "string",
            "description": "The single specific thing the first email should open on. Empty string if there is nothing defensible.",
        },
        "observation_source": {
            "type": "string",
            "description": "Where the observation came from: a lead-record field name, or the URL it was read from. Empty if observation is empty.",
        },
        "skip_reason": {
            "type": "string",
            "enum": [
                "",
                "wrong_role",
                "wrong_industry",
                "wrong_geography",
                "matches_negative_criteria",
                "too_large",
                "too_small",
                "no_evidence_of_the_problem",
                "nothing_to_say",
                "record_too_thin",
            ],
        },
    },
    "required": [
        "verdict",
        "fit_score",
        "fit_reason",
        "observation",
        "observation_source",
        "skip_reason",
    ],
    "additionalProperties": False,
}


SYSTEM = """\
You qualify leads for a cold outbound campaign, and you are the last check before
one of a small number of daily sends is spent on this person.

You are given a lead that a natural-language search returned. The search matched
on firmographics and approximately — some of what it returned does not actually
fit, and some fits but gives you nothing to write about. Your job is to catch
both, and to hand the writer one specific thing to open on.

## The two questions

**1. Do they actually match?** Check the role, the geography, and every positive
and negative criterion against what the record says. The search was fuzzy; you
are not. If a negative criterion applies, skip — it does not matter how good the
rest looks. If the record is too thin to tell, that is `record_too_thin`, not a
guess.

**2. Is there something honest to open on?** This is the harder one and the one
that decides whether the email is worth sending.

## What counts as an observation

An observation is a specific, checkable fact about THIS company or person that a
competent writer could open an email with and defend if challenged on a call.

It is NOT the firmographic row restated. "Sells SEO optimisation in Lyon" is the
search result read back — the recipient learns nothing from being told what they
do, and every competitor's email opens the same way. That is the single most
common failure in this category and the reason most cold email is ignored.

A real observation is something that required reading, and that implies why you
are writing to them NOW:

- they are hiring for a role that implies the problem (a first salesperson, a
  second, a replacement)
- the service they sell is delivered by the same people who would have to sell it
- a specific claim on their own site you can quote back
- a change: a new office, a new offer, a new market, a stated ambition
- something they publish that shows the gap your offer closes

If you have looked and there is nothing beyond the firmographic row, say so:
empty observation, `nothing_to_say`. A skip costs a fraction of a cent. A generic
email costs one of the day's sends, and a little of the domain's reputation.

## Grounding

Everything you report must be traceable. `observation_source` is either a field
name from the lead record or the URL you read it on. If you cannot name where it
came from, you inferred it, and it does not go in.

Never infer headcount, revenue, funding, tooling, or pain from the industry.
"A small agency probably struggles with prospecting" is an assumption about a
category, not an observation about them, and the recipient can tell instantly.

## Scoring

- 9-10: matches every criterion AND you have an observation that implies now.
- 7-8: matches, and you have a real observation.
- 5-6: matches, but the observation is thin. Usually still `send`.
- 3-4: partial match, or nothing to say. Usually `skip`.
- 1-2: does not match, or a negative criterion applies. Always `skip`.

Be honest with the scale. A queue where everything scores 8 tells the operator
nothing and is how a campaign quietly reverts to mailing the whole list.
"""

RESEARCH_NOTE = """\

## You have web search

Use it. Look at their site — the homepage, and whatever page tells you what they
actually sell and to whom. A careers or jobs page is often the highest-signal
page on a small company's site, because who they are hiring says what they are
short of.

Two or three searches is plenty. If the company has no findable web presence,
that is itself informative: skip with `record_too_thin` rather than writing from
the row alone.

Quote precisely. `observation_source` must be the URL you actually read it on,
and the observation must be something a person could go and check on that page.
Do not report as read anything you did not see on a page you fetched.
"""


def build_request(
    project: Project,
    campaign: Campaign,
    lead: Lead,
    research: bool = False,
) -> dict[str, Any]:
    """Assemble the qualification request. Pure, so tests can read it."""
    criteria = [f"Role wanted: {campaign.target_role or '(any)'}"]
    if campaign.target_geography:
        criteria.append(f"Geography: {campaign.target_geography}")
    if campaign.positive_criteria:
        criteria.append("Must look like:\n" + "\n".join(f"  - {c}" for c in campaign.positive_criteria))
    if campaign.negative_criteria:
        criteria.append("Must NOT be:\n" + "\n".join(f"  - {c}" for c in campaign.negative_criteria))

    context = "\n".join(
        [
            f"# CAMPAIGN: {campaign.name}",
            f"We sell: {campaign.offer or '(not set)'}",
            f"To people whose problem is: {campaign.customer_problem or '(not set)'}",
            "",
            "# CRITERIA",
            "\n".join(criteria),
        ]
    )
    if campaign.kind == "influencer":
        context += (
            "\n\nThis is a creator audience. The observation must be about what they "
            "actually make — a specific piece of work — not their follower count. "
            "Audience size is a filter, never an observation."
        )

    system = [
        {"type": "text", "text": SYSTEM + (RESEARCH_NOTE if research else "")},
        {"type": "text", "text": context, "cache_control": {"type": "ephemeral"}},
    ]

    record = {k: v for k, v in {
        "full_name": lead.full_name,
        "title": lead.title,
        "company": lead.company,
        "domain": lead.company_domain,
        "location": lead.location,
        "linkedin": lead.linkedin_url,
        "audience_size": lead.audience_size,
        "content_types": list(lead.content_types) if lead.content_types else None,
        "source_row": lead.raw or None,
    }.items() if v not in (None, "", [], {})}

    request: dict[str, Any] = {
        "model": MODEL,
        "max_tokens": 4000,
        "system": system,
        "messages": [
            {
                "role": "user",
                "content": "# LEAD\n"
                + json.dumps(record, ensure_ascii=False, indent=2)
                + "\n\nQualify this lead.",
            }
        ],
        "thinking": {"type": "adaptive"},
        "output_config": {
            "effort": EFFORT_RESEARCH if research else EFFORT_DESK,
            "format": {"type": "json_schema", "schema": VERDICT_SCHEMA},
        },
    }
    if research:
        # web_search_20260209 runs code execution internally; declaring
        # code_execution alongside it confuses the model. Do not add it.
        request["tools"] = [WEB_SEARCH_TOOL]
    return request


class Verdict:
    __slots__ = (
        "verdict", "fit_score", "fit_reason", "observation",
        "observation_source", "skip_reason", "searched", "usage",
    )

    def __init__(self, data: dict[str, Any], searched: int = 0, usage: Any = None) -> None:
        self.verdict: str = data["verdict"]
        self.fit_score: int = int(data["fit_score"])
        self.fit_reason: str = data["fit_reason"]
        self.observation: str = data["observation"]
        self.observation_source: str = data["observation_source"]
        self.skip_reason: str = data["skip_reason"]
        self.searched = searched
        self.usage = usage

    @property
    def send(self) -> bool:
        return self.verdict == "send"

    def __repr__(self) -> str:
        tail = self.skip_reason or self.observation_source
        return f"<Verdict {self.verdict} {self.fit_score}/10 {tail}>"


def _count_searches(content: Sequence[Any]) -> int:
    """How many web searches actually ran.

    Server-tool errors come back as HTTP 200 with an error object where the
    result list would be, so a search that failed must not be counted as one
    that happened — otherwise a run with a broken tool looks like a researched
    run that found nothing.
    """
    n = 0
    for block in content:
        if getattr(block, "type", None) != "web_search_tool_result":
            continue
        if isinstance(getattr(block, "content", None), list):
            n += 1
    return n


def qualify(
    client: Any,
    project: Project,
    campaign: Campaign,
    lead: Lead,
    research: bool = False,
) -> Verdict:
    """Decide whether this lead is worth one of the day's sends."""
    response = client.messages.create(**build_request(project, campaign, lead, research))

    if response.stop_reason == "refusal":
        # Never let a refusal read as a pass. Skip and let a human look.
        return Verdict(
            {
                "verdict": "skip",
                "fit_score": 1,
                "fit_reason": "qualifier refused to assess this lead",
                "observation": "",
                "observation_source": "",
                "skip_reason": "record_too_thin",
            }
        )

    text = next(b.text for b in response.content if b.type == "text")
    data = json.loads(text)

    # The schema cannot express "an observation needs a source". Enforce it here:
    # an unsourced observation is an inference, and inferences are what make cold
    # email obviously automated.
    if data["observation"] and not data["observation_source"]:
        data["observation"] = ""
        data["fit_score"] = min(int(data["fit_score"]), 5)
        data["fit_reason"] = (data["fit_reason"] + " (observation dropped: no source given)").strip()

    return Verdict(data, searched=_count_searches(response.content), usage=response.usage)
