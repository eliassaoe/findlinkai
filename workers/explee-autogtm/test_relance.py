#!/usr/bin/env python3
"""Tests de relance.py / relance_page.py — sans réseau, sans clé.

    python3 test_relance.py
"""
import json
import os
import re
import sys
import unittest
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import relance as R  # noqa: E402

REF = datetime(2026, 10, 6, 20, 0, tzinfo=R.TZ)


def lead(name):
    for l, t in R.demo_data()["leads"]:
        if l["first_name"] == name:
            return l, t
    raise KeyError(name)


class Phones(unittest.TestCase):
    def test_signature_split_over_two_lines(self):
        self.assertEqual(R.extract_phones("Xavier\nT+41\n27 588 00 98\n\nP+41\n79 412 87 80"),
                         ["+41794128780", "+41275880098"])  # mobile d'abord

    def test_french_formats(self):
        self.assertEqual(R.extract_phones("Cdlt\n0762379192"), ["+33762379192"])
        self.assertEqual(R.extract_phones("📱 +33763679767 / +33687132959"), ["+33763679767", "+33687132959"])
        self.assertEqual(R.extract_phones("Tél. 02 38 24 10 10"), ["+33238241010"])

    def test_trunk_zero_and_dedupe(self):
        self.assertEqual(R.extract_phones("+33 (0)6 61 99 29 49 / 06 61 99 29 49 / 08 25 67 10 10"), ["+33661992949"])

    def test_quoted_part_is_ignored(self):
        txt = "Ok\n\nLe lun. 5 oct. 2026 à 09:08, Tom a écrit :\n> appelez le 06 11 22 33 44"
        self.assertEqual(R.extract_phones(txt), [])

    def test_le_inside_a_word_does_not_cut_the_signature(self):
        # « Belle journée » contient « le » : la coupe de citation ne doit pas s'y déclencher
        self.assertEqual(R.extract_phones("Belle journée,\nClaire\n06 87 13 29 59\n"), ["+33687132959"])


class Waiting(unittest.TestCase):
    def test_apres_le(self):
        self.assertEqual(R.detect_wait_until("On peut se parler après le 14", date(2026, 10, 5)), date(2026, 10, 15))

    def test_pas_avant_is_inclusive(self):
        self.assertEqual(R.detect_wait_until("pas avant le 3 novembre", date(2026, 10, 6)), date(2026, 11, 3))

    def test_next_week_and_month(self):
        self.assertEqual(R.detect_wait_until("semaine prochaine", date(2026, 10, 6)), date(2026, 10, 12))
        self.assertEqual(R.detect_wait_until("rappelez-moi en novembre", date(2026, 10, 6)), date(2026, 11, 2))


