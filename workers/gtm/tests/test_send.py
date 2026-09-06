"""Offline tests for the resolver and the sender. No network, no keys."""

import io
import json
import os
import sys
import unittest
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import instantly as inst  # noqa: E402
import linkfinder  # noqa: E402
from models import Lead  # noqa: E402
from unittest import mock  # noqa: E402

# Set for this module's run, not at import. unittest imports every test module
# before running any of them, so a key left in the process environment changes
# what other suites see.
KEYS = {"LINKFINDER_API_KEY": "test", "INSTANTLY_API_KEY": "test"}
_env = None


def setUpModule():
    global _env
    _env = mock.patch.dict(os.environ, KEYS)
    _env.start()


def tearDownModule():
    _env.stop()


class FakeHTTP:
    """Scripted opener. Each entry is a dict payload or an HTTPError code."""

    def __init__(self, *script):
        self.script, self.seen, self.headers = list(script), [], []

    def __call__(self, req, timeout=None):
        self.seen.append((req.get_method(), req.full_url,
                          json.loads(req.data.decode()) if req.data else None))
        self.headers.append(dict(req.header_items()))
        item = self.script.pop(0) if self.script else {}
        if isinstance(item, int):
            raise urllib.error.HTTPError(req.full_url, item, "err", {}, io.BytesIO(b'{"m":"x"}'))
        body = json.dumps(item).encode()

        class R:
            def read(self_inner): return body
            def __enter__(self_inner): return self_inner
            def __exit__(self_inner, *a): return False
        return R()


class TestLinkFinder(unittest.TestCase):
    def client(self, *script):
        return linkfinder.LinkFinder(api_key="k", opener=FakeHTTP(*script), sleep=lambda s: None)

    def test_linkedin_lookup_costs_ten_credits(self):
        c = self.client({"result": {"email": "a@b.c"}})
        self.assertEqual(c.email_from_linkedin("https://linkedin.com/in/x"), "a@b.c")
        # The catalog says 10; the MCP tool description says 1 and is wrong.
        self.assertEqual(c.credits_spent, 10)

    def test_name_lookup_joins_parts_the_way_app_html_does(self):
        http = FakeHTTP({"result": {"email": "a@b.c"}})
        c = linkfinder.LinkFinder(api_key="k", opener=http, sleep=lambda s: None)
        c.email_from_name("Bill Gates", "Microsoft", "", "Chair")
        self.assertEqual(http.seen[0][2]["input_data"], "Bill Gates Microsoft Chair")

    def test_upstream_error_inside_a_200_reads_as_not_found(self):
        c = self.client({"result": [{"error": "provider permissions"}]})
        self.assertEqual(c.email_from_linkedin("u"), "")

    def test_async_job_is_polled_to_completion(self):
        c = self.client({"job_id": "j1"}, {"status": "pending"}, {"status": "success", "result": {"email": "z@y.x"}})
        self.assertEqual(c.email_from_linkedin("u"), "z@y.x")

    def test_bearer_auth_header_is_sent(self):
        http = FakeHTTP({"result": {"email": "a@b.c"}})
        linkfinder.LinkFinder(api_key="secret", opener=http, sleep=lambda s: None).email_from_linkedin("u")
        # urllib title-cases header names on the way out.
        self.assertEqual(http.headers[0].get("Authorization"), "Bearer secret")
        self.assertEqual(http.seen[0][0], "POST")


class TestResolver(unittest.TestCase):
    def resolver(self, *script, **kw):
        c = linkfinder.LinkFinder(api_key="k", opener=FakeHTTP(*script), sleep=lambda s: None)
        return linkfinder.make_resolver(c, **kw)

    def test_linkedin_hit_is_verified(self):
        r = self.resolver({"result": {"email": "found@x.com"}})
        self.assertEqual(r(Lead(linkedin_url="https://linkedin.com/in/x")), ("found@x.com", True))

    def test_falls_back_to_name_then_gives_up_unverified(self):
        r = self.resolver({"result": {}}, {"result": {}})
        lead = Lead(linkedin_url="u", full_name="A B", email="from-explee@x.com")
        self.assertEqual(r(lead), ("from-explee@x.com", False))

    def test_out_of_credits_stops_the_batch_rather_than_degrading(self):
        # 402 is non-retryable. Silently returning the unverified Explee address
        # here is exactly the failure this system exists to prevent.
        r = self.resolver(402)
        with self.assertRaises(linkfinder.LinkFinderError):
            r(Lead(linkedin_url="u", email="unverified@x.com"))

    def test_name_fallback_can_be_disabled(self):
        r = self.resolver({"result": {}}, allow_name_fallback=False)
        self.assertEqual(r(Lead(linkedin_url="u", full_name="A B", email="e@x.c")), ("e@x.c", False))


