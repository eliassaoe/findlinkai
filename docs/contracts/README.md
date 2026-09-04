# Contrats

One HTML file per contract, and the PDF rendered from it. The HTML is the master
copy — edit it, never the PDF.

Render:

    /opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless --disable-gpu \
      --no-sandbox --no-pdf-header-footer \
      --print-to-pdf=<name>.pdf <name>.html

(There is no weasyprint and no poppler on this box; Chromium's print-to-pdf is
the only path that respects the print CSS. `pip install pymupdf` if you need to
check the page count or re-render pages as images. No cursive font is installed
either — that is why the signature is typeset as an explicit electronic
signature rather than as a fake handwritten one.)

## 2026-09-04 — RKS CONSULTING (Romain Kusnik), pilote 5 RDV

The first Done For You contract, sold out of the AutoGTM inbox thread
`High ticket linkfinder AI`. Terms as agreed: **750 € TTC**, paid **in two
halves — signature, then the first meeting held**, no engagement, and meetings
guaranteed or refunded.

Three numbers carry the whole deal, and they are the ones to change if the next
contract differs:

| Number | Where | Why it is that |
| --- | --- | --- |
| 750 € TTC (625 € HT, 125 € HT/RDV) | art. 4-5 | asked for; sits inside the "100 à 150 €" already quoted in cold email |
| 60 days to deliver the 5 meetings | art. 6 | not specified — chosen, and it is what the refund hangs off |
| 15 min + in-criteria = a "rendez-vous tenu" | art. 2 | the only definition of what is billable, and the reason the guarantee is safe to give |

**Why the guarantee is not reckless:** nothing is billed but a meeting that
actually happened, with someone inside the criteria the client wrote himself in
Annexe 1 (a no-show, an off-criteria prospect and a duplicate are all replaced
free). The refund is `(5 − N) × 150 € TTC`, automatic, no claim to file. The
60-day clock is suspended while the client is the blocker — unvalidated Annexe 1,
no exclusion list, an empty calendar — which is what stops the guarantee from
being a trap.

`docs/ai-sdr-offer.md` prices the same service at **$150 per meeting, min 5**.
This one is a pilot at 125 € HT; do not read it as the new list price.

**Not signed by the client, and not legal advice** — the client's SIRET, legal
form and address are still blank in the parties box, and a first paying contract
is worth twenty minutes of a lawyer's time before it becomes the template.
