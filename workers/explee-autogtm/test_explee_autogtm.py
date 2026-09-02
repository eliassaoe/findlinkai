#!/usr/bin/env python3
"""python3 test_explee_autogtm.py - no network, no key needed.

The tests that matter here are the ones about NOT sending: an unsubscribe, a
lead who already booked, a thread a human already answered, a second run over
the same reply. Those are the failure modes that cost a domain.
"""

import datetime as dt
import io
import json
import unittest
import urllib.error

import baseline
import followups as fu
import instantly_leads as il
import leadsource_test as lst
import recover
import sheet as sheet_mod
from explee import Explee, ExpleeError, ShapeError, first_of

UTC = dt.timezone.utc
WED = dt.datetime(2026, 9, 2, 9, 0, tzinfo=UTC)      # a Wednesday morning
FRI = dt.datetime(2026, 9, 4, 16, 0, tzinfo=UTC)     # a Friday evening
CFG = {"timezone": "UTC", "slot_hours": [10, 15],
       "copy": {"sender": "Eliasse", "offer": "One line.", "topic": "outbound"}}


class Classifier(unittest.TestCase):
    def test_every_no_is_silent(self):
        for text in ["please unsubscribe me", "remove me from your list",
                     "I am out of office until 12 September", "Automatic reply: annual leave",
                     "not interested, thanks", "we already have a tool for this",
                     "no thanks", "booked - see you Thursday", "I accepted the invite"]:
            bucket, _ = fu.classify(text)
            self.assertIn(bucket, fu.SILENT, "{!r} -> {}".format(text, bucket))

    def test_no_beats_yes_when_both_appear(self):
        # "not interested but send me pricing anyway" must never send.
        bucket, _ = fu.classify("Not interested right now, but send me pricing for later")
        self.assertEqual(bucket, "negative")

    def test_buckets(self):
        cases = {
            "can you send me pricing?": "send_info",
            "sounds interesting, worth a chat": "warm",
            "how does it handle GDPR?": "question",
            "I don't handle this, speak to my colleague": "wrong_person",
            "not right now, circle back in Q1": "not_now",
        }
        for text, expected in cases.items():
            self.assertEqual(fu.classify(text)[0], expected, text)

    def test_unknown_never_sends(self):
        bucket, _ = fu.classify("ok")
        self.assertEqual(bucket, "unknown")
        self.assertIn(bucket, fu.SILENT)

    def test_calendar_view_promotes_a_yes_but_never_a_no(self):
        self.assertEqual(fu.classify("sounds good", opened_calendar=True)[0], "opened_no_book")
        self.assertEqual(fu.classify("not interested", opened_calendar=True)[0], "negative")

    def test_re_engage_dates(self):
        self.assertEqual(fu.re_engage_date("try again in 2 weeks", WED),
                         dt.date(2026, 9, 16))
        self.assertEqual(fu.re_engage_date("circle back next quarter", WED),
                         dt.date(2026, 12, 1))


class Slots(unittest.TestCase):
    def test_two_different_business_days_far_enough_out(self):
        slots = fu.two_slots(WED, "UTC")
        self.assertEqual(len(slots), 2)
        self.assertNotEqual(slots[0].date(), slots[1].date())
        for slot in slots:
            self.assertLess(slot.weekday(), 5)
            self.assertGreaterEqual((slot - WED).total_seconds() / 3600, fu.MIN_LEAD_HOURS)

    def test_friday_evening_rolls_past_the_weekend(self):
        for slot in fu.two_slots(FRI, "UTC"):
            self.assertLess(slot.weekday(), 5)

    def test_the_two_hours_differ(self):
        slots = fu.two_slots(WED, "UTC")
        self.assertNotEqual(slots[0].hour, slots[1].hour)


class Compose(unittest.TestCase):
    def setUp(self):
        self.slots = [fu.say_slot(s) for s in fu.two_slots(WED, "UTC")]
        self.ctx = {"first_name": "Sam", "company": "Acme", "offer": "One line.",
                    "sender": "Eliasse", "slots": self.slots}

    def test_sending_buckets_name_both_times(self):
        for bucket, needs_slots in fu.SENDING.items():
            body = fu.compose(bucket, self.ctx)
            for slot in self.slots:
                self.assertEqual(slot in body, needs_slots, "{} / {}".format(bucket, slot))

    def test_a_slotless_send_is_refused(self):
        with self.assertRaises(ValueError):
            fu.compose("send_info", dict(self.ctx, slots=[]))

    def test_silent_buckets_have_no_template(self):
        for bucket in fu.SILENT + fu.QUEUED:
            with self.assertRaises(ValueError):
                fu.compose(bucket, self.ctx)