class Cadence(unittest.TestCase):
    def test_real_explee_shape_ts_and_no_direction_word(self):
        # champ de date réel : « ts » ; sans date du tout, l'ordre de l'API fait foi
        lead = {"person_id": "x", "campaign_id": 1, "email": "a@b.fr", "first_name": "Ana"}
        msgs = [{"direction": "outbound", "ts": "2026-10-01T08:00:00Z", "body": "Bonjour Ana\n\nTom"},
                {"direction": "inbound", "ts": "2026-10-02T08:00:00Z", "body": "Ok pour un échange"},
                {"direction": "outbound", "ts": "2026-10-02T09:00:00Z", "body": "Merci, voici le lien https://cal.link/x\n\nCordialement,\nTom"}]
        v = R.compute(lead, {"messages": msgs}, None, REF)
        self.assertEqual((v["bucket"], v["next"]["key"]), ("today", "email1"))
        undated = [{k: x for k, x in m.items() if k != "ts"} for m in msgs]
        v = R.compute(lead, {"messages": undated}, None, REF)
        self.assertEqual(v["status"], "active")
        self.assertEqual(v["expect_after"], 1)

    def test_english_campaign_gets_english_drafts_and_persona(self):
        lead = {"person_id": "x", "campaign_id": 1, "email": "m@montdior.com", "first_name": "Mickey"}
        msgs = [{"direction": "outbound", "ts": "2026-10-01T08:00:00Z", "body": "Hi Mickey,\n\nWorth a chat?\n\nPete"},
                {"direction": "inbound", "ts": "2026-10-02T08:00:00Z", "body": "Hi Pete, sure."},
                {"direction": "outbound", "ts": "2026-10-02T09:00:00Z", "body": "Great\n\nPete"}]
        v = R.compute(lead, {"messages": msgs}, None, REF, camp={"brand": "LinkFinder AI", "language": "en",
                                                                 "booking": "https://calendly.com/x/15min?month=2026-09"})
        self.assertTrue(v["drafts"]["email1"].startswith("Hi Mickey,"))
        self.assertTrue(v["drafts"]["email1"].endswith("Best,\nPete"))
        self.assertIn("https://calendly.com/x/15min\n", v["drafts"]["email1"] + "\n")
        self.assertIn("Pete from LinkFinder AI", v["drafts"]["call"])

    def test_brand_is_the_project_not_prescient(self):
        v = R.compute(*lead("Xavier"), None, REF, camp={"brand": "Spoctus"})
        self.assertIn("Tom de Spoctus", v["drafts"]["call"])
        self.assertNotIn("budget pub", v["drafts"]["call"])

    def test_signature_words_are_not_a_call_request(self):
        self.assertFalse(R.wants_call("Comment souhaitez-vous procéder ?\nAxel\nMobile : 06 78 97 87 05"))
        self.assertTrue(R.wants_call("Vous pouvez m'appeler demain"))

    def test_english_month_quote_header_is_cut(self):
        t = "Je n'ai reçu aucun calendrier.\nCédric\n\nLe Sep 3, 2026, 11:17 +0200, Thomas <t@x.com>, a écrit :\n> 06 11 22 33 44"
        self.assertEqual(R.strip_quoted(t), "Je n'ai reçu aucun calendrier.\nCédric")

    def test_call_script_recaps_before_proposing(self):
        v = R.compute(*lead("Khaled"), None, REF, camp={"brand": "LinkFinder AI", "offer":
            "Des rendez-vous commerciaux qualifiés, posés dans l'agenda du client, facturés à l'unité."})
        call = v["drafts"]["call"]
        self.assertIn("chez LinkFinder AI, on apporte des rendez-vous", call)
        self.assertLess(call.index("RESITUER"), call.index("PROPOSER LE CRÉNEAU"))
        v = R.compute(*lead("Khaled"), None, REF, camp={"brand": "Prescient", "offer":
            "Prescient (agence fondée par 2 ex-Googlers) pilote l'acquisition : Google Ads, Meta Ads."})
        self.assertIn("Prescient, agence fondée par deux ex-Googlers, pilote l'acquisition.", v["drafts"]["call"])

    def test_misreads_from_real_replies(self):
        jm = "vous encourage à me recontacter sur mon portable après 17h30 ou lundi.\n📞06 82 11 37 76"
        self.assertIsNone(R.detect_wait_until(jm, date(2026, 10, 2)))
        self.assertTrue(R.wants_call(jm))
        self.assertIsNone(R.detect_wait_until("ich sehe im ersten Mail kein Dokument", date(2026, 10, 2)))

    def test_lead_waiting_for_us_is_reply(self):
        v = R.compute(*lead("Jean-Marie"), None, REF)
        self.assertEqual(v["bucket"], "reply")

    def test_requested_wait_shifts_email1(self):
        v = R.compute(*lead("Claire"), None, REF)
        self.assertEqual((v["bucket"], v["next"]["key"], v["next"]["due"]), ("scheduled", "email1", "2026-10-15"))

    def test_teams_and_late_afternoon_go_into_the_draft(self):
        v = R.compute(*lead("Xavier"), None, REF)
        self.assertIn("à 17h ou ", v["drafts"]["email1"])
        self.assertIn("sur Teams", v["drafts"]["email1"])
        self.assertIn("https://cal.link/FdEm9re", v["drafts"]["email1"])
        self.assertTrue(v["drafts"]["email1"].rstrip().endswith("Bien cordialement,\nTom"))

    def test_slots_are_two_later_business_days_never_the_send_day(self):
        for name in ("Xavier", "Jean-Marie", "Claire"):
            v = R.compute(*lead(name), None, REF)
            send = max(REF.date(), date.fromisoformat(v["next"]["due"]))
            d1, d2 = R.two_slot_days(send, date.fromisoformat(v["wait_until"]) if v["wait_until"] else None)
            self.assertGreater(d1, send)
            self.assertGreater(d2, d1)
            self.assertLess(d1.weekday(), 5)
            self.assertLess(d2.weekday(), 5)
            ctx = v["ctx"]
            self.assertEqual(ctx["slot_from"], send.isoformat())
            for key in ("reply", "email1", "email2"):
                self.assertIn(ctx["slot1"], v["drafts"][key].lower(), (name, key))
                self.assertIn(ctx["slot2"], v["drafts"][key], (name, key))
                self.assertNotIn("demain", v["drafts"][key])
                self.assertNotIn("aujourd", v["drafts"][key])

    def test_friday_send_skips_the_weekend(self):
        fri = date(2026, 10, 9)
        self.assertEqual(R.two_slot_days(fri), (date(2026, 10, 12), date(2026, 10, 13)))
        self.assertEqual(R.two_slot_days(date(2026, 10, 10)), (date(2026, 10, 12), date(2026, 10, 13)))

    def test_slot_text_is_absolute(self):
        d = date(2026, 10, 7)
        self.assertEqual(R.slot_text(d, date(2026, 10, 6), 11, "fr"), "mercredi 7 octobre à 11h")
        self.assertEqual(R.slot_text(d, date(2026, 10, 6), 17, "en"), "Wednesday, October 7 at 5pm")

    def _thread(self, *msgs):
        lead = {"person_id": "x", "campaign_id": 1, "email": "a@b.fr", "first_name": "Ana"}
        return lead, {"messages": [{"direction": d, "ts": ts, "body": b} for d, ts, b in msgs]}

    def test_no_relance_before_48h_of_silence(self):
        lead, th = self._thread(("outbound", "2026-10-01T08:00:00Z", "Bonjour Ana\n\nTom"),
                                ("inbound", "2026-10-05T08:00:00Z", "Ok pour un échange"),
                                ("outbound", "2026-10-05T19:00:00Z", "Merci, je vous propose mardi.\n\nTom"))
        v = R.compute(lead, th, None, REF)            # 06/10 20h : 25 h seulement
        self.assertEqual(v["bucket"], "scheduled")
        self.assertFalse(v["relance_ok"])
        self.assertIn("48 h", v["hold"])
        v = R.compute(lead, th, None, datetime(2026, 10, 7, 21, 30, tzinfo=R.TZ))   # 48 h passées
        self.assertEqual((v["bucket"], v["next"]["key"]), ("today", "email1"))
        self.assertTrue(v["relance_ok"])
        self.assertIsNone(v["hold"])

    def test_undated_thread_is_never_relanced_automatically(self):
        lead, th = self._thread(("outbound", "", "Bonjour Ana\n\nTom"), ("inbound", "", "Ok pour un échange"),
                                ("outbound", "", "Merci\n\nTom"))
        for m in th["messages"]:
            m.pop("ts")
        v = R.compute(lead, th, None, REF)
        self.assertFalse(v["relance_ok"])
        self.assertNotEqual(v["bucket"], "today")

    def test_booked_in_thread_stops_everything(self):
        for said in ("C'est noté pour jeudi, merci", "J'ai pris un créneau sur votre agenda",
                     "Rendez-vous confirmé", "I booked a slot, see you then"):
            lead, th = self._thread(("outbound", "2026-10-01T08:00:00Z", "Bonjour Ana\n\nTom"),
                                    ("inbound", "2026-10-02T08:00:00Z", said))
            v = R.compute(lead, th, None, REF)
            self.assertEqual((v["status"], v["bucket"]), ("booked", "booked"), said)
            self.assertFalse(v["relance_ok"])
            self.assertTrue(v["booked_why"])

    def test_booked_field_from_explee_stops_everything(self):
        lead, th = self._thread(("outbound", "2026-10-01T08:00:00Z", "Bonjour Ana\n\nTom"),
                                ("inbound", "2026-10-02T08:00:00Z", "Ok pour un échange"),
                                ("outbound", "2026-10-02T09:00:00Z", "Merci\n\nTom"))
        lead["meeting_booked"] = True
        self.assertEqual(R.compute(lead, th, None, REF)["bucket"], "booked")
        lead.pop("meeting_booked"); lead["status"] = "Meeting booked"
        self.assertEqual(R.compute(lead, th, None, REF)["bucket"], "booked")

    def test_reactivation_overrides_auto_booked(self):
        lead, th = self._thread(("outbound", "2026-10-01T08:00:00Z", "Bonjour Ana\n\nTom"),
                                ("inbound", "2026-10-02T08:00:00Z", "C'est noté"),
                                ("outbound", "2026-10-02T09:00:00Z", "Merci\n\nTom"))
        st = R.state_from_note("[03/10] Relance · Séquence réactivée", REF.date())
        self.assertEqual(R.compute(lead, th, st, REF)["bucket"], "today")

    def test_interested_reply_is_not_booked(self):
        for said in ("Ok pour un échange", "Oui pourquoi pas, quelles sont vos dispos ?", "Avec plaisir"):
            lead, th = self._thread(("outbound", "2026-10-01T08:00:00Z", "Bonjour Ana\n\nTom"),
                                    ("inbound", "2026-10-02T08:00:00Z", said))
            self.assertEqual(R.compute(lead, th, None, REF)["status"], "reply", said)

    def test_booking_link_loses_the_september_month(self):
        v = R.compute(*lead("Claire"), None, REF)
        self.assertEqual(v["ctx"]["cal_link"], "https://calendly.com/tom-prescient/15min")

    def test_call_comes_after_email1_when_phone(self):
        v = R.compute(*lead("Khaled"), None, REF)
        self.assertEqual([s["key"] for s in v["steps"]], ["email1", "call", "email2", "email3"])
        self.assertTrue(v["steps"][0]["done"])
        # email 1 parti le 06/10 à 19h57 : pas d'appel avant 48 h de silence
        self.assertEqual((v["next"]["key"], v["next"]["due"]), ("call", "2026-10-08"))
        self.assertEqual(v["bucket"], "scheduled")
        self.assertFalse(v["relance_ok"])

    def test_call_outcome_moves_to_email2(self):
        st = R.state_from_note("[06/10 20:12] Relance · Appel : message laissé", REF.date())
        v = R.compute(*lead("Khaled"), st, REF)
        self.assertEqual((v["next"]["key"], v["next"]["due"]), ("email2", "2026-10-08"))

    def test_no_phone_means_no_call_step(self):
        v = R.compute(*lead("Jacques"), None, REF)
        self.assertNotIn("call", [s["key"] for s in v["steps"]])
        self.assertEqual(v["next"]["key"], "email3")

    def test_booked_note_stops_everything(self):
        v = R.compute(*lead("Rachid"), R.state_from_note("booked", REF.date()), REF)
        self.assertEqual(v["bucket"], "booked")


