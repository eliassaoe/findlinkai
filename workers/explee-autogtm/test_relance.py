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
        self.assertIn("17h sur Teams", v["drafts"]["email1"])
        self.assertIn("https://cal.link/FdEm9re", v["drafts"]["email1"])
        self.assertTrue(v["drafts"]["email1"].rstrip().endswith("Bien cordialement,\nTom"))

    def test_booking_link_loses_the_september_month(self):
        v = R.compute(*lead("Claire"), None, REF)
        self.assertEqual(v["ctx"]["cal_link"], "https://calendly.com/tom-prescient/15min")

    def test_call_comes_after_email1_when_phone(self):
        v = R.compute(*lead("Khaled"), None, REF)
        self.assertEqual([s["key"] for s in v["steps"]], ["email1", "call", "email2", "email3"])
        self.assertTrue(v["steps"][0]["done"])
        self.assertEqual((v["next"]["key"], v["next"]["due"]), ("call", "2026-10-07"))

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
        self.assertEqual(self.parse("[05/10] Relance · RDV calé\n[06/10] Relance · Séquence réactivée"), {})

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
        n = self.A.run(api, acts, ref=REF)
        self.assertEqual(n["sent"], 1)
        self.assertIn("Email envoyé : Email 1", api.notes["187263:p2"])
        # la page affichait encore expect_after=1 : un second clic ne doit rien envoyer
        api.threads["187263:p2"]["messages"].append({"direction": "outbound", "sent_at": "2026-10-06T19:00:00Z", "body": "Bonjour Xavier"})
        n = self.A.run(api, acts, ref=REF)
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
        n = self.A.run(api, [{"type": "reply", "key": "187263:p2", "text": "t", "expect_after": 1}], dry=True, ref=REF)
        self.assertEqual((n["sent"], api.sent), (1, []))

    def test_plain_payload(self):
        acts = self.A.decode(json.dumps({"actions": [{"type": "note", "key": "k", "line": "l"}]}), "")
        self.assertEqual(acts[0]["line"], "l")

    def test_payload_roundtrip(self):
        import relance_page as P
        blob = P.encrypt({"v": 1, "actions": [{"type": "note", "key": "k", "line": "l"}]}, "pw")
        self.assertEqual(self.A.decode(json.dumps(blob), "pw")[0]["line"], "l")
        with self.assertRaises(SystemExit):
            self.A.decode(json.dumps(blob), "wrong")


if __name__ == "__main__":
    unittest.main(verbosity=1)
