# Sending: what is live, and what it is worth

Three sending modes exist in the app under **Choose how you send**:

| Mode | Status | What it is |
|---|---|---|
| **Pre-warmed mailboxes** | current | Explee's shared pool. Rotates across several mailboxes, personas like *Finn Turner*, *Leo Brooks*, *Mia Bennett* |
| **Your own mailboxes** | **live** | your domains and mailboxes over Google, Microsoft or any IMAP/SMTP; your brand on every email; replies sync to your inbox |
| **Dedicated mailboxes** | **not live** | Explee buys and configures fresh domains for you and warms them |

So **bringing your own mailboxes is available today** — which means any rented
infrastructure (Zapmail, Mailforge, Mailreef, anything with IMAP/SMTP) can be
plugged straight in. What is *not* available is Explee buying and warming
dedicated domains on your behalf.

**Two places in the app say otherwise and are worth reconciling before you spend:**
the Email templates page reads *"Your own mailboxes and name coming soon"*, and
support answered that the option "isn't live — picking it only records your
interest". Both may be stale copy about the dedicated tier. The way to settle it
costs nothing: click through the flow and see whether it asks for IMAP/SMTP
credentials and actually connects one mailbox.

## The price does not change, so this is a placement bet, not a cost one

Explee, asked directly:

> Pricing stays flat at ~$0.03 per email actually sent, identical on every
> account.

> Shared — outreach goes through our pre-warmed pool, with each prospect
> consistently paired to one inbox from it; there's no dedicated domain or
> mailbox per customer today.

So bringing your own mailboxes does **not** cut the $0.03. You would pay Explee
the same and the infrastructure on top — roughly **$162/month more**, not $500
less. Which is fine, but it has to be justified on inbox placement alone:

| | Monthly | Interested leads | Cost each |
|---|---|---|---|
| today, shared pool | $812 | 56 | **$14.50** |
| + rented inboxes, reply rate unchanged | $974 | 56 | $17.39 |
| + rented inboxes, **reply rate 2x** | $974 | 112 | **$8.70** |

**Break-even is a 20% lift in reply rate.** Below that you have paid $162 a month
for a logo on the envelope; above it, it is the cheapest thing on the table. Given
the pool is shared — your placement carries other customers' complaints, with no
domain you can warm, rotate or inspect — and given a prospect has already written
back about spam, a 20% lift is a low bar. But it is still a bet, and the $2 seed
test settles it before the invoice.

## What to buy, given you will not manage inboxes

"Your own mailboxes" in Explee's UI means *not our pool* — it does not mean you
have to run anything. You rent from an infrastructure provider: they buy the
domains, set SPF/DKIM/DMARC, create the mailboxes, warm them continuously, monitor
placement and replace what burns. You paste credentials into Explee once. Ongoing
work after that is approximately zero.

**One technical requirement decides the shortlist.** Explee needs *"Google,
Microsoft or any IMAP/SMTP"* and syncs replies back to the inbox — so you need
real mailboxes with **IMAP for reading plus SMTP for sending**, not an SMTP relay.
That rules out relay-style infrastructure however good its IPs are.

| Provider | Fits? | Price | Why |
|---|---|---|---|
| **Zapmail** | ✅ | ~$3.25/inbox | real Google Workspace / Microsoft 365 mailboxes, DNS automated, pre-warmed options, IMAP + SMTP |
| **Mailforge** | ✅ | ~$4/inbox | same shape, domains and inboxes managed together |
| Mailreef | ⚠️ | $249/mo + $0.001/send | dedicated IPs, excellent — but it is SMTP infrastructure; confirm IMAP mailboxes exist for reply sync |
| Maildoso | ❌ | from $0.49/inbox | shared IPs with heavy rotation: the same shared-reputation trap you are leaving |

**Pick Zapmail or Mailforge.** At ~50 inboxes for your volume that is
**$160-200/month**, fully managed, on domains used only by you.

Two questions before paying, and they are the whole risk:

1. **Does warmup keep running when I send through a third-party tool?** Some
   vendors only warm accounts that send inside their own product. Sending cold
   from unwarmed inboxes is worse than the shared pool.
2. **Do I get IMAP credentials, not just SMTP?** Without IMAP, Explee cannot sync
   replies and the inbox stops working.

## What that leaves, on AutoGTM

Three consequences, and they are the whole strategic picture:

**1. The sending price is a floor, not a variable.** $0.03 an email, identical on
every account, no bring-your-own discount to negotiate. At 374 emails per
interested lead that is **$11.21 of every interested lead, fixed**. The lead data
is the other $2.33. So the cheapest possible interested lead on this platform,
with free leads, is about $11.

**2. Placement can be fixed, but not cheaply.** Your own mailboxes are supported,
so rented dedicated inboxes solve the shared-reputation problem — at $162/month on
top of an unchanged $0.03, needing a 20% reply-rate lift to pay for itself.

**3. Therefore conversion is the only lever left here.** Cost per call is
`$156.93 ÷ (14 × interested-to-booked)`. Nothing on the cost side moves any more:
not the lead source (worth 17% at most, and Pharow needs 1.41x just to break
even), not the sending (fixed). The booking rate is worth 2x to 5x and it is
free. **See `BASELINE.md`: the $50 target is exactly a 22% interested-to-booked
rate.**

That is the case for un-parking `recover.py`, and it is now the only case left.

## If the placement problem turns out to be the real ceiling

There is one architecture that fixes it, and it is a real trade, not a free win:
**use Explee for leads and something else for sending.** Explee's public API sells
the data at ~$0.025 a lead; Instantly - already paid for, with nine warmed
mailboxes in it - sends from inboxes whose reputation is yours.

| | AutoGTM today | Explee API + Instantly |
|---|---|---|
| 22,400 emails/month | $672 | ~$162 infra + plan |
| Leads | $140 | $140 |
| Reputation | shared pool | **yours** |
| **Monthly** | **~$812** | **~$500** |

What you would lose is not small: AutoGTM's AI-written per-lead copy, the
autopilot, the unified inbox, the hot-lead detection. That is presumably why you
are on it. So this is a fork to hold in reserve — worth taking only if the seed
test shows placement is genuinely eating the reply rate, and worth re-checking
whenever Explee ships bring-your-own.

Run the seed test either way: it costs $2, it needs nothing from Explee, and it
tells you whether placement is the ceiling or the offer is.

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

## "Only worth it if it lands in the main inbox" — so measure that, do not argue it

Right test, and the honest answer is **plausible, not proven**. What is actually
known:

**For your own domains.** Explee sends from `usetidegrove.com` and `tryturn.org`,
which have nothing to do with the product in the email — filters weigh alignment
between the sending domain, the brand and the links, and a French buyer's
Microsoft 365 tenant has never seen either domain. A shared pool also carries
everyone else's behaviour: one bad sender in it degrades your placement and you
have no lever, no visibility and no way to warm your way out. A prospect has
already written that the mail landed in spam.

**Against your own domains, honestly.** They are **four days old**. New domains
are themselves a spam signal, and 2-3 weeks of warmup is the minimum before they
carry campaign traffic — switching this week would likely land *worse*, not
better. And a 100% warmup score is not 100% inbox placement: warmup measures
delivery to other warmup mailboxes in a friendly network, which is a weak proxy
for a corporate M365 tenant with a real filter in front of it. Content matters
too: a French cold pitch at volume gets filtered on pattern regardless of whose
domain it came from.

So do not buy on the theory. **The seed test costs about $2 and settles it:**

1. Collect 8-12 addresses you can open, weighted to look like your targets:
   2 Gmail · 2 Outlook.com · 2-3 **Microsoft 365 business** tenants (what a French
   ESN or a 250-person industrial actually runs) · 2 French consumer providers
   (`orange.fr`, `free.fr`, `laposte.net`).
2. Import them as leads into a small AutoGTM campaign. The import is free; the
   sends are ~$0.03 each, so twelve leads over a four-email sequence is $1.44.
3. Record where each one lands: **Primary / Promotions / Spam**, per provider.
   That is Explee's pool measured on your own audience, not on a vendor page.
4. Once Explee's bring-your-own is connected, send the same twelve from your
   mailboxes — after they have warmed three weeks — and compare.

If the pool lands 40% in spam and your domains land 90% in primary, the switch
pays for itself immediately and the $673 saving is a bonus. If both land the same,
you have saved yourself a migration and learned the reply rate is about the offer,
not the envelope.

**Note:** Instantly sells a proper seed-network Inbox Placement test, but your
workspace does not have that add-on (`inbox_placement.plan_name: null`), so the
DIY version above is the free path.