class TestInstantly(unittest.TestCase):
    def api(self, *script):
        return inst.Instantly(api_key="k", opener=FakeHTTP(*script), sleep=lambda s: None)

    def test_variants_are_inline_one_call_not_two(self):
        seq = inst.Instantly.sequence([{"day": 0, "subject": "s", "body": "a", "body_b": "b"}])
        self.assertEqual(len(seq[0]["steps"][0]["variants"]), 2)

    def test_campaign_is_created_paused_with_tracking_off(self):
        http = FakeHTTP({"id": "c1"})
        api = inst.Instantly(api_key="k", opener=http, sleep=lambda s: None)
        api.create_campaign("n", [{"day": 0, "subject": "s", "body": "b"}])
        body = http.seen[0][2]
        self.assertNotIn("activate", json.dumps(body))
        # Pixels and link wrapping hurt placement, which is the whole reason
        # we left the shared pool.
        self.assertFalse(body["open_tracking"])
        self.assertFalse(body["link_tracking"])
        self.assertTrue(body["text_only"])
        self.assertTrue(body["stop_on_reply"])

    def test_adding_an_unverified_lead_raises(self):
        api = self.api({})
        with self.assertRaises(ValueError):
            api.add_leads("c1", [{"email": "x@y.z", "verified": False}])

    def test_verified_leads_are_mapped(self):
        http = FakeHTTP({"ok": True})
        api = inst.Instantly(api_key="k", opener=http, sleep=lambda s: None)
        api.add_leads("c1", [{"email": "x@y.z", "verified": True, "company": "Acme", "first_name": "A"}])
        lead = http.seen[0][2]["leads"][0]
        self.assertEqual(lead["company_name"], "Acme")
        self.assertNotIn("verified", lead)

    def test_capacity_counts_only_mailboxes_that_can_send(self):
        api = self.api({"items": [
            {"email": "a@x", "status": 1, "stat_warmup_score": 100, "daily_limit": 15},
            {"email": "b@x", "status": -1, "stat_warmup_score": 100, "daily_limit": 15},
            {"email": "c@x", "status": 1, "stat_warmup_score": 40, "daily_limit": 15},
        ]})
        ready, blocked = api.sendable_accounts()
        self.assertEqual([a["email"] for a in ready], ["a@x"])
        self.assertEqual(len(blocked), 2)

    def test_all_nine_at_status_minus_one_means_zero_capacity(self):
        # The live state on 2026-09-06. Capacity must read 0, not 135.
        api = self.api({"items": [
            {"email": f"m{i}@x", "status": -1, "stat_warmup_score": 100, "daily_limit": 15}
            for i in range(9)
        ]})
        self.assertEqual(api.daily_capacity(), 0)

    def test_instantly_also_uses_bearer_auth(self):
        http = FakeHTTP({"items": []})
        inst.Instantly(api_key="tok", opener=http, sleep=lambda s: None).accounts()
        self.assertEqual(http.headers[0].get("Authorization"), "Bearer tok")

    def test_plain_text_becomes_minimal_html(self):
        self.assertEqual(inst._html("a\nb"), "a<br>b")
        self.assertEqual(inst._html("<p>x</p>"), "<p>x</p>")

    def test_non_retryable_status_is_not_retried(self):
        http = FakeHTTP(422, {"ok": True})
        api = inst.Instantly(api_key="k", opener=http, sleep=lambda s: None)
        with self.assertRaises(inst.InstantlyError):
            api.accounts()
        self.assertEqual(len(http.seen), 1)


class TestProviderSelection(unittest.TestCase):
    """llm.py picks the provider from the environment. No network."""

    def setUp(self):
        import llm
        self.llm = llm
        self.saved = {k: os.environ.get(k) for k in
                      ("LLM_PROVIDER", "OPENROUTER_API_KEY", "ANTHROPIC_API_KEY", "LLM_MODEL")}

    def tearDown(self):
        for k, v in self.saved.items():
            os.environ.pop(k, None)
            if v is not None:
                os.environ[k] = v
        import importlib
        importlib.reload(self.llm)

    def reload(self):
        import importlib
        return importlib.reload(self.llm)

    def test_anthropic_by_default(self):
        os.environ.pop("OPENROUTER_API_KEY", None)
        os.environ.pop("LLM_PROVIDER", None)
        self.assertEqual(self.reload().provider(), "anthropic")

    def test_an_openrouter_key_selects_openrouter(self):
        os.environ.pop("LLM_PROVIDER", None)
        os.environ["OPENROUTER_API_KEY"] = "sk-or-test"
        self.assertEqual(self.reload().provider(), "openrouter")

    def test_bare_claude_ids_get_namespaced_for_openrouter(self):
        os.environ["LLM_PROVIDER"] = "openrouter"
        os.environ.pop("LLM_MODEL", None)
        m = self.reload()
        self.assertEqual(m.model_for("writer"), "anthropic/claude-opus-5")
        self.assertEqual(m.model_for("classifier"), "anthropic/claude-haiku-4-5")

    def test_an_explicit_slug_is_left_alone(self):
        os.environ["LLM_PROVIDER"] = "openrouter"
        os.environ["LLM_MODEL"] = "anthropic/claude-opus-4.5"
        self.assertEqual(self.reload().model_for("writer"), "anthropic/claude-opus-4.5")

    def test_non_claude_models_are_never_prefixed(self):
        os.environ["LLM_PROVIDER"] = "openrouter"
        os.environ["LLM_MODEL"] = "deepseek/deepseek-chat"
        self.assertEqual(self.reload().model_for("writer"), "deepseek/deepseek-chat")

    def test_openrouter_points_at_the_anthropic_skin(self):
        self.assertEqual(self.llm.OPENROUTER_BASE, "https://openrouter.ai/api")


if __name__ == "__main__":
    unittest.main(verbosity=2)
