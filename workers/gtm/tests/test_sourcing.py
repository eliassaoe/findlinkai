"""Offline tests for the qualify-and-draft half. No network, no key."""

import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import explee_search  # noqa: E402
import pipeline  # noqa: E402
import qualifier  # noqa: E402
from models import Campaign, Lead, Project, Prompt  # noqa: E402

PROJECT = Project(name="LinkFinder AI", facts="We find B2B contact data.", daily_cap=135)
CAMPAIGN = Campaign(
    name="organismes de formation",
    offer="Outbound run for you",
    target_role="Dirigeant",
    target_geography="FR/BE/LU",
    positive_criteria=("Vente B2B active",),
    negative_criteria=("Formation purement subventionnee",),
)
LEAD = Lead(full_name="Michael Meddoro", company="Foxglove-Partner", company_domain="foxglove.fr")

SEND = {
    "verdict": "send", "fit_score": 8, "fit_reason": "Sells senior SEO, tiny team.",
    "observation": "hiring a first salesperson", "observation_source": "https://foxglove.fr/jobs",
    "skip_reason": "",
}
SKIP = {
    "verdict": "skip", "fit_score": 3, "fit_reason": "Nothing beyond the row.",
    "observation": "", "observation_source": "", "skip_reason": "nothing_to_say",
}
DRAFT = {
    "subject": "s", "body": "b", "language": "fr",
    "observation_used": "hiring a first salesperson", "confidence": "high",
}


class Block:
    def __init__(self, text=None, type="text", content=None):
        self.type, self.text, self.content = type, text, content


class Response:
    def __init__(self, payload, stop_reason="end_turn", extra=()):
        self.content = [Block(json.dumps(payload)), *extra]
        self.stop_reason, self.stop_details, self.usage = stop_reason, None, None


class Client:
    """Returns queued payloads in order, so a pipeline run can be scripted."""

    def __init__(self, *payloads, stop_reason="end_turn", extra=()):
        self.queue, self.calls = list(payloads), []
        self._stop, self._extra = stop_reason, extra
        self.messages = self

    def create(self, **kw):
        self.calls.append(kw)
        payload = self.queue.pop(0) if self.queue else {}
        return Response(payload, self._stop, self._extra)


class TestCampaignToSearch(unittest.TestCase):
    LS = explee_search.LeadSearch

    def test_target_role_splits_into_job_titles(self):
        c = Campaign(name="x", target_role="Dirigeant, responsable commercial / CEO")
        self.assertEqual(self.LS.job_titles(c), ["Dirigeant", "responsable commercial", "CEO"])

    def test_job_titles_respect_the_documented_cap_of_20(self):
        c = Campaign(name="x", target_role=",".join(f"role{i}" for i in range(30)))
        self.assertEqual(len(self.LS.job_titles(c)), 20)

    def test_definition_is_plain_english_for_explee(self):
        c = Campaign(name="x", keywords=("organisme de formation",), target_geography="FR/BE/LU")
        d = self.LS.definition(c)
        self.assertIn("organisme de formation", d)
        self.assertIn("in FR/BE/LU", d)

    def test_definition_falls_back_from_keywords_to_problem_to_offer(self):
        problem = Campaign(name="x", customer_problem="prospecting stops")
        self.assertEqual(self.LS.subject(problem), "prospecting stops")
        offer = Campaign(name="x", offer="outbound as a service")
        self.assertEqual(self.LS.subject(offer), "outbound as a service")

    def test_a_geography_alone_is_refused_as_unbounded(self):
        # "Dirigeant in France" is every director in the country. Refuse it
        # rather than spend credits discovering that.
        bare = Campaign(name="x", target_role="Dirigeant", target_geography="France")
        search = self.LS.__new__(self.LS)
        with self.assertRaises(ValueError) as ctx:
            self.LS.search(search, bare)
        self.assertIn("bounded only by job title and geography", str(ctx.exception))

    def test_negative_criteria_become_scoreable_absences(self):
        # Explee scores 0-5, it does not filter — so a negative has to be
        # phrased as something to score LOW on.
        crit = self.LS.criteria(CAMPAIGN)
        self.assertIn("Vente B2B active", crit)
        self.assertIn("is NOT: Formation purement subventionnee", crit)

    def test_criteria_capped_at_five(self):
        c = Campaign(name="x", positive_criteria=tuple(f"p{i}" for i in range(9)))
        self.assertEqual(len(self.LS.criteria(c)), 5)

    def test_empty_campaign_refuses_to_search(self):
        search = self.LS.__new__(self.LS)
        with self.assertRaises(ValueError):
            self.LS.search(search, Campaign(name="empty"))

    def test_mapping_survives_a_row_with_nothing_in_it(self):
        self.assertEqual(self.LS.to_lead({}).full_name, "")

    def test_mapping_keeps_unknown_fields_for_the_qualifier(self):
        lead = self.LS.to_lead({"name": "A B", "criteria_scores": [{"score": 4}]})
        self.assertEqual(lead.raw["criteria_scores"][0]["score"], 4)
        self.assertEqual(lead.first_name, "A")


