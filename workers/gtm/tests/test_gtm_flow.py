"""Run gtm.py end to end with every network call stubbed.

This is the test that was missing: not "does the prompt assemble" but "do the
three steps chain, and does what Explee returns arrive in Instantly".
"""

import io
import json
import os
import sys
import unittest
import urllib.error
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
for k, v in {"EXPLEE_API_KEY": "e", "INSTANTLY_API_KEY": "i", "OPENROUTER_API_KEY": "o"}.items():
    os.environ.setdefault(k, v)

import gtm  # noqa: E402

LEADS = [
    {"full_name": "Michael Meddoro", "first_name": "Michael", "job_title": "Gerant",
     "company_name": "Foxglove-Partner", "company_domain": "foxglove.fr",
     "location": "Lyon", "email": "m@foxglove.fr"},
    {"full_name": "Anna Klein", "first_name": "Anna", "job_title": "Head of Sales",
     "company_name": "Lernwerk", "company_domain": "lernwerk.de", "email": "a@lernwerk.de"},
    {"full_name": "No Email", "job_title": "CEO", "company_name": "Ghost Ltd"},
]


class FakeHTTP:
    """Answers the real URLs gtm.py calls; records every request."""

    def __init__(self, balance=5000, accounts=None, poll_pending=1):
        self.calls = []
        self.balance = balance
        self.accounts = accounts if accounts is not None else [
            {"email": "a@dom.com", "status": 1, "daily_limit": 15, "stat_warmup_score": 100},
            {"email": "b@dom.com", "status": -1, "daily_limit": 15, "stat_warmup_score": 100},
        ]
        self.poll_pending = poll_pending

    def __call__(self, req, timeout=None):
        url, method = req.full_url, req.get_method()
        body = json.loads(req.data.decode()) if req.data else None
        self.calls.append((method, url, body))

        def ok(payload):
            class R:
                def read(_): return json.dumps(payload).encode()
                def __enter__(_): return _
                def __exit__(*a): return False
            return R()

        if url.endswith("/billing/balance"):
            return ok({"remain": self.balance})
        if url.endswith("/find-and-enrich"):
            return ok({"task_id": "t1"})
        if "/find-and-enrich/t1" in url:
            if self.poll_pending > 0:
                self.poll_pending -= 1
                return ok({"meta": {"status": "pending", "progress": {"eta_seconds": 5}}})
            return ok({"contacts": LEADS, "meta": {"status": "completed", "credits_charged": 10}})
        if "/accounts" in url:
            return ok({"items": self.accounts})
        if url.endswith("/campaigns"):
            return ok({"id": "camp-1"})
        if url.endswith("/leads/list"):
            return ok({"ok": True})
        raise AssertionError("unexpected URL: " + url)


class FakeLLM:
    def __init__(self, payload=None, refuse=False):
        self.prompts = []
        self.payload = payload or {"subject": "prospection", "body": "Bonjour Michael,\n\nà Lyon."}
        self.refuse = refuse
        self.messages = self

    def create(self, **kw):
        self.prompts.append(kw)
        blk = type("B", (), {"type": "text", "text": json.dumps(self.payload)})()
        return type("R", (), {"content": [blk], "stop_reason": "refusal" if self.refuse else "end_turn"})()


def run(argv, http=None, llm=None):
    http = http or FakeHTTP()
    llm = llm or FakeLLM()
    out = io.StringIO()
    with mock.patch("urllib.request.urlopen", http), \
         mock.patch.object(gtm, "write_email", side_effect=lambda l, o, p, e: (
             None if llm.refuse else {**llm.payload})), \
         mock.patch("sys.stdout", out), \
         mock.patch("time.sleep"):
        try:
            code = gtm.main()
        except SystemExit as ex:
            code = ex.code
    return code, out.getvalue(), http


BASE = ["--find", "B2B training companies in France", "--offer", "Outbound, paid per meeting"]


