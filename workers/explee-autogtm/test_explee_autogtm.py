#!/usr/bin/env python3
"""python3 test_explee_autogtm.py - no network, no key needed.

The tests that matter here are the ones about NOT sending: an unsubscribe, a
lead who already booked, a thread a human already answered, a second run over
the same reply. Those are the failure modes that cost a domain.
"""

import datetime as dt
import io
import json
from pathlib import Path
import unittest
import unittest.mock
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

    def hot_leads(self, campaign_id=None, limit=100):
        return []


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

    def test_it_collects_what_the_sheet_should_show(self):
        updates = []
        out = io.StringIO()
        recover.run(self.api, CFG, [{"id": 9, "name": "test"}], set(), set(), WED, False, 25,
                    out=out, updates=updates)
        rows = {u["email"]: u for u in updates}
        self.assertEqual(rows["a@x.com"]["last_reply"], "send me pricing")
        self.assertEqual(rows["a@x.com"]["followups_sent"], 0)
        self.assertIn("sent", rows["a@x.com"]["next_action"])
        self.assertIn("unsubscribe", rows["b@x.com"]["next_action"])

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

    def test_a_pasted_edit_url_becomes_a_csv_url(self):
        edit = "https://docs.google.com/spreadsheets/d/ABC123_x-y/edit?gid=42#gid=42"
        self.assertEqual(sheet_mod.csv_url_for(edit),
                         "https://docs.google.com/spreadsheets/d/ABC123_x-y/"
                         "export?format=csv&gid=42")
        pub = "https://docs.google.com/spreadsheets/d/e/2PACX-z/pub?output=csv"
        self.assertEqual(sheet_mod.csv_url_for(pub), pub)
        self.assertEqual(sheet_mod.csv_url_for("https://example.com/x.csv"),
                         "https://example.com/x.csv")

    def test_a_sign_in_page_is_not_parsed_as_an_empty_sheet(self):
        with self.assertRaises(sheet_mod.SheetError) as caught:
            sheet_mod.Sheet._from_csv("<!DOCTYPE html><html><title>Sign in</title>")
        self.assertIn("Anyone with the link", str(caught.exception))

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


# --- change 1: the sequence -----------------------------------------------------
import prequalify as pq
import sequence as sq
import state as state_mod
import tempfile

# Every task writes reports/state.json. The tests write it somewhere disposable.
_STATE_DIR = tempfile.TemporaryDirectory()
state_mod.STATE = Path(_STATE_DIR.name) / "state.json"


class SequenceReading(unittest.TestCase):
    def test_step_is_how_many_we_sent_before_they_wrote(self):
        msgs, _ = recover.thread_view(thread(("out", "1"), ("out", "2"), ("out", "3"),
                                             ("in", "ok tell me more")))
        self.assertEqual(sq.reply_step(msgs), 3)

    def test_a_lead_who_wrote_first_has_no_step(self):
        msgs, _ = recover.thread_view(thread(("in", "hello?")))
        self.assertIsNone(sq.reply_step(msgs))
        msgs, _ = recover.thread_view(thread(("out", "1"), ("out", "2")))
        self.assertIsNone(sq.reply_step(msgs))

    def test_lengths_in_every_shape(self):
        self.assertEqual(sq.sequence_length(3), 4)
        self.assertEqual(sq.sequence_length([{"delay_days": 3}, {"delay_days": 4}]), 3)
        self.assertEqual(sq.sequence_length({"count": 2, "interval_days": 3}), 3)
        self.assertEqual(sq.sequence_length({"steps": [1, 2, 3]}), 4)
        with self.assertRaises(ShapeError):
            sq.sequence_length("four")
        with self.assertRaises(ShapeError):
            sq.sequence_length({"mystery": 1})

    def test_shortening_keeps_the_shape_and_never_lengthens(self):
        self.assertEqual(sq.shortened(3, 2), 1)
        self.assertEqual(sq.shortened([{"d": 3}, {"d": 4}, {"d": 5}], 2), [{"d": 3}])
        self.assertEqual(sq.shortened({"count": 3, "interval_days": 3}, 2),
                         {"count": 1, "interval_days": 3})
        self.assertEqual(sq.shortened({"steps": [1, 2, 3]}, 1), {"steps": []})
        with self.assertRaises(ValueError):
            sq.shortened(3, 4)
        with self.assertRaises(ValueError):
            sq.shortened(3, 0)