class TestExpleePricing(unittest.TestCase):
    """The published pricing, encoded — SOURCES.md's ~$0.025/lead predates it."""

    def test_first_hundred_results_are_free(self):
        self.assertEqual(explee_search.LeadSearch.estimate(100)["search_credits"], 0.0)

    def test_search_is_charged_only_beyond_the_free_zone(self):
        # 500 people, 2 criteria: 400 billable x (1.0 + 0.2) = 480
        self.assertEqual(
            explee_search.LeadSearch.estimate(500, criteria=2)["search_credits"], 480.0
        )

    def test_premium_costs_more_and_finds_more_than_basic(self):
        prem = explee_search.LeadSearch.estimate(500, preset="premium")
        basic = explee_search.LeadSearch.estimate(500, preset="basic")
        self.assertGreater(prem["total_usd"], basic["total_usd"])
        self.assertGreater(prem["expected_emails"], basic["expected_emails"])

    def test_unknown_preset_is_rejected(self):
        with self.assertRaises(KeyError):
            explee_search.LeadSearch.estimate(100, preset="cheapest")

    def test_find_and_enrich_refuses_over_the_documented_cap(self):
        ls = explee_search.LeadSearch.__new__(explee_search.LeadSearch)
        with self.assertRaises(ValueError):
            explee_search.LeadSearch.find_and_enrich(ls, ["CEO"], max_contacts=501)

    def test_people_by_domains_enforces_both_documented_caps(self):
        ls = explee_search.LeadSearch.__new__(explee_search.LeadSearch)
        with self.assertRaises(ValueError):
            explee_search.LeadSearch.people_by_domains(ls, ["x.com"] * 1001, ["CEO"])
        with self.assertRaises(ValueError):
            explee_search.LeadSearch.people_by_domains(ls, ["x.com"], ["t"] * 21)


class TestQualifier(unittest.TestCase):
    def test_research_adds_web_search_and_raises_effort(self):
        desk = qualifier.build_request(PROJECT, CAMPAIGN, LEAD)
        deep = qualifier.build_request(PROJECT, CAMPAIGN, LEAD, research=True)
        self.assertNotIn("tools", desk)
        self.assertEqual(deep["tools"][0]["type"], "web_search_20260209")
        self.assertEqual(desk["output_config"]["effort"], "medium")
        self.assertEqual(deep["output_config"]["effort"], "high")

    def test_research_path_never_declares_code_execution(self):
        # web_search_20260209 runs it internally; a second one confuses the model.
        deep = qualifier.build_request(PROJECT, CAMPAIGN, LEAD, research=True)
        self.assertNotIn("code_execution", json.dumps(deep["tools"]))

    def test_prompt_names_the_firmographic_restatement_failure(self):
        self.assertIn("firmographic row restated", qualifier.SYSTEM)

    def test_negative_criteria_reach_the_prompt(self):
        req = qualifier.build_request(PROJECT, CAMPAIGN, LEAD)
        self.assertIn("Formation purement subventionnee", req["system"][1]["text"])

    def test_unsourced_observation_is_dropped_and_score_capped(self):
        client = Client({**SEND, "observation_source": "", "fit_score": 9})
        v = qualifier.qualify(client, PROJECT, CAMPAIGN, LEAD)
        self.assertEqual(v.observation, "")
        self.assertLessEqual(v.fit_score, 5)
        self.assertIn("no source", v.fit_reason)

    def test_sourced_observation_survives(self):
        v = qualifier.qualify(Client(SEND), PROJECT, CAMPAIGN, LEAD)
        self.assertEqual(v.observation, "hiring a first salesperson")
        self.assertTrue(v.send)

    def test_refusal_skips_rather_than_passing(self):
        v = qualifier.qualify(Client(SEND, stop_reason="refusal"), PROJECT, CAMPAIGN, LEAD)
        self.assertFalse(v.send)
        self.assertEqual(v.fit_score, 1)

    def test_failed_web_search_is_not_counted_as_a_search(self):
        ok = Block(type="web_search_tool_result", content=[{"title": "t"}])
        err = Block(type="web_search_tool_result", content={"error_code": "max_uses_exceeded"})
        self.assertEqual(qualifier._count_searches([ok, err, ok]), 2)


