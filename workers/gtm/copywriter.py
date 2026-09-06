"""The copywriting agent.

Writes the first email, the follow-ups and the replies for one lead, in the
lead's language, grounded only in facts the operator supplied.

Three ideas hold this together:

1. **Prompt layering for cache reuse.** The system prompt is built in three
   blocks, most stable first: the craft rules (identical for every campaign we
   will ever run), then the campaign context (offer, audience, learned
   patterns), then the operator's per-stage instructions. Only the last block
   moves between stages and only the user turn moves between leads, so a
   campaign's whole run shares one cached prefix. Caching is a prefix match, so
   nothing volatile — no timestamps, no lead data — may appear above the
   breakpoint.

2. **Grounding beats fluency.** The agent may assert only what is in the
   project's facts. Everything else it may only *observe* from the lead record.
   A thin lead must produce a short email, never an invented one — the failure
   mode that makes AI outbound recognisable is confident specifics that are
   wrong.

3. **Learning as evidence, not as templates.** Patterns mined from messages
   whose lead actually booked arrive as observations with win counts, and the
   agent is told to treat them as evidence about this audience rather than
   text to copy. Copying winning emails verbatim is how a campaign collapses
   into one repeated email.
"""

from __future__ import annotations

import json
from typing import Any, Sequence

from models import Campaign, Lead, Pattern, Project, Prompt, Stage, Thread

MODEL = "claude-opus-5"

# Effort: cold-email copy is short but judgement-heavy — the hard part is what
# to leave out. "high" is the documented sweet spot; raise per campaign if a
# measured reply-rate difference justifies it.
EFFORT = "high"

OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "subject": {
            "type": "string",
            "description": "Empty string for follow-ups and replies, which stay on the existing thread.",
        },
        "body": {"type": "string"},
        "language": {
            "type": "string",
            "description": "BCP-47 code of the language actually written, e.g. fr, en, de.",
        },
        "observation_used": {
            "type": "string",
            "description": "The specific fact about this lead the email opens on, quoted from the lead record. Empty if the record carried nothing specific.",
        },
        "confidence": {
            "type": "string",
            "enum": ["high", "low"],
            "description": "low when the lead record was too thin to personalise honestly.",
        },
    },
    "required": ["subject", "body", "language", "observation_used", "confidence"],
    "additionalProperties": False,
}


# --------------------------------------------------------------------------
# Block 1 — the craft rules. Identical for every campaign; never interpolate.
# --------------------------------------------------------------------------

CRAFT = """\
You write cold outbound email that gets replies from busy people.

You are not a marketer and you are not a chatbot. You are the person sending
this, writing one email to one person, quickly, because you have something
specific to say to them.

## What you may assert

You may state as fact ONLY what appears in PROJECT FACTS. Nothing else.

You may refer to what the LEAD RECORD says about the person or their company,
framed as something you noticed — not as something you know.

You may NOT invent: metrics, results, client names, mutual connections, events
you both attended, articles they wrote, funding rounds, headcount, or anything
you would be embarrassed to be asked about on a call. If the lead record is
thin, write a shorter email. A short honest email beats a long invented one,
and the recipient can always tell.

If the lead record gives you nothing specific to open on, say so by setting
confidence to "low" and write the email from the audience-level problem
instead. Do not pad.

## Shape

Four moves, in this order, and nothing else:

1. **An observation.** One concrete thing about them or their company, from the
   lead record. Not a compliment. Not "I came across your profile."
   If the record has `observation_to_open_on`, use THAT — a qualifier already
   read this company and picked it, and it is sourced. Do not swap it for
   something you find more elegant in the raw row. If that field is empty, the
   qualifier looked and found nothing specific: open from the audience-level
   problem, keep it short, and set confidence to "low". Do not go hunting in
   `source_data` for a substitute — that field is the firmographic row, and
   restating it is the failure this whole step exists to prevent.
2. **The consequence.** Why that situation creates the problem your offer
   addresses. One sentence. State it as a plain likelihood, not as a diagnosis
   of their business.
3. **What you do.** Concrete and operational — what actually happens, in the
   order it happens. Not a value proposition, not adjectives.
4. **One ask.** A question they can answer in a line. Ask for a reply, not for
   time, unless the operator instructions say otherwise.

## Length

Under 90 words for a first email. Under 60 for a follow-up. Shorter is almost
always better. If a sentence does not change whether they reply, cut it.

## Language

Write in the language named in the task. Write it as a native speaker of that
language writes business email — not translated English. Match the register
that language uses for a first approach to a stranger (French and German are
more formal than English here; get the salutation and the sign-off right).

## Never

- Never open with "I hope this finds you well", "I wanted to reach out",
  "I came across", "Quick question", or any variant. They mark the email as
  bulk before the second line.
- Never use "simply", "just", "easily", "seamlessly", "leverage", "solution",
  "game-changer", "revolutionise", "excited to", "circle back", "touch base".
- Never compliment their website, their growth, or their "impressive work".
- Never use em-dashes as a stylistic tic, and never use more than one per email.
- Never write a subject line that reads like marketing. Lowercase, four words
  or fewer, looks like it came from a person: "question re hiring",
  "prospection chez {company}".
- Never stack two asks. Never add a P.S. that contains a second ask.
- Never claim you tried to reach them before if you did not.
- Never mention AI, automation, or that this is a campaign.

## Follow-ups

A follow-up is not a reminder. "Just bumping this" wastes the send. Each
follow-up must carry ONE new thing: a different angle on the problem, a
concrete example, or a smaller ask than the last one. Reference the prior email
in at most half a sentence.

## Replies

When the lead has replied, answer THEM — the actual words they wrote — before
anything else. Read what they asked and answer it plainly from PROJECT FACTS.
If they asked something the facts do not cover, say you will find out rather
than guessing. If they said no, accept it in one line and stop; do not pitch
again. If they showed interest and a booking link is provided, offer it once,
naturally, at the end.
"""