class Notes(unittest.TestCase):
    def test_marker_round_trip_keeps_the_human_note(self):
        human = "Met at SaaStock. Wants the phone data, not the emails."
        note = recover.write_marker(human, [{"at": "2026-09-02T10:00Z", "bucket": "send_info",
                                             "msg": "abc123", "action": "sent"}])
        self.assertIn(human, note)
        entries = recover.read_marker(note)
        self.assertEqual(entries[0]["bucket"], "send_info")
        # Rewriting must not duplicate the block or lose the human text.
        again = recover.write_marker(note, entries + [{"at": "2026-09-03T10:00Z",
                                                       "bucket": "re_engage", "msg": "abc123",
                                                       "action": "sent"}])
        self.assertEqual(again.count(recover.MARK_OPEN), 1)
        self.assertIn(human, again)
        self.assertEqual(len(recover.read_marker(again)), 2)

    def test_direction_spellings(self):
        self.assertEqual(recover.message_direction({"direction": "inbound"}), "in")
        self.assertEqual(recover.message_direction({"type": "sent"}), "out")
        self.assertEqual(recover.message_direction({"from_lead": True}), "in")
        with self.assertRaises(ShapeError):
            recover.message_direction({"who": "somebody"})


def thread(*messages, **kw):
    """Messages are (direction, body) or (direction, body, iso timestamp)."""
    out = []
    for msg in messages:
        row = {"direction": msg[0], "body": msg[1]}
        if len(msg) > 2:
            row["sent_at"] = msg[2]
        out.append(row)
    return {"can_reply": kw.get("can_reply", True), "messages": out,
            "person": {"first_name": "Sam", "company_name": "Acme",
                       "email": kw.get("email", "sam@acme.com")}}