class TestPipeline(unittest.TestCase):
    def verified(self, lead):
        return ("found@example.com", True)

    def test_skips_never_reach_the_copywriter(self):
        client = Client(SKIP)
        drafts, report = pipeline.run(
            client, PROJECT, CAMPAIGN, Prompt(stage="first_email"), [LEAD], resolver=self.verified
        )
        self.assertEqual(drafts, [])
        self.assertEqual(report.skip_reasons, {"nothing_to_say": 1})
        self.assertEqual(len(client.calls), 1)  # qualify only

    def test_qualification_runs_before_email_resolution(self):
        calls = []

        def resolver(lead):
            calls.append(lead)
            return ("x@y.z", True)

        pipeline.run(
            client=Client(SKIP), project=PROJECT, campaign=CAMPAIGN,
            prompt=Prompt(stage="first_email"), leads=[LEAD], resolver=resolver,
        )
        self.assertEqual(calls, [], "a skipped lead must not cost enrichment credits")

    def test_explee_supplied_address_is_blocked_as_unverified(self):
        # Explee returns emails. They are not verification — the default
        # resolver passes them through with verified=False and the gate stops
        # them, which is the hole docs/autogtm-evaluation.md is about.
        with_email = Lead(full_name="M M", company="Foxglove", email="m@foxglove.fr")
        drafts, report = pipeline.run(
            Client(SEND, DRAFT), PROJECT, CAMPAIGN, Prompt(stage="first_email"), [with_email]
        )
        self.assertEqual(drafts, [])
        self.assertEqual(report.unverified_blocked, 1)
        self.assertEqual(report.drafted, 0)

    def test_a_lead_with_no_address_counts_as_unresolved(self):
        drafts, report = pipeline.run(
            Client(SEND, DRAFT), PROJECT, CAMPAIGN, Prompt(stage="first_email"), [LEAD]
        )
        self.assertEqual(drafts, [])
        self.assertEqual(report.unresolved, 1)
        self.assertEqual(report.unverified_blocked, 0)

    def test_require_verified_can_be_turned_off_explicitly(self):
        with_email = Lead(full_name="M M", company="Foxglove", email="m@foxglove.fr")
        drafts, report = pipeline.run(
            Client(SEND, DRAFT), PROJECT, CAMPAIGN, Prompt(stage="first_email"),
            [with_email], require_verified=False,
        )
        self.assertEqual(len(drafts), 1)
        self.assertEqual(report.unverified_blocked, 0)

    def test_observation_is_carried_into_the_draft_request(self):
        client = Client(SEND, DRAFT)
        drafts, _ = pipeline.run(
            client, PROJECT, CAMPAIGN, Prompt(stage="first_email"), [LEAD], resolver=self.verified
        )
        self.assertEqual(len(drafts), 1)
        self.assertEqual(drafts[0].lead.observation, "hiring a first salesperson")
        task = client.calls[-1]["messages"][0]["content"]
        self.assertIn("observation_to_open_on", task)
        self.assertIn("https://foxglove.fr/jobs", task)

    def test_suppressed_addresses_never_get_qualified(self):
        client = Client(SEND, DRAFT)
        _, report = pipeline.run(
            client, PROJECT, CAMPAIGN, Prompt(stage="first_email"),
            [Lead(email="No@Example.com")], resolver=self.verified,
            suppression=frozenset({"no@example.com"}),
        )
        self.assertEqual(report.skip_reasons, {"suppressed": 1})
        self.assertEqual(client.calls, [])

    def test_cap_counts_sends_not_leads_looked_at(self):
        leads = [LEAD] * 4
        client = Client(*([SEND, DRAFT] * 4))
        drafts, report = pipeline.run(
            client, PROJECT, CAMPAIGN, Prompt(stage="first_email"), leads,
            resolver=self.verified, daily_cap=2,
        )
        self.assertEqual(len(drafts), 2)
        self.assertEqual(report.capped, 2)

    def test_report_line_is_readable(self):
        _, report = pipeline.run(
            Client(SKIP), PROJECT, CAMPAIGN, Prompt(stage="first_email"), [LEAD]
        )
        self.assertIn("nothing_to_say=1", report.line())