class Notes(unittest.TestCase):
    def parse(self, n):
        return R.state_from_note(n, REF.date())

    def test_recover_py_vocabulary(self):
        self.assertEqual(self.parse("booked")["status"], "booked")
        self.assertEqual(self.parse("ne pas relancer")["status"], "lost")
        self.assertEqual(self.parse("Suivi LinkFinder — 2026-09-06 : relance envoyée"), {})

    def test_last_line_wins(self):
        self.assertEqual(self.parse("[05/10] Relance · RDV calé\n[06/10] Relance · Séquence réactivée"),
                         {"reactivated": True})
        self.assertEqual(self.parse("[05/10] Relance · Séquence réactivée\n[06/10] Relance · RDV calé"),
                         {"status": "booked"})

    def test_retry_and_wait_dates(self):
        self.assertEqual(self.parse("Appel : à rappeler le 2026-10-09")["call"]["retry_at"][:10], "2026-10-09")
        self.assertEqual(self.parse("Attendre jusqu'au 2026-10-15")["snooze_until"][:10], "2026-10-15")
        self.assertEqual(self.parse("attendre 15/10")["snooze_until"][:10], "2026-10-15")

    def test_email_sent_line_is_not_a_status(self):
        self.assertEqual(self.parse("[06/10 12:00] Relance · Email envoyé : Email 1"), {})