class Decide(unittest.TestCase):
    def plan(self, thread_, note=None, booked=(), views=(), now=WED):
        return recover.decide({"person_id": 1}, thread_, note, CFG,
                              set(booked), set(views), now)

    def test_a_positive_reply_gets_two_times(self):
        plan = self.plan(thread(("out", "hi"), ("in", "can you send me pricing?")))
        self.assertEqual(plan["action"], "send")
        self.assertEqual(plan["bucket"], "send_info")
        self.assertIn("Would either of these work?", plan["message"])

    def test_booked_leads_are_left_alone(self):
        plan = self.plan(thread(("out", "hi"), ("in", "sounds good")),
                         booked={"sam@acme.com"})
        self.assertEqual(plan["action"], "skip")
        self.assertIn("booked", plan["reason"])

    def test_after_we_answer_the_nudge_clock_starts(self):
        # Three days of silence after our answer: nudge. This is the win-back,
        # and it fires whether the answer came from this script or from a human.
        convo = thread(("out", "hi"), ("in", "sounds good"),
                       ("out", "great, when?", "2026-08-30T09:00:00Z"))
        plan = self.plan(convo)
        self.assertEqual(plan["action"], "send")
        self.assertEqual(plan["bucket"], "nudge")

    def test_a_fresh_answer_is_left_alone(self):
        convo = thread(("out", "hi"), ("in", "sounds good"),
                       ("out", "great, when?", "2026-09-02T06:00:00Z"))
        plan = self.plan(convo)
        self.assertEqual(plan["action"], "skip")
        self.assertIn("due in", plan["reason"])

    def test_the_api_reply_cap_is_respected(self):
        # Their message + three of ours = the API's limit. A fourth is a 429.
        convo = thread(("out", "hi"), ("in", "sounds good"),
                       ("out", "a", "2026-08-20T09:00:00Z"),
                       ("out", "b", "2026-08-22T09:00:00Z"),
                       ("out", "c", "2026-08-25T09:00:00Z"))
        plan = self.plan(convo)
        self.assertEqual(plan["action"], "skip")
        self.assertIn("reply cap", plan["reason"])

    def test_booked_in_the_sheet_stops_the_nudge_too(self):
        convo = thread(("out", "hi"), ("in", "sounds good"),
                       ("out", "great", "2026-08-20T09:00:00Z"))
        plan = self.plan(convo, booked={"sam@acme.com"})
        self.assertEqual(plan["action"], "skip")
        self.assertIn("booked", plan["reason"])

    def test_a_negative_reply_is_never_nudged(self):
        convo = thread(("out", "hi"), ("in", "non merci"),
                       ("out", "ok", "2026-08-20T09:00:00Z"))
        self.assertEqual(self.plan(convo)["action"], "skip")

    def test_second_run_over_the_same_reply_does_nothing(self):
        convo = thread(("out", "hi"), ("in", "can you send me pricing?"))
        first = self.plan(convo)
        second = self.plan(convo, note=first["note"])
        self.assertEqual(second["action"], "skip")
        self.assertIn("already handled", second["reason"])

    def test_a_new_reply_after_ours_is_handled_again(self):
        convo = thread(("out", "hi"), ("in", "pricing?"))
        note = self.plan(convo)["note"]
        convo["messages"].append({"direction": "in", "body": "how does it handle GDPR?"})
        self.assertEqual(self.plan(convo, note=note)["bucket"], "question")

    def test_closed_gate_is_respected(self):
        plan = self.plan(thread(("out", "hi"), ("in", "sounds good"), can_reply=False))
        self.assertEqual(plan["action"], "skip")
        self.assertIn("can_reply", plan["reason"])

    def test_not_now_is_queued_not_sent(self):
        plan = self.plan(thread(("out", "hi"), ("in", "not right now, try Q1")))
        self.assertEqual(plan["action"], "queue")
        self.assertEqual(plan["due"], "2026-12-01")
        self.assertNotIn("message", plan)

    def test_a_dated_queue_beats_the_nudge_schedule(self):
        # "recontactez-moi en janvier" must not be nudged in two days.
        convo = thread(("out", "hi"), ("in", "not right now, try Q1"))
        note = self.plan(convo)["note"]
        convo["messages"].append({"direction": "out", "body": "understood",
                                  "sent_at": "2026-09-01T09:00:00Z"})
        soon = self.plan(convo, note=note, now=dt.datetime(2026, 9, 20, 9, tzinfo=UTC))
        self.assertEqual(soon["action"], "skip")
        self.assertIn("queued until", soon["reason"])

        later = self.plan(convo, note=note, now=dt.datetime(2026, 12, 2, 9, tzinfo=UTC))
        self.assertEqual(later["bucket"], "re_engage")

    def test_a_queue_that_is_not_due_stays_quiet(self):
        convo = thread(("out", "hi"), ("in", "not right now, try Q1"))
        note = self.plan(convo)["note"]
        convo["messages"].append({"direction": "out", "body": "understood"})
        self.assertEqual(self.plan(convo, note=note, now=dt.datetime(2026, 10, 1, tzinfo=UTC))
                         ["action"], "skip")


class FakeApi:
    """Enough of Explee for recover.run: one campaign, two conversations."""

    def __init__(self, threads):
        self.threads = threads
        self.notes = {}
        self.sent = []

    def inbox_all(self, cid, tab=None):
        return [{"person_id": pid} for pid in self.threads]

    def thread(self, cid, pid):
        return self.threads[pid]

    def get_note(self, cid, pid):
        return self.notes.get(pid)

    def set_note(self, cid, pid, note):
        self.notes[pid] = note

    def reply(self, cid, pid, message):
        self.sent.append((pid, message))
        return {}


