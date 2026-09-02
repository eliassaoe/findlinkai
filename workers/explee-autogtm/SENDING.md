# Bringing your own mailboxes — the biggest lever in this directory

Explee's offer to send from your own email accounts is worth more than every lead
source question in `SOURCES.md` put together, on both cost and reply rate.

## You already own nine healthy mailboxes

Read off the Instantly workspace, 2 Sept 2026:

| | |
|---|---|
| Mailboxes | **9**, created 29 Aug on 3 domains |
| Domains | `linkfinderai-outbound.com`, `-contact.com`, `-with.com` (3 each) |
| Status | all active, `is_managed_account: false` — yours, not rented |
| Warmup | score **100**, health **100%** |
| Placement | **158 warmup sends, 158 landed in the inbox, 0 in spam** |
| Capacity | 15/day each = **135/day** |

They are four days old, which is young for cold sending, but the warmup is clean
and the tracking domains are active. Nothing here needs rebuilding.

## What Explee is sending as, and why it matters

From the replies on the dashboard, AutoGTM sends as:

    Brian Carter <b@usetidegrove.com>
    Jake Hart    <j@tryturn.org>

Generic throwaway domains, invented persona names, writing in French about
LinkFinder AI to French buyers. Two costs, and neither is small:

**Placement.** A prospect wrote back: *"il faudrait déjà apprendre à envoyer des
mails qui ne partent pas dans les spams"*. Unbranded domains with no history are
exactly what filters distrust. Your own domains land at 100% in warmup today.

**Credibility.** An ESN buyer receives a French pitch from "Brian Carter" at
`usetidegrove.com`, a domain that has nothing to do with the product being sold
and cannot be verified. Reply rate is driven by offer, then targeting, then
placement — and "who is this person" sits underneath all three. Sending as
Eliasse Hamour from `linkfinderai-contact.com` costs nothing and fixes it.

This is also why the 1.05% reply rate should not be read as a lead-quality
verdict. The same leads, from a domain the recipient can place, are not the same
experiment.

## The cost, which is where it stops being close

Current volume is **747 emails/day, ~22,400/month**. Your nine mailboxes cover
18% of that; 50 mailboxes across ~17 domains covers all of it.

| Sending | Monthly at 22,400 emails | Per email |
|---|---|---|
| **Explee at $0.03** | **$673** | $0.0300 |
| 50 inboxes at $3.25 (Zapmail / Instantly DFY) | $162 | $0.0072 |
| Mailreef, $249 + $0.001/send (dedicated IPs) | $271 | $0.0121 |
| 50 inboxes at $0.49 (Maildoso, shared IPs) | $24 | $0.0011 |

And on the number that matters:

| | Cost per interested lead |
|---|---|
| today, Explee sending | **$13.54** |
| own infrastructure ~$0.01/email | **$6.07** |
| own infrastructure ~$0.005/email | **$4.20** |

**A 55-70% cut**, against Pharow's realistic best case of $12.73 at a 1.5x reply
rate. Sending is 83% of the cost of a call; the lead is 17%. This is the lever.

## The one question that decides it

**Does Explee still charge $0.03 an email when you bring your own mailboxes?**
Nobody here knows, and the entire saving above depends on it. If the $0.03 covers
infrastructure *and* orchestration, and BYO only removes the first part, the
number to ask for is the BYO rate per email. Ask before buying a single domain.

## "I would rather a tool ran the infrastructure than run it myself"

Reasonable, and this repo has the scar to justify it: `OUTBOUND-CRM-AUDIT.md`
records **all 38 Instantly mailboxes failing at once** with `EAUTH - can't create
new access token`, sending zero for a week. That is the true cost of
self-managed sending, and it is not the DNS setup - it is the Tuesday when
everything silently stops.

But "rely on a tool" splits into two very different things:

| | Who owns the domains | Your ops | Sender identity | Cost/month at 22,400 emails |
|---|---|---|---|---|
| **A. The tool's own pool** — Explee today | Explee | **none** | `Brian Carter <b@usetidegrove.com>` | **$673** |
| **B. Done-for-you on your brand** — Instantly DFY, Zapmail | you, bought and configured *by them* | approve the order; they do DNS, mailboxes, warmup, monitoring | `eliasse@linkfinderai-contact.com` | **$162-400** |
| C. Build it yourself | you | all of it | yours | ~$150 |

**B is not C.** Done-for-you means you never open a DNS panel: the provider buys
the domains, sets SPF/DKIM/DMARC, creates the mailboxes, warms them for weeks and
monitors placement. The nine mailboxes you already have arrived this way -
`added_by: api`, warming themselves to a health score of 100 without anyone
touching a record. That is a tool running your infrastructure. It is the option
that matches the preference, not the one it rules out.

**What A costs beyond money.** On a shared pool you have no lever when placement
degrades - and a prospect has already told you it has. You cannot warm it, cannot
rotate it, cannot brand it, and cannot see it. You are also permanently a stranger
in the inbox: `usetidegrove.com` will never be a domain a French ESN recognises,
however good the copy gets.

**Recommendation:** option B, and specifically the provider you already run.
Instantly DFY sells pre-warmed domains and mailboxes inside the workspace you
already pay for, so there is no new vendor, no new billing, and the accounts are
real Google/Microsoft ones - which is what Explee needs to connect over OAuth or
SMTP. Zapmail is the equivalent if you want it outside Instantly (~$3.25/inbox).

Mailreef ($249/month + $0.001 a send) buys dedicated IPs and full reputation
control; worth it later, overkill now. Maildoso is cheapest at $0.49 a mailbox but
runs shared IPs with rotation - your reputation moves with strangers', which is
the one thing you are trying to stop happening.

Whatever you pick: 3 mailboxes per domain, warm each for 2-3 weeks before it
carries campaign traffic, add domains in batches so one bad domain never takes the
whole send with it, and keep a placement check running - the 38-mailbox outage was
only expensive because nobody noticed for a week.

Sources: [Cold email infrastructure pricing 2026](https://maildeck.co/blog/cold-email-infrastructure-cost-2026/) ·
[Provider comparison](https://www.icemail.ai/blog/best-cold-email-infrastructure-tools-2026-full-comparison-with-pricing/)
