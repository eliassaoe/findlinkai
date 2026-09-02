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
import leadsource_test as lst
import recover
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
    return {"can_reply": kw.get("can_reply", True),
            "messages": [{"direction": d, "body": b} for d, b in messages],
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

    def test_a_human_answer_stops_us(self):
        plan = self.plan(thread(("out", "hi"), ("in", "sounds good"), ("out", "great, when?")))
        self.assertEqual(plan["action"], "skip")
        self.assertEqual(plan["reason"], "already answered")

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

    def test_a_due_queue_fires_even_though_we_already_answered(self):
        convo = thread(("out", "hi"), ("in", "not right now, try Q1"))
        note = self.plan(convo)["note"]
        convo["messages"].append({"direction": "out", "body": "understood, talk in Q1"})
        later = self.plan(convo, note=note, now=dt.datetime(2026, 12, 2, 9, tzinfo=UTC))
        self.assertEqual(later["action"], "send")
        self.assertEqual(later["bucket"], "re_engage")
        # ...and only once.
        self.assertEqual(self.plan(convo, note=later["note"],
                                   now=dt.datetime(2026, 12, 3, 9, tzinfo=UTC))["action"],
                         "skip")

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


class Verdict(unittest.TestCase):
    def arm(self, name, sent, replies, hot=0, spend=0.0):
        return {"name": name, "sent": sent, "replies": replies, "hot": hot, "spend": spend}

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
