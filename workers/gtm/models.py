"""Typed config objects mirroring schema.sql.

Plain dataclasses, no DB driver — so the copywriter and its tests run with no
network and no Supabase. `store.py` is what turns rows into these.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

Stage = Literal["first_email", "follow_up", "reply"]
Kind = Literal["b2b", "influencer"]

STAGES: tuple[Stage, ...] = ("first_email", "follow_up", "reply")

# Explee caps operator instructions at 3000 characters. Same cap here: it keeps
# the cached prompt prefix small and the instructions portable between systems.
MAX_INSTRUCTIONS = 3000


@dataclass(frozen=True)
class Project:
    """A client brand. `facts` is the only thing replies may assert as true."""

    name: str
    domain: str = ""
    facts: str = ""
    booking_link: str = ""
    cc_email: str = ""
    sending_emails: tuple[str, ...] = ()
    daily_cap: int = 100


@dataclass(frozen=True)
class Campaign:
    name: str
    kind: Kind = "b2b"
    offer: str = ""
    customer_problem: str = ""
    example_clients: tuple[str, ...] = ()
    keywords: tuple[str, ...] = ()
    target_role: str = ""
    target_geography: str = ""
    positive_criteria: tuple[str, ...] = ()
    negative_criteria: tuple[str, ...] = ()


@dataclass(frozen=True)
class Prompt:
    """One versioned, per-stage instruction block — what the UI edits."""

    stage: Stage
    version: int = 1
    instructions: str = ""
    language: str = "lead"
    follow_up_every_days: int = 3
    max_follow_ups: int = 2

    def __post_init__(self) -> None:
        if len(self.instructions) > MAX_INSTRUCTIONS:
            raise ValueError(
                f"instructions are {len(self.instructions)} chars, "
                f"max is {MAX_INSTRUCTIONS}"
            )
        if self.stage not in STAGES:
            raise ValueError(f"unknown stage {self.stage!r}")


@dataclass(frozen=True)
class Lead:
    email: str = ""
    full_name: str = ""
    first_name: str = ""
    title: str = ""
    company: str = ""
    company_domain: str = ""
    linkedin_url: str = ""
    location: str = ""
    language: str = ""
    audience_size: int | None = None
    content_types: tuple[str, ...] = ()
    fit_reason: str = ""
    # From the qualifier. The specific thing the first email opens on, and where
    # it was read. An observation without a source is dropped before it gets here
    # — see qualifier.qualify.
    observation: str = ""
    observation_source: str = ""
    # Whatever the source returned. The copywriter is told to quote from this
    # rather than infer, so a thin lead produces a thin — not invented — email.
    raw: dict = field(default_factory=dict)

    @property
    def greeting_name(self) -> str:
        """First name if we have one, else the first token of the full name."""
        if self.first_name.strip():
            return self.first_name.strip()
        return self.full_name.strip().split(" ")[0] if self.full_name.strip() else ""


@dataclass(frozen=True)
class Pattern:
    """A learned regularity from messages whose lead booked or showed interest."""

    stage: Stage
    kind: str  # opening | angle | ask | subject | structure | avoid
    pattern: str
    evidence: str = ""
    wins: int = 0
    losses: int = 0

    @property
    def earned_its_place(self) -> bool:
        """Mirrors the gtm_active_patterns view — keep the two in step."""
        return self.wins >= 3 and self.wins > self.losses * 2


@dataclass(frozen=True)
class Thread:
    """Prior messages in one conversation, oldest first, for follow-ups/replies."""

    sent: tuple[tuple[str, str], ...] = ()  # (subject, body)
    inbound: tuple[str, ...] = ()           # their replies, oldest first
