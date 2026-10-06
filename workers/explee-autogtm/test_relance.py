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

    def test_without_password_no_data(self):
        html = self.P.render(None, {"ok": False, "message": "x"})
        self.assertIn('"blob": null', html)


if __name__ == "__main__":
    unittest.main(verbosity=1)