class Page(unittest.TestCase):
    def setUp(self):
        try:
            import cryptography  # noqa: F401
        except ImportError:
            self.skipTest("pip install cryptography")
        import relance_page as P
        self.P = P

    def test_roundtrip_and_no_plaintext(self):
        store = R.Store(demo=True)
        view = self.P.build(store)
        blob = self.P.encrypt(view, "pw")
        html = self.P.render(blob, {"ok": True})
        self.assertNotIn("Claire", html)
        self.assertNotIn("swissbiolab", html.lower())
        self.assertIn('content="noindex, nofollow, noarchive"', html)
        prev = json.loads(re.search(r"const PAGE = (\{.*?\});\n", html, re.S).group(1))
        self.assertEqual(len(self.P.decrypt(prev["blob"], "pw")["leads"]), 6)
        self.assertTrue(self.P.unchanged(html, view, "pw"))

    def test_plain_page_without_password(self):
        view = self.P.build(R.Store(demo=True))
        blob = self.P.seal(view, "")
        html = self.P.render(blob, {"ok": True})
        self.assertIn("Claire", html)                       # en clair, voulu
        self.assertEqual(len(self.P.unseal(blob, "")["leads"]), 6)
        self.assertTrue(self.P.unchanged(html, view, ""))

    def test_without_password_no_data(self):
        html = self.P.render(None, {"ok": False, "message": "x"})
        self.assertIn('"blob": null', html)


