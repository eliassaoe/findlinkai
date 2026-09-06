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
import gtm  # noqa: E402

# Set inside the module's own run, not at import: unittest imports every test
# module before running any of them, and an OPENROUTER_API_KEY left in the
# process environment changes which model slug llm.py returns for every other
# suite.
KEYS = {"EXPLEE_API_KEY": "e", "INSTANTLY_API_KEY": "i", "OPENROUTER_API_KEY": "o",
        "LINKFINDER_API_KEY": "l"}
_env = None


def setUpModule():
    global _env
    _env = mock.patch.dict(os.environ, KEYS)
    _env.start()


def tearDownModule():
    _env.stop()

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

    def __init__(self, balance=5000, accounts=None, poll_pending=1, lf=None,
                 contacts=None, still_pending=False):
        self.calls = []
        self.contacts = LEADS if contacts is None else contacts
        # Explee reports pending with contacts already populated; the run
        # should key off the array, not the word.
        self.still_pending = still_pending
        self.linkfinder = []
        # Scripted LinkFinder replies, popped in order. An int raises that
        # HTTP status. Empty means "looked, found nothing".
        self.lf = list(lf or [])
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
            status = "pending" if self.still_pending else "completed"
            return ok({"contacts": self.contacts,
                       "meta": {"status": status, "credits_charged": 10}})
        if url == gtm.LINKFINDER:
            self.linkfinder.append(body)
            item = self.lf.pop(0) if self.lf else {"result": None}
            if isinstance(item, int):
                raise urllib.error.HTTPError(url, item, "no", {}, io.BytesIO(b'{"m":"nope"}'))
            return ok(item)
        if "/status/" in url:
            return ok(self.lf.pop(0) if self.lf else {"status": "done", "result": None})
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


class TestLinkFinderFallback(unittest.TestCase):
    """Explee charges only for emails it finds. LinkFinder gets a second look
    at the rest, and charges whether or not it finds one."""

    def setUp(self):
        sys.argv = ["gtm.py"] + BASE

    def test_a_lead_with_no_email_gets_one_and_reaches_instantly(self):
        sys.argv = ["gtm.py"] + BASE + ["--apply"]
        code, out, http = run(sys.argv, http=FakeHTTP(lf=[{"result": {"email": "ceo@ghost.io"}}]))
        self.assertEqual(code, 0)
        self.assertIn("ceo@ghost.io", out)
        # Two came from Explee, the third from LinkFinder.
        self.assertIn("added 3 leads", out)
        sent = [c for c in http.calls if c[1].endswith("/leads/list")][0][2]
        self.assertIn("ceo@ghost.io", [l["email"] for l in sent["leads"]])

    def test_a_linkedin_url_uses_the_url_endpoint_a_bare_name_does_not(self):
        lead = {"full_name": "Ada Byron", "company_name": "Analytical",
                "linkedin_url": "https://www.linkedin.com/in/ada"}
        _, _, http = run(sys.argv, http=FakeHTTP(contacts=[lead],
                                                 lf=[{"result": {"email": "ada@analytical.io"}}]))
        self.assertEqual(http.linkfinder[0]["type"], "linkedin_profile_to_email")
        self.assertEqual(http.linkfinder[0]["input_data"], "https://www.linkedin.com/in/ada")

        _, _, http = run(sys.argv, http=FakeHTTP(lf=[{"result": {"email": "x@ghost.io"}}]))
        self.assertEqual(http.linkfinder[0]["type"], "lead_full_name_to_email")
        self.assertEqual(http.linkfinder[0]["input_data"], "No Email Ghost Ltd")

    def test_a_402_stops_the_lookups_without_losing_the_leads_already_paid_for(self):
        sys.argv = ["gtm.py"] + BASE + ["--apply"]
        code, out, http = run(sys.argv, http=FakeHTTP(lf=[402]))
        self.assertEqual(code, 0)
        self.assertIn("402", out)
        self.assertIn("added 2 leads", out)     # the two Explee found still go

    def test_the_cap_is_a_cap(self):
        sys.argv = ["gtm.py"] + BASE + ["--linkfinder-max", "0"]
        code, out, http = run(sys.argv,
                              http=FakeHTTP(lf=[{"result": {"email": "never@called.io"}}]))
        self.assertEqual(http.linkfinder, [])
        self.assertIn("--linkfinder-max 0", out)
        self.assertIn("with 2 leads", out)

    def test_nothing_to_look_up_by_is_not_a_lookup(self):
        code, out, http = run(sys.argv, http=FakeHTTP(contacts=[{"job_title": "CEO"}]))
        self.assertEqual(http.linkfinder, [])

    def test_a_lookup_that_finds_nothing_is_still_charged_and_the_lead_dropped(self):
        code, out, http = run(sys.argv, http=FakeHTTP(lf=[{"result": None}]))
        self.assertEqual(len(http.linkfinder), 1)
        self.assertIn("found 0 (7 credits)", out)   # name lookup, found or not
        self.assertIn("with 2 leads", out)

    def test_a_job_id_is_polled_rather_than_parsed_as_a_result(self):
        code, out, http = run(sys.argv, http=FakeHTTP(lf=[
            {"job_id": "j1", "poll_url": "https://api.linkfinderai.com/status/j1"},
            {"status": "done", "result": {"email": "slow@ghost.io"}}]))
        self.assertIn("slow@ghost.io", out)
        self.assertTrue(any("/status/j1" in c[1] for c in http.calls))


class TestExpleeReadiness(unittest.TestCase):
    def test_contacts_end_the_poll_even_while_the_status_says_pending(self):
        sys.argv = ["gtm.py"] + BASE
        code, out, http = run(sys.argv, http=FakeHTTP(still_pending=True))
        self.assertEqual(code, 0)
        polls = [c for c in http.calls if "/find-and-enrich/t1" in c[1]]
        self.assertEqual(len(polls), 2)         # one pending, then the array


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
