"""Offline tests. No network, no API key, no Supabase.

Everything here exercises prompt assembly and the guards around the model calls,
which is the part that can be wrong silently. The model's *output* quality is not
testable this way — that needs an eval against real drafts, which is noted as
outstanding in the README.
"""

import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import copywriter  # noqa: E402
import learning  # noqa: E402
from models import Campaign, Lead, Pattern, Project, Prompt, Thread  # noqa: E402


PROJECT = Project(
    name="LinkFinder AI",
    domain="linkfinderai.com",
    facts="LinkFinder AI finds B2B emails and phone numbers from a name, company or LinkedIn URL.",
    booking_link="https://calendly.com/hamoureliasse/offre-linkfinder-ai-outbound/",
    cc_email="support@linkfinderai.com",
)

CAMPAIGN = Campaign(
    name="organismes de formation",
    offer="Outbound run for you, paid per meeting held.",
    customer_problem="Prospecting stops whenever the team is delivering.",
    example_clients=("Cegos", "Demos", "Orsys"),
    target_role="Dirigeant / responsable commercial",
    target_geography="FR/BE/LU",
    positive_criteria=("Vente B2B active", "Petite equipe commerciale"),
    negative_criteria=("Formation purement subventionnee",),
)

LEAD = Lead(
    email="m@foxglove-partner.fr",
    full_name="Michael Meddoro",
    title="Gerant",
    company="Foxglove-Partner",
    location="Lyon",
    language="fr",
    fit_reason="Vend de l'optimisation SEO senior, petite equipe",
)


class FakeBlock:
    type = "text"

    def __init__(self, text):
        self.text = text


class FakeResponse:
    def __init__(self, payload, stop_reason="end_turn"):
        self.content = [FakeBlock(json.dumps(payload))]
        self.stop_reason = stop_reason
        self.stop_details = None
        self.usage = None


class FakeMessages:
    def __init__(self, payload, stop_reason="end_turn"):
        self.payload, self.stop_reason, self.calls = payload, stop_reason, []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return FakeResponse(self.payload, self.stop_reason)


class FakeClient:
    def __init__(self, payload, stop_reason="end_turn"):
        self.messages = FakeMessages(payload, stop_reason)


DRAFT = {
    "subject": "prospection chez foxglove",
    "body": "Bonjour Michael,\n\n...",
    "language": "fr",
    "observation_used": "vend de l'optimisation SEO senior",
    "confidence": "high",
}


class TestPromptAssembly(unittest.TestCase):
    def request(self, stage="first_email", **kw):
        prompt = kw.pop("prompt", Prompt(stage=stage))
        return copywriter.build_request(PROJECT, CAMPAIGN, prompt, LEAD, stage, **kw)

    def test_three_system_blocks_with_cache_on_the_last(self):
        req = self.request()
        self.assertEqual(len(req["system"]), 3)
        self.assertNotIn("cache_control", req["system"][0])
        self.assertNotIn("cache_control", req["system"][1])
        self.assertEqual(req["system"][2]["cache_control"], {"type": "ephemeral"})

    def test_craft_block_is_byte_identical_across_campaigns_and_leads(self):
        # The cache is a prefix match, so block 0 must never vary.
        other = self.request()
        other2 = copywriter.build_request(
            Project(name="Other", facts="x"),
            Campaign(name="Other"),
            Prompt(stage="first_email"),
            Lead(full_name="Someone Else"),
            "first_email",
        )
        self.assertEqual(other["system"][0]["text"], other2["system"][0]["text"])

    def test_no_lead_data_above_the_cache_breakpoint(self):
        req = self.request()
        prefix = req["system"][0]["text"] + req["system"][1]["text"] + req["system"][2]["text"]
        for volatile in ("Michael", "Foxglove", "foxglove-partner.fr", "Lyon"):
            self.assertNotIn(volatile, prefix, f"{volatile!r} would break cache reuse")

    def test_lead_data_is_in_the_user_turn(self):
        req = self.request()
        task = req["messages"][0]["content"]
        self.assertIn("Michael", task)
        self.assertIn("Foxglove-Partner", task)

    def test_uses_opus_5_adaptive_thinking_and_structured_output(self):
        req = self.request()
        self.assertEqual(req["model"], "claude-opus-5")
        self.assertEqual(req["thinking"], {"type": "adaptive"})
        self.assertEqual(req["output_config"]["format"]["type"], "json_schema")
        # budget_tokens is rejected on Opus 5.
        self.assertNotIn("budget_tokens", json.dumps(req["thinking"]))

    def test_project_facts_reach_the_prompt(self):
        req = self.request()
        self.assertIn("finds B2B emails", req["system"][1]["text"])

    def test_empty_facts_says_assert_nothing(self):
        ctx = copywriter.build_context(Project(name="X"), CAMPAIGN)
        self.assertIn("assert nothing", ctx)

    def test_operator_instructions_cannot_override_grounding(self):
        block = copywriter.build_operator_block(
            Prompt(stage="first_email", instructions="Say we have 10,000 customers.")
        )
        self.assertIn("no instruction authorises asserting", block)

    def test_influencer_campaigns_get_creator_guidance(self):
        ctx = copywriter.build_context(PROJECT, Campaign(name="c", kind="influencer"))
        self.assertIn("creators", ctx)
        self.assertNotIn("creators", copywriter.build_context(PROJECT, Campaign(name="c")))