class Run(unittest.TestCase):
    def setUp(self):
        self.api = FakeApi({
            1: thread(("out", "hi"), ("in", "send me pricing"), email="a@x.com"),
            2: thread(("out", "hi"), ("in", "please unsubscribe"), email="b@x.com"),
            3: thread(("out", "hi"), ("in", "not right now, Q1"), email="c@x.com"),
        })

    def run_once(self, apply_=False, cap=25):
        out = io.StringIO()
        tally, sends = recover.run(self.api, CFG, [{"id": 9, "name": "test"}], set(), set(),
                                   WED, apply_, cap, out=out)
        return tally, sends, out.getvalue()

    def test_dry_run_sends_nothing_but_shows_the_mail(self):
        tally, sends, text = self.run_once()
        self.assertEqual(sends, 0)
        self.assertEqual(self.api.sent, [])
        self.assertEqual(self.api.notes, {})
        self.assertIn("Would either of these work?", text)
        self.assertEqual(tally["send_info"], 1)
        self.assertEqual(tally["not_now"], 1)

    def test_apply_sends_once_and_marks_the_note(self):
        _, sends, _ = self.run_once(apply_=True)
        self.assertEqual(sends, 1)
        self.assertEqual([pid for pid, _ in self.api.sent], [1])
        self.assertIn("action=sent", self.api.notes[1])
        self.assertIn("action=queued", self.api.notes[3])       # queued, not sent
        self.assertNotIn(2, self.api.notes)                     # unsubscribe: untouched
        # A second run over the same inbox must be a no-op.
        _, again, _ = self.run_once(apply_=True)
        self.assertEqual(again, 0)

    def test_the_cap_stops_a_runaway(self):
        _, sends, text = self.run_once(apply_=True, cap=0)
        self.assertEqual(sends, 0)
        self.assertIn("hit the 0-per-run cap", text)


class TheSheet(unittest.TestCase):
    """The sheet is the booking source. Misreading it mails someone who booked."""

    CSV = ("email,first_name,booked\n"
           "a@x.com,A,x\n"
           "b@x.com,B,\n"
           "c@x.com,C,no\n"
           "d@x.com,D,2026-09-04\n")

    def test_only_real_marks_count_as_booked(self):
        booked = sheet_mod.Sheet._booked_from_csv(self.CSV)
        self.assertEqual(booked, {"a@x.com", "d@x.com"})

    def test_french_headers_and_case(self):
        csv_text = "E-Mail;RDV\n" .replace(";", ",") + "A@X.com,oui\nb@x.com,non\n"
        self.assertEqual(sheet_mod.Sheet._booked_from_csv(csv_text), {"a@x.com"})

    def test_a_sheet_without_the_columns_raises(self):
        with self.assertRaises(sheet_mod.SheetError) as caught:
            sheet_mod.Sheet._booked_from_csv("name,company\nA,Acme\n")
        self.assertIn("booked column", str(caught.exception))

    def test_an_unreadable_sheet_raises_rather_than_returning_empty(self):
        def boom(req, timeout=None):
            raise OSError("network down")
        sheet = sheet_mod.Sheet(csv_url="https://example.com/x.csv", opener=boom)
        with self.assertRaises(sheet_mod.SheetError):
            sheet.booked_emails()

    def test_read_only_mode_appends_nothing_and_says_so(self):
        sheet = sheet_mod.Sheet(csv_url="https://example.com/x.csv")
        self.assertIsNone(sheet.append([{"email": "a@x.com"}]))

    def test_is_booked_edge_cases(self):
        for value in ("", "  ", "no", "NON", "false", "0", "-"):
            self.assertFalse(sheet_mod.is_booked(value), value)
        for value in ("x", "oui", "YES", "true", "2026-09-04", "✔"):
            self.assertTrue(sheet_mod.is_booked(value), value)


class Leads(unittest.TestCase):
    def test_cleaning_drops_and_dedupes(self):
        rows = [{"email": "a@x.com", "first_name": "A", "last_name": "B",
                 "company_domain": "x.com", "job_title": "CEO"},
                {"email": "A@X.com ", "first_name": "A", "last_name": "B",
                 "company_domain": "x.com", "job_title": "CEO"},
                {"email": "c@y.com", "first_name": "C", "last_name": "",
                 "company_domain": "y.com", "job_title": "CTO"}]
        leads, dropped = lst.clean_leads(rows)
        self.assertEqual(len(leads), 1)
        self.assertEqual(sum(dropped.values()), 2)

    def test_the_other_arm_is_excluded(self):
        rows = [{"email": "a@x.com", "first_name": "A", "last_name": "B",
                 "company_domain": "x.com", "job_title": "CEO"}]
        leads, dropped = lst.clean_leads(rows, exclude={"a@x.com"})
        self.assertEqual(leads, [])
        self.assertTrue(dropped)