class SequenceTally(unittest.TestCase):
    OLD = "2026-08-01T09:00:00Z"
    NEW = "2026-09-01T09:00:00Z"

    def threads(self):
        return [
            thread(("out", "1", self.OLD), ("in", "send me pricing")),           # step 1, +
            thread(("out", "1", self.OLD), ("out", "2"), ("in", "non merci")),   # step 2, -
            thread(("out", "1", self.OLD), ("out", "2"), ("out", "3"),
                   ("in", "open pour un échange")),                              # step 3, +
            thread(("out", "1", self.OLD), ("in", "I am out of the office until")),  # auto
            thread(("out", "1", self.NEW), ("in", "yes")),                       # too young
            thread(("out", "1"), ("in", "ok")),                                  # no timestamp
        ]

    def test_counts_by_step_and_kind(self):
        tally = sq.tally_steps(self.threads(), WED)
        self.assertEqual(tally["replies"], {1: 2, 2: 1, 3: 1})
        self.assertEqual(tally["positive"], {1: 1, 3: 1})      # "ok" is unknown, not a yes
        self.assertEqual(tally["auto"], 1)
        self.assertEqual(tally["young"], 1)
        self.assertEqual(tally["unknown_age"], 1)

    def test_arithmetic(self):
        rows = sq.arithmetic({1: 50, 2: 20, 3: 20, 4: 10}, 4)
        by = {r["emails"]: r for r in rows}
        self.assertAlmostEqual(by[2]["share"], 0.7)
        self.assertAlmostEqual(by[2]["cost_ratio"], 0.5 / 0.7)
        self.assertAlmostEqual(by[2]["pool_burn"], 2.0)
        self.assertAlmostEqual(by[4]["cost_ratio"], 1.0)

    def test_it_recommends_only_a_real_cut(self):
        strong = {"replies": {1: 50, 2: 20, 3: 5, 4: 5}, "positive": {}, "auto": 0,
                  "young": 0, "unknown_age": 0, "no_step": 0}
        pick, basis, _, _ = sq.recommend(strong, 4)
        self.assertEqual((pick, basis), (2, "replies"))
        flat = {"replies": {1: 20, 2: 20, 3: 20, 4: 20}, "positive": {}, "auto": 0,
                "young": 0, "unknown_age": 0, "no_step": 0}
        self.assertIsNone(sq.recommend(flat, 4)[0])

    def test_too_few_replies_says_wait(self):
        thin = {"replies": {1: 5, 2: 1}, "positive": {}, "auto": 0, "young": 0,
                "unknown_age": 0, "no_step": 0}
        pick, _, rows, why = sq.recommend(thin, 4)
        self.assertIsNone(pick)
        self.assertEqual(rows, [])
        self.assertIn("needs 30", why)

    def test_positives_decide_when_there_are_enough(self):
        tally = {"replies": {1: 20, 2: 20, 3: 20, 4: 20},
                 "positive": {1: 10, 2: 5, 3: 0, 4: 0}, "auto": 0, "young": 0,
                 "unknown_age": 0, "no_step": 0}
        pick, basis, _, _ = sq.recommend(tally, 4)
        self.assertEqual((pick, basis), (2, "positive"))


class FakeSequenceApi:
    def __init__(self, followups, threads):
        self.followups = followups
        self.threads = threads
        self.patched = []

    def balance(self):
        return 500

    def campaign(self, cid):
        return {"id": cid, "name": "test", "followups": self.followups}

    def inbox_all(self, cid, tab=None):
        return [{"person_id": i} for i in range(len(self.threads))]

    def thread(self, cid, pid):
        return self.threads[pid]

    def update_campaign(self, cid, fields):
        self.patched.append((cid, fields))
        self.followups = fields["followups"]
        return self.campaign(cid)