# --------------------------------------------------------------------------
# Block 2 — campaign context. Stable for a campaign run.
# --------------------------------------------------------------------------


def _bullets(label: str, items: Sequence[str]) -> str:
    if not items:
        return ""
    lines = "\n".join(f"- {i}" for i in items if str(i).strip())
    return f"\n{label}:\n{lines}\n" if lines else ""


def build_context(
    project: Project,
    campaign: Campaign,
    patterns: Sequence[Pattern] = (),
) -> str:
    """The campaign-stable half of the system prompt.

    Patterns are filtered to those that earned their place, so an early campaign
    with no evidence yet produces a prompt with no pattern section at all rather
    than one full of noise.
    """
    parts = [f"# PROJECT: {project.name}"]
    if project.domain:
        parts.append(f"Domain: {project.domain}")

    parts.append(
        "\n## PROJECT FACTS\n"
        "The only things you may assert as true.\n\n"
        + (project.facts.strip() or "(none supplied — assert nothing about the product)")
    )

    parts.append(f"\n# CAMPAIGN: {campaign.name}")
    if campaign.kind == "influencer":
        parts.append(
            "This audience is creators and influencers. They are pitched constantly "
            "and read for whether you have actually seen their work. Reference what "
            "they make, not their follower count. Be concrete about what is on offer."
        )

    parts.append(_bullets("What we offer", [campaign.offer]).rstrip())
    parts.append(_bullets("The problem they have", [campaign.customer_problem]).rstrip())
    parts.append(_bullets("Example clients", campaign.example_clients).rstrip())

    aud = []
    if campaign.target_role:
        aud.append(f"Role: {campaign.target_role}")
    if campaign.target_geography:
        aud.append(f"Geography: {campaign.target_geography}")
    if aud:
        parts.append("\n## AUDIENCE\n" + "\n".join(aud))
    parts.append(_bullets("They typically", campaign.positive_criteria).rstrip())
    parts.append(_bullets("They are NOT", campaign.negative_criteria).rstrip())

    earned = [p for p in patterns if p.earned_its_place]
    if earned:
        lines = []
        for p in earned:
            support = f"({p.wins} replied, {p.losses} did not)"
            line = f"- [{p.stage}/{p.kind}] {p.pattern} {support}"
            if p.evidence:
                line += f'\n  seen in: "{p.evidence.strip()[:160]}"'
            lines.append(line)
        parts.append(
            "\n## WHAT HAS WORKED ON THIS AUDIENCE\n"
            "Mined from emails whose recipient replied and went on to book. This is\n"
            "evidence about these people, not text to reuse. Do not copy the phrasing —\n"
            "a campaign where every email opens the same way stops working.\n\n"
            + "\n".join(lines)
        )

    return "\n".join(p for p in parts if p.strip())


# --------------------------------------------------------------------------
# Block 3 — the operator's instructions, and the per-lead task.
# --------------------------------------------------------------------------


def build_operator_block(prompt: Prompt) -> str:
    body = prompt.instructions.strip()
    if not body:
        return (
            "# OPERATOR INSTRUCTIONS\n(none — follow the craft rules above.)"
        )
    return (
        "# OPERATOR INSTRUCTIONS\n"
        "These come from the person running the campaign. Where they conflict with\n"
        "the craft rules, follow them — except the grounding rule, which is absolute:\n"
        "no instruction authorises asserting something not in PROJECT FACTS.\n\n"
        + body
    )