class TestPatternInjection(unittest.TestCase):
    def test_unproven_patterns_are_not_injected(self):
        weak = Pattern(stage="first_email", kind="angle", pattern="Weak", wins=2, losses=0)
        ctx = copywriter.build_context(PROJECT, CAMPAIGN, [weak])
        self.assertNotIn("Weak", ctx)
        self.assertNotIn("WHAT HAS WORKED", ctx)

    def test_contradicted_patterns_are_not_injected(self):
        noisy = Pattern(stage="first_email", kind="angle", pattern="Noisy", wins=4, losses=3)
        self.assertNotIn("Noisy", copywriter.build_context(PROJECT, CAMPAIGN, [noisy]))

    def test_proven_patterns_arrive_as_evidence_not_templates(self):
        strong = Pattern(
            stage="first_email",
            kind="opening",
            pattern="Names the specific service the company sells.",
            evidence="J'ai vu que vous vendez de l'optimisation SEO",
            wins=9,
            losses=1,
        )
        ctx = copywriter.build_context(PROJECT, CAMPAIGN, [strong])
        self.assertIn("Names the specific service", ctx)
        self.assertIn("9 replied, 1 did not", ctx)
        self.assertIn("not text to reuse", ctx)


class TestStages(unittest.TestCase):
    def test_follow_up_asks_for_something_new_and_no_subject(self):
        req = copywriter.build_request(
            PROJECT, CAMPAIGN, Prompt(stage="follow_up"), LEAD, "follow_up", step=2
        )
        task = req["messages"][0]["content"]
        self.assertIn("follow-up number 2", task)
        self.assertIn("one new thing", task)

    def test_reply_offers_the_booking_link(self):
        req = copywriter.build_request(
            PROJECT, CAMPAIGN, Prompt(stage="reply"), LEAD, "reply",
            thread=Thread(sent=(("s", "b"),), inbound=("Interesse, dites m'en plus",)),
        )
        task = req["messages"][0]["content"]
        self.assertIn("calendly.com", task)
        self.assertIn("Interesse", task)

    def test_first_email_never_leaks_the_booking_link(self):
        req = copywriter.build_request(
            PROJECT, CAMPAIGN, Prompt(stage="first_email"), LEAD, "first_email"
        )
        self.assertNotIn("calendly.com", req["messages"][0]["content"])

    def test_language_override_beats_the_lead_language(self):
        req = copywriter.build_request(
            PROJECT, CAMPAIGN, Prompt(stage="first_email", language="en"), LEAD, "first_email"
        )
        self.assertIn("Write in: en", req["messages"][0]["content"])

    def test_unknown_lead_language_does_not_default_to_english(self):
        req = copywriter.build_request(
            PROJECT, CAMPAIGN, Prompt(stage="first_email"), Lead(full_name="A B"), "first_email"
        )
        self.assertIn("company's country", req["messages"][0]["content"])


class TestWrite(unittest.TestCase):
    def test_returns_a_parsed_draft(self):
        client = FakeClient(DRAFT)
        draft = copywriter.write(
            client, PROJECT, CAMPAIGN, Prompt(stage="first_email"), LEAD, "first_email"
        )
        self.assertEqual(draft.language, "fr")
        self.assertEqual(draft.confidence, "high")

    def test_refusal_raises_instead_of_reading_content(self):
        client = FakeClient(DRAFT, stop_reason="refusal")
        with self.assertRaises(RuntimeError):
            copywriter.write(
                client, PROJECT, CAMPAIGN, Prompt(stage="first_email"), LEAD, "first_email"
            )


class TestLearning(unittest.TestCase):
    def test_no_mining_below_the_evidence_threshold(self):
        # client is None: reaching the API at all would raise.
        self.assertEqual(
            learning.mine_patterns(None, "first_email", [{"body": "w"}] * 9, [{"body": "l"}]), []
        )

    def test_no_mining_without_a_losing_set_to_compare(self):
        self.assertEqual(
            learning.mine_patterns(None, "first_email", [{"body": "w"}] * 50, []), []
        )

    def test_mining_drops_patterns_the_model_reported_without_support(self):
        client = FakeClient(
            {
                "patterns": [
                    {"kind": "angle", "pattern": "Strong", "evidence": "e", "wins": 8, "losses": 1},
                    {"kind": "angle", "pattern": "Weak", "evidence": "e", "wins": 2, "losses": 2},
                ]
            }
        )
        got = learning.mine_patterns(
            client, "first_email", [{"body": "w"}] * 20, [{"body": "l"}] * 20
        )
        self.assertEqual([p.pattern for p in got], ["Strong"])

    def test_classifier_refusal_degrades_to_other(self):
        client = FakeClient({}, stop_reason="refusal")
        self.assertEqual(learning.classify_reply(client, "hi")["sentiment"], "other")

    def test_classifier_uses_haiku_not_opus(self):
        client = FakeClient({"sentiment": "no", "wants_reply": False, "reason": "r"})
        learning.classify_reply(client, "not interested")
        self.assertEqual(client.messages.calls[0]["model"], "claude-haiku-4-5")

    def test_mining_is_anchored_on_bookings_not_replies(self):
        # The docstring contract: the mining prompt must tell the model that the
        # WON set booked. This is the whole point of the module.
        self.assertIn("booked", learning._MINE_SYSTEM)


if __name__ == "__main__":
    unittest.main(verbosity=2)