class SequenceRun(unittest.TestCase):
    def test_measure_reports_and_recommends(self):
        threads = ([thread(("out", "1", SequenceTally.OLD), ("in", "tell me more"))] * 30
                   + [thread(("out", "1", SequenceTally.OLD), ("out", "2"), ("out", "3"),
                             ("out", "4"), ("in", "tell me more"))] * 5)
        api = FakeSequenceApi([{"d": 3}, {"d": 3}, {"d": 3}], threads)
        out = io.StringIO()
        got = sq.measure_campaign(api, 7, WED, 14, out=out)
        self.assertEqual(got["emails"], 4)
        self.assertEqual(got["recommend"], 1)
        self.assertIn("SHORTEN to 1", out.getvalue())

    def test_shorten_is_gated_and_dry_by_default(self):
        threads = [thread(("out", "1", SequenceTally.OLD), ("out", "2"), ("out", "3"),
                          ("out", "4"), ("in", "tell me more"))] * 40
        api = FakeSequenceApi([{"d": 3}] * 3, threads)
        with unittest.mock.patch.object(sq, "Explee", lambda: api):
            with self.assertRaises(SystemExit):            # all replies on step 4: refused
                sq.main(["shorten", "--campaign", "7", "--emails", "2"])
            self.assertEqual(api.patched, [])
            sq.main(["shorten", "--campaign", "7", "--emails", "2", "--force"])
            self.assertEqual(api.patched, [])              # dry run
            sq.main(["shorten", "--campaign", "7", "--emails", "2", "--force", "--apply"])
        self.assertEqual(api.patched, [(7, {"followups": [{"d": 3}]})])