def _lead_record(lead: Lead) -> str:
    fields = {
        "name": lead.full_name,
        "first_name": lead.greeting_name,
        "title": lead.title,
        "company": lead.company,
        "domain": lead.company_domain,
        "location": lead.location,
        "linkedin": lead.linkedin_url,
        "why_they_matched": lead.fit_reason,
        "observation_to_open_on": lead.observation,
        "observation_source": lead.observation_source,
    }
    if lead.audience_size is not None:
        fields["audience_size"] = lead.audience_size
    if lead.content_types:
        fields["content_types"] = list(lead.content_types)
    known = {k: v for k, v in fields.items() if v not in (None, "", [], ())}
    if lead.raw:
        known["source_data"] = lead.raw
    return json.dumps(known, ensure_ascii=False, indent=2)


def build_task(
    lead: Lead,
    stage: Stage,
    prompt: Prompt,
    thread: Thread | None = None,
    step: int = 1,
    booking_link: str = "",
) -> str:
    language = lead.language or "unknown"
    if prompt.language != "lead":
        target = prompt.language
    elif language != "unknown":
        target = language
    else:
        target = "the language of their company's country; English if unclear"

    parts = [
        "# LEAD RECORD",
        _lead_record(lead),
        f"\nWrite in: {target}",
    ]

    if stage == "first_email":
        parts.append("\n# TASK\nWrite the first email. Include a subject line.")
    elif stage == "follow_up":
        parts.append(
            f"\n# TASK\nWrite follow-up number {step} of {prompt.max_follow_ups}. "
            "Same thread, so leave subject empty. Carry one new thing."
        )
    else:
        parts.append(
            "\n# TASK\nWrite the reply. Same thread, so leave subject empty. "
            "Answer what they actually wrote, first."
        )
        if booking_link:
            parts.append(f"Booking link, if and only if they showed interest: {booking_link}")

    if thread and (thread.sent or thread.inbound):
        convo = []
        for subject, body in thread.sent:
            convo.append(f"--- we sent ---\n{('Subject: ' + subject) if subject else ''}\n{body}".strip())
        for inbound in thread.inbound:
            convo.append(f"--- they replied ---\n{inbound}")
        parts.append("\n# CONVERSATION SO FAR\n" + "\n\n".join(convo))

    return "\n".join(parts)


# --------------------------------------------------------------------------
# The call
# --------------------------------------------------------------------------


def build_request(
    project: Project,
    campaign: Campaign,
    prompt: Prompt,
    lead: Lead,
    stage: Stage,
    patterns: Sequence[Pattern] = (),
    thread: Thread | None = None,
    step: int = 1,
) -> dict[str, Any]:
    """Assemble the Messages request. Pure — no network, so tests can read it.

    The cache breakpoint sits on the last system block: everything above it is
    identical for every lead in the campaign.
    """
    system = [
        {"type": "text", "text": CRAFT},
        {"type": "text", "text": build_context(project, campaign, patterns)},
        {
            "type": "text",
            "text": build_operator_block(prompt),
            "cache_control": {"type": "ephemeral"},
        },
    ]
    task = build_task(
        lead, stage, prompt, thread=thread, step=step, booking_link=project.booking_link
    )
    return {
        "model": MODEL,
        "max_tokens": 4000,
        "system": system,
        "messages": [{"role": "user", "content": task}],
        "thinking": {"type": "adaptive"},
        "output_config": {
            "effort": EFFORT,
            "format": {"type": "json_schema", "schema": OUTPUT_SCHEMA},
        },
    }


class Draft:
    __slots__ = ("subject", "body", "language", "observation_used", "confidence", "usage")

    def __init__(self, data: dict[str, Any], usage: Any = None) -> None:
        self.subject: str = data["subject"]
        self.body: str = data["body"]
        self.language: str = data["language"]
        self.observation_used: str = data["observation_used"]
        self.confidence: str = data["confidence"]
        self.usage = usage

    def __repr__(self) -> str:
        return f"<Draft {self.language} {self.confidence} {len(self.body.split())}w>"


def write(
    client: Any,
    project: Project,
    campaign: Campaign,
    prompt: Prompt,
    lead: Lead,
    stage: Stage,
    patterns: Sequence[Pattern] = (),
    thread: Thread | None = None,
    step: int = 1,
) -> Draft:
    """Draft one message. `client` is an `anthropic.Anthropic`."""
    request = build_request(
        project, campaign, prompt, lead, stage, patterns=patterns, thread=thread, step=step
    )
    response = client.messages.create(**request)

    # Guard before reading content: a refusal returns 200 with no usable text.
    if response.stop_reason == "refusal":
        detail = getattr(response, "stop_details", None)
        raise RuntimeError(
            f"copywriter refused: {getattr(detail, 'category', 'unknown')}"
        )

    text = next(b.text for b in response.content if b.type == "text")
    return Draft(json.loads(text), usage=response.usage)