class Bridge(unittest.TestCase):
    """The Instantly -> AutoGTM mapping, against the shape a real list-leads returns."""

    REAL = {"items": [{
        "id": "1", "email": "Louise@daisyapp.fr", "first_name": "Louise",
        "last_name": "De Longuemar", "company_name": "Daisy",
        "company_domain": "daisyapp.fr", "job_title": "Founder & CEO",
        "payload": {"linkedIn": "linkedin.com/in/louise-x", "companyDomain": "daisyapp.fr",
                    "jobTitle": "Founder & CEO"}}]}

    def test_maps_and_normalises(self):
        rows, dropped = il.convert(self.REAL, signal="website_funding")
        self.assertEqual(dropped, {})
        row = rows[0]
        self.assertEqual(row["email"], "louise@daisyapp.fr")          # lowercased
        self.assertEqual(row["linkedin_url"], "https://linkedin.com/in/louise-x")
        self.assertEqual(row["company_domain"], "daisyapp.fr")
        self.assertEqual(row["signal"], "website_funding")

    def test_falls_back_into_the_payload(self):
        lead = {"email": "a@x.com", "first_name": "A", "last_name": "B",
                "payload": {"companyDomain": "x.com", "jobTitle": "CTO"}}
        rows, _ = il.convert([lead])
        self.assertEqual(rows[0]["company_domain"], "x.com")
        self.assertEqual(rows[0]["job_title"], "CTO")

    def test_drops_what_autogtm_would_reject(self):
        rows, dropped = il.convert([{"email": "", "first_name": "N", "last_name": "X",
                                     "company_domain": "x.com", "job_title": "CEO"}])
        self.assertEqual(rows, [])
        self.assertIn("missing email", "".join(dropped))

    def test_dedupes_on_email(self):
        rows, dropped = il.convert(list(self.REAL["items"]) * 2)
        self.assertEqual(len(rows), 1)
        self.assertEqual(dropped["duplicate email"], 1)

    def test_an_already_absolute_linkedin_url_is_left_alone(self):
        self.assertEqual(il.linkedin("https://www.linkedin.com/in/x"),
                         "https://www.linkedin.com/in/x")


class ArmReading(unittest.TestCase):
    class Api:
        def __init__(self, payload):
            self.payload = payload

        def campaign_analytics(self, campaign_id, period=None):
            return self.payload

    def test_nested_and_flat_analytics_both_read(self):
        nested = self.Api({"analytics": {"emails_sent": 500, "replies": 25, "hot_leads": 6},
                           "spend_usd": 60.0})
        arm = lst.read_arm(nested, {"arm": "c", "campaign_id": 1}, None)
        self.assertEqual((arm["sent"], arm["replies"], arm["hot"], arm["spend"]),
                         (500, 25, 6, 60.0))

    def test_a_missing_field_raises_instead_of_reporting_zero(self):
        api = self.Api({"emails_sent": 500, "hot_leads": 1, "spend": 1.0})
        with self.assertRaises(ShapeError):
            lst.read_arm(api, {"arm": "c", "campaign_id": 1}, None)


class Overlap(unittest.TestCase):
    """The incrementality question: what share of a list can Explee not reach?"""

    def test_accents_and_case_are_not_identity(self):
        self.assertEqual(lst.name_key("Frédéric", "LE GALL"), lst.name_key("frederic", "le gall"))
        self.assertNotEqual(lst.name_key("Marie", "Dupont"), lst.name_key("Marie", "Durand"))

    def test_the_three_buckets(self):
        leads = [
            {"first_name": "Marie", "last_name": "Dupont", "company_domain": "acme.fr"},
            {"first_name": "Jean", "last_name": "Martin", "company_domain": "acme.fr"},
            {"first_name": "Luc", "last_name": "Bernard", "company_domain": "beta.fr"},
        ]
        theirs = {"acme.fr": {lst.name_key("Marie", "Dupont")}}
        same, only_theirs, no_company = lst.classify_overlap(leads, theirs)
        self.assertEqual([l["last_name"] for l in same], ["Dupont"])
        self.assertEqual([l["last_name"] for l in only_theirs], ["Martin"])
        self.assertEqual([l["last_name"] for l in no_company], ["Bernard"])