# --- change 2: pre-qualification ---------------------------------------------------
class Prequalify(unittest.TestCase):
    DEF = {"name": "High ticket", "project_id": 30475,
           "target_role": "Directeur commercial", "target_geography": "France",
           "target_company_size": "50-500 employees",
           "positive_criteria": "Sells B2B services\nHas an outbound sales team",
           "negative_criteria": ["Recruitment agency"], "keywords": ["ESN", "conseil"],
           "instructions": "one email", "followup_instructions": "short", "language": "fr"}

    def test_the_target_reads_as_a_query(self):
        self.assertEqual(pq.describe_target(self.DEF),
                         "Directeur commercial at companies of 50-500 employees "
                         "in ESN, conseil in France")

    def test_criteria_from_both_lists(self):
        self.assertEqual(pq.criteria_from(self.DEF),
                         ["Sells B2B services", "Has an outbound sales team",
                          "Is NOT the following: Recruitment agency"])
        self.assertEqual(pq.criteria_from({"positive_criteria": ["a"] * 9}), ["a"] * 5)
        self.assertEqual(pq.criteria_from({"customer_problem": "no leads"}),
                         ["Likely has this problem: no leads"])

    def test_cost_has_a_free_zone(self):
        search, emails = pq.search_cost(100, ["a", "b"])
        self.assertEqual((search, emails), (0.0, 150.0))
        search, _ = pq.search_cost(1000, ["a", "b", "c", "d"])
        self.assertAlmostEqual(search, 900 * 1.4)

    def test_scores_in_three_shapes(self):
        self.assertEqual(pq.scores_of({"criteria": [{"criterion": "a", "score": 5},
                                                    {"criterion": "b", "score": 3}]}), [5, 3])
        self.assertEqual(pq.scores_of({"scores": {"a": 4, "b": 4}}), [4, 4])
        self.assertTrue(pq.qualifies({"criteria_scores": [4, 5]}))
        self.assertFalse(pq.qualifies({"criteria_scores": [4, 2]}))
        with self.assertRaises(ShapeError):
            pq.scores_of({"first_name": "A"})

    def test_search_pages_and_stops(self):
        class Api:
            def __init__(self):
                self.bodies = []

            def search_people(self, body):
                self.bodies.append(body)
                offset = body["offset"]
                rows = [{"first_name": str(i), "criteria": [{"score": 5}]}
                        for i in range(offset, min(offset + body["limit"], 150))]
                return {"people": rows}
        api = Api()
        plan = {"company_filters": {"definition": "x"}, "people_filters": {"job_titles": ["CEO"]},
                "criteria": ["a"]}
        people = pq.search_pages(api, plan, 400, page=100)
        self.assertEqual(len(people), 150)
        self.assertEqual([b["offset"] for b in api.bodies], [0, 100])
        self.assertEqual(api.bodies[0]["people_filters"]["criteria"], ["a"])

    def test_missing_emails_are_filled_from_the_batch(self):
        class Api:
            def enrich_email_batch(self, contacts, preset="basic"):
                self.asked = contacts
                return {"task_id": "t1"}

            def enrich_email_batch_status(self, task_id):
                return {"meta": {"status": "completed"},
                        "contacts": [{"email": "a@x.com"}, {"email": None}]}
        leads = [{"email": "", "first_name": "A", "last_name": "B", "company_domain": "x.com"},
                 {"email": "", "first_name": "C", "last_name": "D", "company_domain": "y.com"},
                 {"email": "e@z.com", "first_name": "E", "last_name": "F",
                  "company_domain": "z.com"}]
        api = Api()
        found, asked = pq.fill_emails(api, leads, sleep=lambda s: None)
        self.assertEqual((found, asked), (1, 2))
        self.assertEqual(len(api.asked), 2)
        self.assertEqual(leads[0]["email"], "a@x.com")
        self.assertEqual(leads[1]["email"], "")

    def test_import_strips_scores_and_writes_both_arms(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            plan = {"campaign_id": 1, "project_id": 30475, "name": "High ticket",
                    "brief": {"instructions": "x", "followup_instructions": "", "language": "fr"},
                    "brief_sha": "abcd1234"}
            (Path(tmp) / "plan.json").write_text(json.dumps(plan))
            (Path(tmp) / "leads.json").write_text(json.dumps(
                [{"email": "a@x.com", "first_name": "A", "last_name": "B",
                  "company_domain": "x.com", "job_title": "CEO", "_scores": [5]}]))

            class Api:
                def balance(self):
                    return 100

                def import_campaign(self, project_id, name, leads, **brief):
                    self.leads, self.brief = leads, brief
                    return {"task_id": "t"}

                def import_status(self, task_id):
                    return {"status": "completed", "result": {"campaign_id": 999}}
            api = Api()
            with unittest.mock.patch.object(pq, "Explee", lambda: api):
                pq.main(["import", "--plan", str(Path(tmp) / "plan.json"),
                         "--leads", str(Path(tmp) / "leads.json"),
                         "--out", str(Path(tmp) / "q.arm.json"),
                         "--control-out", str(Path(tmp) / "c.arm.json"), "--apply"])
            self.assertNotIn("_scores", api.leads[0])
            self.assertEqual(api.brief["language"], "fr")
            variant = json.loads((Path(tmp) / "q.arm.json").read_text())
            control = json.loads((Path(tmp) / "c.arm.json").read_text())
            self.assertEqual(variant["campaign_id"], 999)
            self.assertEqual(control["campaign_id"], 1)
            self.assertEqual(variant["brief_sha"], control["brief_sha"])
            self.assertTrue(control["live_campaign"])




# --- change 3: the note is the interface, the report is the visibility ---------
class NoteFlag(unittest.TestCase):
    def test_booked_and_stop_in_both_languages(self):
        self.assertEqual(recover.human_flag("booked 12/09"), "booked")
        self.assertEqual(recover.human_flag("RDV pris jeudi"), "booked")
        self.assertEqual(recover.human_flag("stop"), "stop")
        self.assertEqual(recover.human_flag("ne pas relancer, déjà client"), "stop")
        self.assertIsNone(recover.human_flag("Met at SaaStock. Wants phone data."))
        self.assertIsNone(recover.human_flag(None))

    def test_our_own_block_never_counts_as_a_flag(self):
        note = recover.write_marker("", [{"at": "2026-09-02T10:00Z", "bucket": "nudge",
                                          "msg": "abc123", "action": "sent"}], "en")
        self.assertIn('Type "booked" or "stop"', note)      # the instruction line
        self.assertIsNone(recover.human_flag(note))          # ...is not a flag
        self.assertEqual(recover.human_flag("booked\n" + note), "booked")

    def test_status_line_is_readable_and_parsed_around(self):
        entries = [{"at": "2026-09-06T07:00Z", "bucket": "nudge", "msg": "a", "action": "sent"}]
        note = recover.write_marker("client important", entries, "fr")
        self.assertIn("Suivi LinkFinder — 2026-09-06 : relance envoyée", note)
        self.assertEqual(recover.read_marker(note), entries)
        self.assertEqual(recover.human_part(note), "client important")

    def test_booked_in_the_note_stops_everything(self):
        convo = thread(("out", "hi"), ("in", "send me pricing"))
        plan = recover.decide({}, convo, "booked", CFG, set(), set(), WED)
        self.assertEqual(plan["action"], "skip")
        self.assertIn("booked", plan["reason"])
        convo["messages"].append({"direction": "out", "body": "here", "sent_at": "2026-08-20T09:00:00Z"})
        plan = recover.decide({}, convo, "stop", CFG, set(), set(), WED)
        self.assertEqual(plan["action"], "skip")


class Report(unittest.TestCase):
    def rows(self):
        return [{"email": "a@x.com", "first_name": "Ana", "company": "Acme", "campaign": "HT",
                 "campaign_id": 9, "person_id": 1, "last_reply": "send me pricing | now",
                 "followups_sent": 0, "action": "send", "bucket": "send_info",
                 "next_action": "sent send_info today", "sent": True},
                {"email": "b@x.com", "first_name": "Bo", "company": "Beta", "campaign": "HT",
                 "campaign_id": 9, "person_id": 2, "last_reply": "non merci",
                 "followups_sent": 0, "action": "skip", "bucket": "negative",
                 "next_action": "none - negative", "sent": False}]

    def test_report_names_everyone_and_the_mode(self):
        hot = [{"email": "c@x.com", "first_name": "Cy", "company": "Gamma", "job_title": "CEO",
                "campaign": "HT", "replied_at": "2026-09-05"}]
        text = recover.render_report("linkfinderai", 30475, WED, True, {"send_info": 1},
                                     1, self.rows(), hot)
        self.assertIn("SENT 1 email", text)
        self.assertIn("| Ana (Acme) | HT | send me pricing / now | sent send_info |", text)
        self.assertIn("| Bo (Beta) | HT | non merci | none - negative |", text)
        self.assertIn("Cy (Gamma) | CEO | HT | 2026-09-05 | no reply thread yet", text)
        self.assertIn("app-auto-gtm/p/30475/inbox", text)
        rows = self.rows(); rows[0]["sent"] = False
        dry = recover.render_report("x", 1, WED, False, {}, 0, rows, [])
        self.assertIn("DRY RUN", dry)
        self.assertIn("would send send_info", dry)

    def test_the_run_fills_the_rows_the_report_needs(self):
        api = FakeApi({1: thread(("out", "hi"), ("in", "send me pricing"), email="a@x.com")})
        updates = []
        recover.run(api, CFG, [{"id": 9, "name": "test"}], set(), set(), WED, True, 25,
                    out=io.StringIO(), updates=updates)
        row = updates[0]
        self.assertEqual((row["first_name"], row["company"], row["campaign"], row["sent"]),
                         ("Sam", "Acme", "test", True))



# --- the status page -------------------------------------------------------------
import report_page


class StatePage(unittest.TestCase):
    def test_state_keeps_sections_and_a_bounded_run_log(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "state.json"
            for i in range(45):
                state_mod.record("followups", "run {}".format(i), False, path=path)
            data = state_mod.record("measure", "measured", False, section="measure",
                                    payload={"campaigns": []}, balance=1234.0, path=path)
            self.assertEqual(len(data["runs"]), state_mod.MAX_RUNS)
            self.assertEqual(data["runs"][0]["task"], "measure")
            self.assertEqual(data["measure"]["campaigns"], [])
            self.assertEqual(state_mod.load(path)["balance"], 1234.0)

    def test_page_shows_the_loop_the_measure_and_the_warnings(self):
        data = {
            "balance": 2500.0,
            "runs": [{"at": "2026-09-06T07:00:00Z", "task": "followups", "applied": False,
                      "outcome": "3 replied leads read"}],
            "followups": {"at": "2026-09-06T07:00:00Z", "applied": False, "project_id": 30475,
                          "sends": 0, "tally": {"send_info": 1, "skip: negative": 1},
                          "rows": [{"email": "a@x.com", "first_name": "Ana", "company": "Acme",
                                    "campaign": "HT", "last_reply": "send <pricing>",
                                    "action": "send", "bucket": "send_info", "sent": False,
                                    "next_action": "sent send_info today"},
                                   {"email": "b@x.com", "first_name": "Bo", "company": "Beta",
                                    "campaign": "HT", "last_reply": "non merci",
                                    "action": "skip", "bucket": "negative", "sent": False,
                                    "next_action": "none - negative"}],
                          "hot": [{"email": "c@x.com", "first_name": "Cy", "company": "G",
                                   "job_title": "CEO", "campaign": "HT",
                                   "replied_at": "2026-09-05T10:00:00Z"}]},
            "measure": {"at": "2026-09-06T07:30:00Z", "campaigns": [
                {"name": "HT", "emails": 4, "recommend": 2, "why": "2 emails keep 85%",
                 "tally": {"replies": {"1": 20, "2": 14, "3": 4, "4": 2},
                           "positive": {"1": 5}, "auto": 3, "young": 7, "no_step": 1}}]},
            "prequalify": {"at": "2026-09-06T08:00:00Z", "applied": True, "source_name": "HT",
                           "searched": 900, "qualified": 300, "usable": 250, "min_score": 4,
                           "criteria": ["Sells B2B"], "campaign_id": 999,
                           "compare_after": "2026-09-20"},
        }
        page = report_page.render(data)
        self.assertIn('name="robots" content="noindex', page)
        self.assertIn("balance 2500 credits ($25.00)", page)
        self.assertIn("would send send_info", page)
        self.assertIn("send &lt;pricing&gt;", page)          # escaped, never raw
        self.assertIn("no reply thread yet", page)
        self.assertIn("shorten to 2", page)
        self.assertIn("app-auto-gtm/p/30475/inbox", page)
        self.assertIn("2026-09-20", page)
        self.assertNotIn("<script", page)
        empty = report_page.render({"runs": []})
        self.assertIn("has not run yet", empty)


class InboxShape(unittest.TestCase):
    def test_an_unknown_inbox_key_raises_instead_of_reading_as_empty(self):
        api = Explee(api_key="k", opener=None)
        api.request = lambda *a, **k: {"surprise": [{"person_id": 1}]}
        with self.assertRaises(ShapeError):
            api.inbox(9, tab="replied")
        api.request = lambda *a, **k: {"leads": [{"person_id": 1}]}
        self.assertEqual(api.inbox(9), [{"person_id": 1}])
        api.request = lambda *a, **k: [{"person_id": 2}]
        self.assertEqual(api.inbox(9), [{"person_id": 2}])

    def test_the_run_survives_an_unreadable_inbox(self):
        class Broken(FakeApi):
            def inbox_all(self, cid, tab=None):
                raise ShapeError("none of [...] in this payload")
        tally, sends = recover.run(Broken({}), CFG, [{"id": 9, "name": "t"}], set(), set(),
                                   WED, True, 25, out=io.StringIO())
        self.assertEqual(sends, 0)
        self.assertEqual(tally, {"error: inbox unreadable": 1})


class RealShapes(unittest.TestCase):
    """The payloads as api.explee.com actually returned them on 6 Sept 2026."""
    THREAD = {"can_reply": True, "reply_blocked_reason": None, "latest_intent": "hot_lead",
              "lead": {"name": "Tom Guerreau", "email": "tom@prescient.studio",
                       "job_title": "Founder", "company_name": "Prescient",
                       "company_domain": "prescient.studio", "note": None},
              "messages": [
                  {"type": "sent", "from_email": "p@x.com", "to_email": "tom@prescient.studio",
                   "body_text": "Bonjour Tom, ...", "ts": "2026-09-04T07:25:11.504036Z"},
                  {"type": "reply", "from_email": "tom@prescient.studio",
                   "body_text": "Hi Pete, any reference / resource presenting your work that "
                                "I could review?", "intent": "hot_lead",
                   "ts": "2026-09-04T07:39:54Z"},
                  {"type": "sent", "body_text": "Bien sûr Tom, voici ...",
                   "ts": "2026-09-04T08:02:40.471903Z"}]}

    def test_thread_reads_direction_body_and_time(self):
        msgs, can = recover.thread_view(self.THREAD)
        self.assertTrue(can)
        self.assertEqual([m["direction"] for m in msgs], ["out", "in", "out"])
        self.assertIn("any reference", msgs[1]["text"])
        self.assertEqual(msgs[2]["at"].isoformat(), "2026-09-04T08:02:40.471903+00:00")
        who = recover.person_fields({"person_id": "d8b1"}, self.THREAD)
        self.assertEqual(who, {"first_name": "Tom", "company": "Prescient",
                               "email": "tom@prescient.studio"})

    def test_a_quiet_hot_lead_gets_the_nudge_after_two_days(self):
        # Explee's auto-reply already answered (message 3); two days later, nudge.
        now = dt.datetime(2026, 9, 7, 9, 0, tzinfo=UTC)
        plan = recover.decide({}, self.THREAD, None, CFG, set(), set(), now)
        self.assertEqual((plan["action"], plan["bucket"]), ("send", "nudge"))
        soon = dt.datetime(2026, 9, 5, 9, 0, tzinfo=UTC)
        self.assertEqual(recover.decide({}, self.THREAD, None, CFG, set(), set(), soon)["action"],
                         "skip")

    def test_the_sequence_field(self):
        self.assertEqual(sq.sequence_length({"max_touches": 2, "delay_days": 3}), 3)
        self.assertEqual(sq.shortened({"max_touches": 2, "delay_days": 3}, 2),
                         {"max_touches": 1, "delay_days": 3})
        self.assertEqual(sq.reply_step(recover.thread_view(self.THREAD)[0]), 1)

    def test_inbox_and_hot_leads_keys(self):
        api = Explee(api_key="k")
        api.request = lambda *a, **k: {"contacts": [{"person_id": "d8b1"}], "total": 103,
                                       "has_more": True, "next_offset": 1}
        self.assertEqual(api.inbox(127292, tab="replied"), [{"person_id": "d8b1"}])
        api.request = lambda *a, **k: {"leads": [{"name": "Meyer Wassermann",
                                                  "email": "meyer@amenagence.com",
                                                  "company_name": "Amen.",
                                                  "job_title": "Co-Founder",
                                                  "person_id": "31e0", "campaign_id": 130465,
                                                  "became_hot_at": "2026-09-04T14:58:49Z"}],
                                       "total": 18}
        rows = recover.collect_hot_leads(api, [{"id": 130465, "name": "ht2"}], 30475)
        self.assertEqual(rows[0]["first_name"], "Meyer")
        self.assertEqual(rows[0]["company"], "Amen.")


if __name__ == "__main__":
    unittest.main(verbosity=2)
