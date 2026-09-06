"""The learning loop: classify what came back, mine what worked, feed it forward.

Two jobs, deliberately separate:

- `classify_reply` labels one inbound message. Cheap, high volume, runs on every
  reply as it arrives.
- `mine_patterns` looks at a batch of *outbound* messages whose recipient went
  on to book, against a batch whose recipient did not, and extracts what
  differed. Expensive, low volume, runs weekly.

The distinction that matters, and the one BASELINE.md was written to force:
**mining is anchored on `booked_at`, not on `interested_at`.** `docs/outbound-angle.md`
records 571 leads marked interested and 0 meetings booked. An "interested" reply
is not evidence that an email worked — optimising for it is how a campaign learns
to generate polite non-answers. A booking is the only signal here that survived
contact with a calendar.

Where there are not yet enough bookings to learn from, `mine_patterns` returns
nothing rather than learning from replies. An empty pattern set is the correct
output of a campaign that has not proven anything yet.
"""

from __future__ import annotations

import json
from typing import Any, Sequence

import llm
from models import Pattern, Stage

# Classification is a labelling task at high volume: Haiku is the right tier.
CLASSIFY_MODEL = llm.model_for("classifier")
# Mining is the judgement-heavy half and runs weekly at most.
MINE_MODEL = llm.model_for("writer")

# Below this many booked examples, there is nothing to learn and plenty to
# overfit to. Ten is a guess, not a measurement — revisit once real bookings exist.
MIN_WINS_TO_MINE = 10

SENTIMENTS = ("interested", "question", "not_now", "no", "ooo", "unsubscribe", "other")

_CLASSIFY_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "sentiment": {"type": "string", "enum": list(SENTIMENTS)},
        "wants_reply": {"type": "boolean"},
        "reason": {"type": "string"},
    },
    "required": ["sentiment", "wants_reply", "reason"],
    "additionalProperties": False,
}

_CLASSIFY_SYSTEM = """\
You label replies to cold outbound email. One label, from the list.

- interested: they want to talk, see a demo, know pricing, or said yes.
- question: they engaged and asked something, without committing either way.
- not_now: interested in principle, wrong timing ("ask me in Q3").
- no: declined, not a fit, or told you to stop pitching.
- ooo: automatic out-of-office or holiday autoresponder.
- unsubscribe: asked to be removed, or complained about being contacted.
- other: bounce notices, wrong person, routing replies, anything else.

Two rules people get wrong:
- Politeness is not interest. "Thanks, I'll take a look" with no question and no
  commitment is `other`, not `interested`. Only label `interested` if a human
  reading it would put a meeting in the diary.
- A referral to a colleague is `other`, not `no` — the door is open, just elsewhere.

`wants_reply` is whether a human should answer this. Out-of-office and
unsubscribes do not want a reply. A `no` does not want a pitch, but a one-line
acknowledgement is still courteous — mark it false; the reply agent handles
courtesy separately.
"""


def classify_reply(client: Any, body: str) -> dict[str, Any]:
    """Label one inbound reply. Returns {sentiment, wants_reply, reason}."""
    response = client.messages.create(
        model=CLASSIFY_MODEL,
        max_tokens=512,
        system=[{"type": "text", "text": _CLASSIFY_SYSTEM, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": f"Reply to classify:\n\n{body.strip()[:4000]}"}],
        output_config={"format": {"type": "json_schema", "schema": _CLASSIFY_SCHEMA}},
    )
    if response.stop_reason == "refusal":
        return {"sentiment": "other", "wants_reply": False, "reason": "classifier refused"}
    text = next(b.text for b in response.content if b.type == "text")
    return json.loads(text)


# --------------------------------------------------------------------------
# Mining
# --------------------------------------------------------------------------

_MINE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "patterns": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "kind": {
                        "type": "string",
                        "enum": ["opening", "angle", "ask", "subject", "structure", "avoid"],
                    },
                    "pattern": {
                        "type": "string",
                        "description": "One sentence, actionable when writing the next email.",
                    },
                    "evidence": {
                        "type": "string",
                        "description": "A short quote from a winning email that shows it.",
                    },
                    "wins": {"type": "integer"},
                    "losses": {"type": "integer"},
                },
                "required": ["kind", "pattern", "evidence", "wins", "losses"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["patterns"],
    "additionalProperties": False,
}

_MINE_SYSTEM = """\
You are analysing cold emails to find what actually made people book a meeting.

You get two sets of emails from one campaign: WON (the recipient booked) and
LOST (the recipient did not reply, or replied and never booked). Same offer,
same audience. Find what differs.

Report only differences you can count. For each pattern, `wins` is how many WON
emails show it and `losses` is how many LOST emails show it. If a trait appears
about equally in both sets it is not a pattern — leave it out. Ten weak patterns
are worse than two real ones; returning an empty list is a valid answer.

Look at: how the first line opens, what the observation is about, which problem
the email names, what the ask is, how long it is, subject-line shape, and what
the winners consistently leave out.

Two things to resist:
- Do not report surface features that reflect the audience rather than the copy
  (e.g. "winners were in French" when the French leads were simply better
  targeted). Ask whether a writer could act on it.
- Do not turn a pattern into a template. "Opens by naming the specific service
  the company sells" is useful. "Opens with 'J'ai vu que'" produces a campaign
  of identical emails, which stops working within a week.

Use `avoid` for traits concentrated in the LOST set.
"""


def _render(emails: Sequence[dict[str, str]], label: str, cap: int = 40) -> str:
    out = []
    for i, e in enumerate(emails[:cap], 1):
        subject = e.get("subject") or ""
        head = f"{label} {i}" + (f" — subject: {subject}" if subject else "")
        out.append(f"{head}\n{e.get('body', '').strip()[:1200]}")
    return "\n\n".join(out)


def mine_patterns(
    client: Any,
    stage: Stage,
    won: Sequence[dict[str, str]],
    lost: Sequence[dict[str, str]],
    min_wins: int = MIN_WINS_TO_MINE,
) -> list[Pattern]:
    """Extract what separated booked emails from the rest.

    `won` are outbound messages whose lead has `booked_at` set — not merely
    `interested_at`. Returns [] when there is not enough evidence, which is the
    common and correct case early on.
    """
    if len(won) < min_wins:
        return []
    if not lost:
        return []

    prompt = (
        f"Stage: {stage}\n\n"
        f"=== WON ({len(won)} emails, recipient booked) ===\n\n"
        f"{_render(won, 'WON')}\n\n"
        f"=== LOST ({len(lost)} emails, recipient did not book) ===\n\n"
        f"{_render(lost, 'LOST')}"
    )

    response = client.messages.create(
        model=MINE_MODEL,
        max_tokens=8000,
        system=[{"type": "text", "text": _MINE_SYSTEM, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": prompt}],
        thinking={"type": "adaptive"},
        output_config={
            "effort": "high",
            "format": {"type": "json_schema", "schema": _MINE_SCHEMA},
        },
    )
    if response.stop_reason == "refusal":
        return []

    text = next(b.text for b in response.content if b.type == "text")
    data = json.loads(text)

    patterns = [
        Pattern(
            stage=stage,
            kind=p["kind"],
            pattern=p["pattern"],
            evidence=p["evidence"],
            wins=int(p["wins"]),
            losses=int(p["losses"]),
        )
        for p in data.get("patterns", [])
    ]
    # The model reports counts; the threshold is ours to enforce, and the same
    # one the gtm_active_patterns view applies.
    return [p for p in patterns if p.earned_its_place]