class Verdict(unittest.TestCase):
    def arm(self, name, sent, replies, hot=0, spend=0.0, leads=None):
        return {"name": name, "sent": sent, "replies": replies, "hot": hot,
                "spend": spend, "leads": leads}

    def test_leads_are_the_denominator_when_both_arms_know_them(self):
        # Same replies, but the variant is only one email into its sequence.
        control = self.arm("c", sent=2000, replies=25, leads=500)
        variant = self.arm("v", sent=500, replies=60, leads=500)
        self.assertEqual(lst.basis_of(control, variant), "leads")
        call, why = lst.verdict(control, variant)
        self.assertEqual(call, "scale", why)      # 12% vs 5% per lead

    def test_it_falls_back_to_emails_for_an_adopted_campaign(self):
        control = self.arm("live", sent=2000, replies=100, leads=None)
        variant = self.arm("v", sent=500, replies=25, leads=500)
        self.assertEqual(lst.basis_of(control, variant), "sent")

    def test_small_sample_waits(self):
        call, _ = lst.verdict(self.arm("c", 100, 8), self.arm("v", 100, 20))
        self.assertEqual(call, "wait")

    def test_too_few_replies_waits(self):
        call, _ = lst.verdict(self.arm("c", 500, 3), self.arm("v", 500, 6))
        self.assertEqual(call, "wait")

    def test_a_real_doubling_scales(self):
        call, why = lst.verdict(self.arm("c", 500, 25), self.arm("v", 500, 60))
        self.assertEqual(call, "scale", why)

    def test_a_small_edge_is_dropped(self):
        call, _ = lst.verdict(self.arm("c", 5000, 250), self.arm("v", 5000, 310))
        self.assertEqual(call, "drop")

    def test_noise_is_dropped(self):
        call, _ = lst.verdict(self.arm("c", 500, 25), self.arm("v", 500, 28))
        self.assertEqual(call, "drop")


class Client(unittest.TestCase):
    def opener(self, script):
        calls = []

        def fake(req, timeout=None):
            calls.append(req.full_url)
            status, body = script.pop(0)
            if status != 200:
                raise urllib.error.HTTPError(req.full_url, status, "err", {},
                                             io.BytesIO(json.dumps(body).encode()))

            class Response(io.BytesIO):
                def __enter__(self_inner):
                    return self_inner

                def __exit__(self_inner, *exc):
                    return False
            return Response(json.dumps(body).encode())
        fake.calls = calls
        return fake

    def client(self, script):
        opener = self.opener(script)
        api = Explee(api_key="k", opener=opener, sleep=lambda _s: None)
        return api, opener

    def test_429_is_retried(self):
        api, opener = self.client([(429, {}), (200, {"remain": 4200})])
        self.assertEqual(api.balance(), 4200)
        self.assertEqual(len(opener.calls), 2)

    def test_402_is_not_retried(self):
        api, opener = self.client([(402, {"detail": "no credits"})])
        with self.assertRaises(ExpleeError) as caught:
            api.balance()
        self.assertEqual(caught.exception.status, 402)
        self.assertEqual(len(opener.calls), 1)

    def test_403_on_reply_is_not_retried(self):
        api, opener = self.client([(403, {"detail": "unsubscribe"})])
        with self.assertRaises(ExpleeError):
            api.reply(1, 2, "hi")
        self.assertEqual(len(opener.calls), 1)

    def test_query_params_drop_the_empty_ones(self):
        api, opener = self.client([(200, {"campaigns": []})])
        api.campaigns(project_id=None)
        self.assertNotIn("?", opener.calls[0])

    def test_first_of_says_what_it_looked_for(self):
        with self.assertRaises(ShapeError) as caught:
            first_of({"reply_count": 3}, "replies", "replied")
        self.assertIn("reply_count", str(caught.exception))


class Baseline(unittest.TestCase):
    def test_no_show_rate_is_called_out(self):
        out = io.StringIO()
        baseline.report({"label": "2026-08", "spend": 500.0, "sent": 900, "replies": 55,
                         "hot": 30, "booked": 10, "showed": 5}, out=out)
        text = out.getvalue()
        self.assertIn("$50.00", text)      # per booked call
        self.assertIn("$100.00", text)     # per call that showed up - the real number
        self.assertIn("50% of booked calls did not show", text)

    def test_missing_calendar_numbers_say_so(self):
        out = io.StringIO()
        baseline.report({"label": "x", "spend": 1.0, "sent": 1, "replies": 1, "hot": 1}, out=out)
        self.assertIn("unknown", out.getvalue())


if __name__ == "__main__":
    unittest.main(verbosity=2)