class TestFlow(unittest.TestCase):
    def setUp(self):
        sys.argv = ["gtm.py"] + BASE

    def test_dry_run_finds_writes_and_stops(self):
        sys.argv = ["gtm.py"] + BASE + ["--limit", "3"]
        code, out, http = run(sys.argv)
        self.assertEqual(code, 0)
        self.assertIn("1. FIND", out)
        self.assertIn("2. WRITE", out)
        self.assertIn("DRY RUN", out)
        # Nothing was created in Instantly.
        self.assertFalse([c for c in http.calls if c[1].endswith("/campaigns")])

    def test_a_lead_with_no_email_is_skipped_not_fatal(self):
        code, out, _ = run(sys.argv)
        self.assertIn("No Email: no email, skipped", out)
        self.assertIn("Michael Meddoro", out)

    def test_apply_creates_a_paused_campaign_and_adds_leads(self):
        sys.argv = ["gtm.py"] + BASE + ["--apply"]
        code, out, http = run(sys.argv)
        self.assertEqual(code, 0)
        create = next(c for c in http.calls if c[1].endswith("/campaigns"))
        self.assertNotIn("activate", json.dumps(create[2]))
        self.assertFalse(create[2]["open_tracking"])
        self.assertFalse(create[2]["link_tracking"])
        self.assertIn("PAUSED", out)

    def test_only_sendable_mailboxes_are_used(self):
        sys.argv = ["gtm.py"] + BASE + ["--apply"]
        _, _, http = run(sys.argv)
        create = next(c for c in http.calls if c[1].endswith("/campaigns"))
        self.assertEqual(create[2]["email_list"], ["a@dom.com"])

    def test_no_sendable_mailbox_stops_before_creating_anything(self):
        sys.argv = ["gtm.py"] + BASE + ["--apply"]
        http = FakeHTTP(accounts=[{"email": "x@y", "status": -1, "daily_limit": 15}])
        code, out, http = run(sys.argv, http=http)
        self.assertIn("No mailbox can send", str(code) + out)
        self.assertFalse([c for c in http.calls if c[1].endswith("/campaigns")])

    def test_each_lead_carries_its_own_email_body(self):
        sys.argv = ["gtm.py"] + BASE + ["--apply"]
        _, _, http = run(sys.argv)
        add = next(c for c in http.calls if c[1].endswith("/leads/list"))
        leads = add[2]["leads"]
        self.assertEqual([l["email"] for l in leads], ["m@foxglove.fr", "a@lernwerk.de"])
        self.assertIn("subject", leads[0]["custom_variables"])
        self.assertIn("body", leads[0]["custom_variables"])
        # Newlines must become <br> or Instantly renders one paragraph.
        self.assertIn("<br>", leads[0]["custom_variables"]["body"])

    def test_names_are_split_for_instantly(self):
        sys.argv = ["gtm.py"] + BASE + ["--apply"]
        _, _, http = run(sys.argv)
        lead = next(c for c in http.calls if c[1].endswith("/leads/list"))[2]["leads"][0]
        self.assertEqual(lead["first_name"], "Michael")
        self.assertEqual(lead["last_name"], "Meddoro")
        self.assertEqual(lead["company_name"], "Foxglove-Partner")

    def test_an_existing_campaign_id_is_reused(self):
        sys.argv = ["gtm.py"] + BASE + ["--apply", "--campaign-id", "existing-9"]
        _, out, http = run(sys.argv)
        self.assertFalse([c for c in http.calls if c[1].endswith("/campaigns")])
        self.assertIn("using campaign existing-9", out)

    def test_a_negative_balance_stops_before_spending(self):
        code, out, http = run(sys.argv, http=FakeHTTP(balance=-4632))
        self.assertIn("must be positive", str(code) + out)
        self.assertFalse([c for c in http.calls if c[1].endswith("/find-and-enrich")])

    def test_the_job_is_polled_until_it_completes(self):
        code, out, http = run(sys.argv, http=FakeHTTP(poll_pending=3))
        polls = [c for c in http.calls if "/find-and-enrich/t1" in c[1]]
        self.assertEqual(len(polls), 4)
        self.assertEqual(code, 0)


class TestShapes(unittest.TestCase):
    def test_field_reports_what_was_actually_there(self):
        with self.assertRaises(SystemExit) as ctx:
            gtm.field({"contacts": []}, "task_id", "id")
        msg = str(ctx.exception)
        self.assertIn("task_id", msg)
        self.assertIn("contacts", msg)

    def test_http_errors_print_the_body(self):
        def boom(req, timeout=None):
            raise urllib.error.HTTPError(req.full_url, 402, "Payment Required", {},
                                         io.BytesIO(b'{"detail":"top up"}'))
        with mock.patch("urllib.request.urlopen", boom), self.assertRaises(SystemExit) as ctx:
            gtm.call("https://api.explee.com/x", "X-API-Key", "k", {"a": 1})
        self.assertIn("402", str(ctx.exception))
        self.assertIn("top up", str(ctx.exception))

    def test_newlines_become_br(self):
        self.assertEqual(gtm.html("a\nb"), "a<br>b")


if __name__ == "__main__":
    unittest.main(verbosity=2)