## The one question that decides it

**Does Explee still charge $0.03 an email when you bring your own mailboxes?**
Nobody here knows, and the entire saving above depends on it. If the $0.03 covers
infrastructure *and* orchestration, and BYO only removes the first part, the
number to ask for is the BYO rate per email. Ask before buying a single domain.

## Renting the inboxes from an infrastructure tool

To be clear about what this means, because it is not the same as the two options
above: **you rent working mailboxes from a provider.** They buy the domains, set
SPF/DKIM/DMARC, create the mailboxes, warm them and monitor them, and hand you
SMTP or OAuth credentials to paste into Explee. You never open a DNS panel, never
own a domain, and if you stop paying they take it back. Explee keeps doing
everything else — leads, copy, sending logic, inbox, replies. Only the pipe
changes.

That is a real product category with several mature vendors:

| Provider | What you rent | Price | IPs |
|---|---|---|---|
| **Mailreef** | full SMTP infrastructure, dedicated IPs | $249/mo + $0.001 a send | **dedicated — yours alone** |
| **Zapmail** | Google Workspace / Microsoft inboxes, pre-warmed available | ~$3.25/inbox | provider pool |
| **Mailforge / Infraforge** | domains + inboxes, priced separately | ~$4/inbox | dedicated option |
| **Maildoso** | SMTP mailboxes, cheapest at volume | from $0.49/inbox | **shared, heavily rotated** |

At your volume (22,400/month, ~50 inboxes) that is **$162-271/month against
Explee's $673** — if Explee discounts bring-your-own. Which is still the open
question below.

### Confirmed: Explee's sending domains are shared. That decides it.

Explee states the pool is shared across customers. So `usetidegrove.com` and
`tryturn.org` carry every other Explee customer's spam complaints, and you have
no lever: you cannot warm them, rotate them, or even see their reputation. Three
things stop being coincidences and start being symptoms:

- a prospect writing back that the mail landed in spam
- a **1.05% reply rate** where cold email that reaches the inbox runs 3-8%
- an interested-lead cost you have been trying to fix from the lead side

**Renting dedicated inboxes is justified on placement alone**, and the money is a
bonus. The reputation on a rented domain is yours - nobody else can burn it -
even though the asset is not.

### It wins even if Explee gives you no discount at all

Worst case: Explee keeps charging $0.03 an email and you pay the infrastructure
on top. At 22,400 emails a month:

| | Monthly cost | Interested leads | Cost each |
|---|---|---|---|
| today, shared pool | $812 | 56 | **$14.50** |
| **+ rented inboxes, Explee still charges full** | $974 | 112 (reply rate 2x) | **$8.70** |
| + rented inboxes, Explee at $0.01 BYO | $526 | 112 | **$4.70** |

Even paying twice, a placement fix that doubles the reply rate cuts cost per
interested lead by 40%. Ask for the BYO rate - it is worth $450 a month - but it
does not gate the decision.

### Which one, given shared is the thing being escaped

**Not Maildoso.** From $0.49 an inbox, but shared IPs with heavy rotation: that is
the same trap with a different logo.

- **Zapmail / Mailforge (~$3.25-4 an inbox)** — real Google Workspace or Microsoft
  365 mailboxes on domains used only by you. Mailbox providers trust those
  platforms, and the reputation that matters here is the *domain's*, which is
  dedicated. **The default choice.**
- **Mailreef ($249/mo + $0.001 a send)** — its own SMTP infrastructure with
  dedicated IPs. Full control, more to get wrong: an IP has to be warmed as
  carefully as a domain. Worth it at higher volume or if you want the IP itself.

One question for whichever you pick: **does your warmup keep running when I send
through a third-party tool?** Some vendors only warm accounts that send inside
their own product, which would leave you cold-sending from unwarmed inboxes.

Then prove it with the seed test above: run it once on the shared pool now, once
on the rented inboxes after three weeks of warmup. Same twelve seeds, same copy.
That is the before-and-after that tells you whether the placement theory was
right, and it costs $3 in total.

Sources: [Cold email infrastructure pricing 2026](https://maildeck.co/blog/cold-email-infrastructure-cost-2026/) ·
[Provider comparison](https://www.icemail.ai/blog/best-cold-email-infrastructure-tools-2026-full-comparison-with-pricing/)
