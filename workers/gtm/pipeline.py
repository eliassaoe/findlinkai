"""search -> qualify -> write, with the gates that stop it wasting sends.

The whole point of the ordering is that each stage is cheaper than the one it
protects:

    Explee search   ~$0.025/lead   finds people
    qualify         cents          decides whether one of 135 daily sends is worth it
    resolve email   7-10 credits   only for leads that passed
    write           cents          only for leads with a verified address

Explee's AutoGTM runs search -> write. Everything this module adds sits in the
middle, and the middle is where the reply rate is.

Nothing here sends. `run()` produces drafts and a report; handing them to
Instantly is phase 3.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Any, Callable, Iterable, Sequence

import copywriter
import qualifier
from models import Campaign, Lead, Pattern, Project, Prompt

# An email resolver takes a Lead and returns (email, verified). The default
# resolves nothing, so the pipeline is honest about having no addresses rather
# than silently sending to whatever Explee returned.
Resolver = Callable[[Lead], "tuple[str, bool]"]


def no_resolver(lead: Lead) -> tuple[str, bool]:
    """Trust an address Explee already supplied, but never mark it verified.

    Explee's own emails are not verification. Marking them verified would open
    the exact hole documented in docs/autogtm-evaluation.md.
    """
    return (lead.email, False)


@dataclass
class Report:
    searched: int = 0
    qualified: int = 0
    skipped: int = 0
    skip_reasons: dict[str, int] = field(default_factory=dict)
    unresolved: int = 0
    unverified_blocked: int = 0
    drafted: int = 0
    low_confidence: int = 0
    capped: int = 0

    def line(self) -> str:
        top = sorted(self.skip_reasons.items(), key=lambda kv: -kv[1])[:3]
        reasons = ", ".join(f"{k}={v}" for k, v in top) or "none"
        return (
            f"searched={self.searched} qualified={self.qualified} "
            f"skipped={self.skipped} ({reasons}) "
            f"unresolved={self.unresolved} blocked_unverified={self.unverified_blocked} "
            f"drafted={self.drafted} low_confidence={self.low_confidence} "
            f"capped={self.capped}"
        )


@dataclass
class Drafted:
    lead: Lead
    verdict: qualifier.Verdict
    draft: copywriter.Draft


def run(
    client: Any,
    project: Project,
    campaign: Campaign,
    prompt: Prompt,
    leads: Iterable[Lead],
    patterns: Sequence[Pattern] = (),
    resolver: Resolver = no_resolver,
    research: bool = False,
    daily_cap: int | None = None,
    require_verified: bool = True,
    suppression: frozenset[str] = frozenset(),
) -> tuple[list[Drafted], Report]:
    """Qualify, resolve, and draft. Returns (drafts, report).

    `daily_cap` defaults to the project's. It is applied to *sends*, after
    qualification, so a cap of 135 means 135 emails — not 135 leads looked at.
    """
    cap = project.daily_cap if daily_cap is None else daily_cap
    report = Report()
    out: list[Drafted] = []

    for lead in leads:
        report.searched += 1

        if len(out) >= cap:
            report.capped += 1
            continue

        if lead.email and lead.email.lower() in suppression:
            report.skipped += 1
            report.skip_reasons["suppressed"] = report.skip_reasons.get("suppressed", 0) + 1
            continue

        verdict = qualifier.qualify(client, project, campaign, lead, research=research)
        if not verdict.send:
            report.skipped += 1
            key = verdict.skip_reason or "unspecified"
            report.skip_reasons[key] = report.skip_reasons.get(key, 0) + 1
            continue
        report.qualified += 1

        # Resolve the address only now — qualification is cheaper than
        # enrichment, so it runs first and pays for itself on every skip.
        email, verified = resolver(lead)
        if not email:
            report.unresolved += 1
            continue
        if require_verified and not verified:
            report.unverified_blocked += 1
            continue

        enriched = replace(
            lead,
            email=email,
            fit_reason=verdict.fit_reason,
            observation=verdict.observation,
            observation_source=verdict.observation_source,
        )
        draft = copywriter.write(
            client, project, campaign, prompt, enriched, "first_email", patterns=patterns
        )
        if draft.confidence == "low":
            report.low_confidence += 1
        report.drafted += 1
        out.append(Drafted(lead=enriched, verdict=verdict, draft=draft))

    return out, report