class FakeExplee:
    """Explee en mémoire, alimenté par les données démo."""
    def __init__(self):
        d = R.demo_data()
        self.d, self.sent, self.notes = d, [], {}
        self.threads = {f"{l['campaign_id']}:{l['person_id']}": t for l, t in d["leads"]}

    def projects(self): return self.d["projects"]
    def campaigns(self): return self.d["campaigns"]
    def analytics(self, cid): return {}
    def definition(self, cid): return {"language": "fr", "offer": "Offre test."}
    def hot_leads(self): return [l for l, _ in self.d["leads"]]
    def thread(self, cid, pid): return self.threads[f"{cid}:{pid}"]
    def reply(self, cid, pid, text): self.sent.append((f"{cid}:{pid}", text))
    def get_note(self, cid, pid): return self.notes.get(f"{cid}:{pid}", "")
    def set_note(self, cid, pid, note): self.notes[f"{cid}:{pid}"] = note


LATER = datetime(2026, 10, 7, 20, 0, tzinfo=R.TZ)   # > 48 h après notre dernier message à Xavier


class Act(unittest.TestCase):
    def setUp(self):
        try:
            import relance_act
        except ImportError:
            self.skipTest("pip install cryptography")
        self.A = relance_act

    def test_sends_once_then_refuses_when_thread_moved(self):
        api = FakeExplee()
        acts = [{"type": "reply", "key": "187263:p2", "text": "Bonjour Xavier", "step": "email1", "expect_after": 1}]
        n = self.A.run(api, acts, ref=LATER)
        self.assertEqual(n["sent"], 1)
        self.assertIn("Email envoyé : Email 1", api.notes["187263:p2"])
        # la page affichait encore expect_after=1 : un second clic ne doit rien envoyer
        api.threads["187263:p2"]["messages"].append({"direction": "outbound", "sent_at": "2026-10-07T18:00:00Z", "body": "Bonjour Xavier"})
        n = self.A.run(api, acts, ref=LATER)
        self.assertEqual((n["sent"], n["skipped_moved"]), (0, 1))
        self.assertEqual(len(api.sent), 1)

    def test_recover_py_projects_are_left_alone(self):
        import relance_page as P
        orig = P.auto_projects
        self.A.auto_projects = lambda: {"37293"}       # le projet des données démo
        try:
            api = FakeExplee()
            n = self.A.run(api, [{"type": "reply", "key": "187263:p2", "text": "t", "expect_after": 1}], ref=REF)
            self.assertEqual((n["sent"], n["skipped_auto"], api.sent), (0, 1, []))
        finally:
            self.A.auto_projects = orig

    def test_unknown_lead_is_never_mailed(self):
        api = FakeExplee()
        n = self.A.run(api, [{"type": "reply", "key": "999:x", "text": "hi", "expect_after": 0}], ref=REF)
        self.assertEqual((n["sent"], n["skipped_unknown"], api.sent), (0, 1, []))

    def test_note_appends(self):
        api = FakeExplee()
        api.notes["187262:p3"] = "booked"
        self.A.run(api, [{"type": "note", "key": "187262:p3", "line": "x"}], ref=REF)
        self.assertEqual(api.notes["187262:p3"], "booked\nx")

    def test_dry_run_sends_nothing(self):
        api = FakeExplee()
        n = self.A.run(api, [{"type": "reply", "key": "187263:p2", "text": "t", "step": "email1", "expect_after": 1}],
                       dry=True, ref=LATER)
        self.assertEqual((n["sent"], api.sent), (1, []))

    def test_relance_refused_before_48h(self):
        api = FakeExplee()
        acts = [{"type": "reply", "key": "187263:p2", "text": "Bonjour Xavier", "step": "email1", "expect_after": 1}]
        n = self.A.run(api, acts, ref=REF)             # notre message date de moins de 48 h
        self.assertEqual((n["sent"], n["skipped_too_soon"], api.sent), (0, 1, []))

    def test_relance_refused_when_call_booked_in_note(self):
        api = FakeExplee()
        api.notes["187263:p2"] = "[06/10 21:00] Relance · RDV calé"
        acts = [{"type": "reply", "key": "187263:p2", "text": "Bonjour Xavier", "step": "email1", "expect_after": 1}]
        n = self.A.run(api, acts, ref=LATER)
        self.assertEqual((n["sent"], n["skipped_booked"], api.sent), (0, 1, []))

    def test_relance_refused_when_lead_says_booked(self):
        api = FakeExplee()
        api.threads["187263:p2"]["messages"].append(
            {"direction": "inbound", "sent_at": "2026-10-07T08:00:00Z", "body": "C'est noté pour jeudi, merci"})
        acts = [{"type": "reply", "key": "187263:p2", "text": "Bonjour Xavier", "step": "email1", "expect_after": 1}]
        n = self.A.run(api, acts, ref=LATER)
        self.assertEqual((n["sent"], n["skipped_booked"], api.sent), (0, 1, []))

    def test_wrong_step_is_refused(self):
        api = FakeExplee()
        for step in ("email2", "reply", None):
            acts = [{"type": "reply", "key": "187263:p2", "text": "t", "step": step, "expect_after": 1}]
            n = self.A.run(api, acts, ref=LATER)
            self.assertEqual(n["sent"], 0, step)
        self.assertEqual(api.sent, [])

    def test_plain_payload(self):
        acts = self.A.decode(json.dumps({"actions": [{"type": "note", "key": "k", "line": "l"}]}), "")
        self.assertEqual(acts[0]["line"], "l")

    def test_payload_roundtrip(self):
        import relance_page as P
        blob = P.encrypt({"v": 1, "actions": [{"type": "note", "key": "k", "line": "l"}]}, "pw")
        self.assertEqual(self.A.decode(json.dumps(blob), "pw")[0]["line"], "l")
        with self.assertRaises(SystemExit):
            self.A.decode(json.dumps(blob), "wrong")


class ReplyField(unittest.TestCase):
    def test_reply_sends_body_text_first(self):
        api = R.Explee("k"); calls = []
        api.req = lambda method, path, params=None, body=None, retries=4: calls.append(body) or {}
        api.reply(1, "p", "hello")
        self.assertEqual(calls, [{"body_text": "hello"}])   # {"message": …} est refusé en 422 par Explee

if __name__ == "__main__":
    unittest.main(verbosity=1)