class TestConsoleRoundTrip(unittest.TestCase):
    """The console downloads JSON; run.py reads it. That handoff is the product."""

    EXPORTED = {
        "project": {"name": "linkfinderai.com", "domain": "linkfinderai.com",
                    "facts": "We find B2B emails.", "booking_link": "https://cal.com/x",
                    "cc_email": "", "sending_emails": [], "daily_cap": 135},
        "campaign": {"name": "organismes de formation", "kind": "b2b",
                     "offer": "Outbound, paid per meeting", "customer_problem": "prospecting stops",
                     "example_clients": ["Cegos"], "keywords": ["organisme de formation"],
                     "target_role": "Dirigeant", "target_geography": "FR",
                     "positive_criteria": ["Vente B2B active"], "negative_criteria": ["subventionne"],
                     "instantly_campaign_id": None},
        "prompts": [{"stage": s, "instructions": f"i-{s}", "language": "lead",
                     "follow_up_every_days": 3, "max_follow_ups": 2}
                    for s in ("first_email", "follow_up", "reply")],
    }

    def write(self, data):
        import json, tempfile, os
        fd, path = tempfile.mkstemp(suffix=".json")
        with os.fdopen(fd, "w") as f:
            json.dump(data, f)
        self.addCleanup(os.unlink, path)
        return path

    def load(self, data=None):
        import run
        return run.load_config(self.write(data or self.EXPORTED))

    def test_a_console_export_loads(self):
        project, campaign, prompts = self.load()
        self.assertEqual(project.daily_cap, 135)
        self.assertEqual(campaign.keywords, ("organisme de formation",))
        self.assertEqual(sorted(prompts), ["first_email", "follow_up", "reply"])

    def test_null_instantly_id_becomes_empty_not_none(self):
        # The console exports null when unset; a None here would break `or` chains.
        _, campaign, _ = self.load()
        self.assertEqual(campaign.instantly_campaign_id, "")

    def test_an_instantly_id_round_trips(self):
        data = {**self.EXPORTED, "campaign": {**self.EXPORTED["campaign"],
                                              "instantly_campaign_id": "abc-123"}}
        _, campaign, _ = self.load(data)
        self.assertEqual(campaign.instantly_campaign_id, "abc-123")

    def test_an_unknown_field_is_ignored_not_fatal(self):
        # The console will grow fields faster than the dataclasses do. A config
        # file must never be able to stop a run.
        data = {**self.EXPORTED,
                "campaign": {**self.EXPORTED["campaign"], "some_future_field": 42}}
        _, campaign, _ = self.load(data)
        self.assertEqual(campaign.name, "organismes de formation")

    def test_the_export_survives_all_the_way_into_the_prompt(self):
        import copywriter
        from models import Lead
        project, campaign, prompts = self.load()
        req = copywriter.build_request(
            project, campaign, prompts["first_email"], Lead(full_name="A B"), "first_email"
        )
        ctx = req["system"][1]["text"]
        self.assertIn("Vente B2B active", ctx)
        self.assertIn("We find B2B emails", ctx)
        self.assertIn("i-first_email", req["system"][2]["text"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
