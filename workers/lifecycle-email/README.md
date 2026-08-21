# Lifecycle email: PostHog segments → Instantly

## The headline

Your existing lifecycle campaign **works**, and it is being starved.

`email marketing PAID credits USED` (active since March):

| | |
|---|---|
| Leads ever loaded | **9** |
| Emails sent | 7 |
| Replies | **2** (29%) |
| Opportunities | 1, valued **$1,000** |

Seven emails produced two replies and a $1,000 opportunity. Meanwhile there are
**1,874 users with a valid email address** in PostHog, 1,855 of them not paying.
Nine have ever been contacted.

## The segments

Run in PostHog. Non-paying users with a real email, last 120 days:

| Segment | People | Avg lookups | Why they matter |
|---|---|---|---|
| Picked a plan, never paid | **75** | **13.9** | Heaviest users on the list. Tried to buy. |
| Hit the credit wall, never saw pricing | **124** | 8.0 | Wanted more, never shown how to get it. |
| Active (3+ lookups), never upgraded | **380** | 6.5 | Big, engaged, unasked. |
| Saw pricing, never picked a plan | 257 | 3.5 | Price or timing objection. |
| Tried once or twice, went quiet | 555 | 1.4 | The activation problem. |
| Signed up, never ran a lookup | 464 | 0.0 | Onboarding failure. |
| *Paying — exclude from everything* | *19* | *3.2* | |

The query that produces these is in `segments.sql`.

## List hygiene — do not skip this

The raw "picked a plan, never paid" segment is 74 addresses. **27 of them (36%) should
never be emailed:**

| Removed | Count |
|---|---|
| Your own addresses (`hamoureliasse@`, `eliasseiapro*`) | 8 |
| Test accounts (`testestes@`, `testaffiliate@` …) | 7 |
| Disposable inboxes (`mailvn.biz`, `dardr.com`, `onionmail.org` …) | 6 |
| Keyboard-mash signups (`qbeqbqneneq@`, `gziugnzriugn@` …) | 6 |

Disposables hard-bounce, and bounce rate is what actually damages a sending domain.
`clean.py` applies these rules; it is deliberately conservative, so eyeball the output
before every send.

**40 addresses survive**, tiered by usage: 13 tier A (4+ lookups), 15 tier B (1–3),
12 tier C (0).

## Two things to fix before sending

**1. The sending domains are wrong for this.** Every account in the workspace is on a
cold-outreach lookalike domain — `linkfinderai-outbound.com`, `linkfinderai-sales.com`,
`linkfinderai-pro.com`, and so on. Those are correct for prospecting strangers. They are
the wrong choice for emailing people who signed up at **linkfinderai.com**: to that
person, a mail from `eliasse@linkfinderai-outbound.com` reads as phishing. They mark it
spam, and the complaint lands on a domain you need for actual outbound.

Add a sending account on the real domain and send lifecycle mail from there.

**2. Every account reports `status: -1`,** and several carry
`EAUTH — can't create new access token for user`. The OAuth connections have expired.
Reconnect them before relying on any of this.

## Campaign copy

Written to be answered, not admired — the existing campaign got a 29% reply rate on
plain founder-style mail, so that is the register. Short, specific, one question, no
graphics. Every one needs a working unsubscribe line before it goes out.

---

### Campaign 1 — Picked a plan, never paid (40 leads, staged)

**Subject:** `did the upgrade break for you?`

> Hi — Eliasse here, I built LinkFinder.
>
> I can see you ran {{lookups}} lookups and started upgrading to {{plan_picked}}, but the
> payment never went through.
>
> I'd genuinely like to know which it was: did something break, or did you change your
> mind on the price? We found and fixed a bug in our checkout last week, so there's a
> real chance it was us — and if so I owe you a working link.
>
> Either way, just hit reply. One line is plenty.
>
> — Eliasse

*Step 2, +4 days:*

**Subject:** `re: did the upgrade break for you?`

> Following up once, then I'll leave you alone.
>
> If it was the price, tell me and I'll tell you honestly whether {{plan_picked}} is
> right for what you're doing — sometimes the pay-as-you-go pack is the better call and
> I'd rather say so.
>
> — Eliasse

---

### Campaign 2 — Hit the credit wall, never saw pricing (124 leads)

**Subject:** `you ran out of credits — here's what happens next`

> Hi — you used all {{lookups}} of your free lookups on LinkFinder, which means it was
> doing something useful for you.
>
> You may not have seen what comes after: plans start at $49/mo for 5,000 lookups, and
> there's a $25 one-off pack if you just need a batch done and don't want a subscription.
>
> If neither fits what you're doing, reply and tell me what you're actually trying to
> build a list of — I'll tell you if we're the wrong tool.
>
> — Eliasse

---

### Campaign 3 — Tried once or twice, went quiet (555 leads)

**Subject:** `was the result any good?`

> Hi — you tried LinkFinder a while back and didn't come back, so I'm guessing the
> answer either wasn't right or wasn't worth the effort.
>
> Which was it? I'm asking because we just fixed something embarrassing: profile URLs
> from country domains (fr.linkedin.com, in.linkedin.com and the rest) were being
> rejected as invalid. If you pasted one of those, the tool told you your perfectly good
> link was wrong.
>
> That's fixed. Your credits are still there if you want another go.
>
> — Eliasse

*This one is worth sending first — it's the largest segment and the honest bug
disclosure is what makes it worth reading.*

## Keeping it fed

The segments are a query, not a one-off list. Re-run `segments.sql` monthly, pass the
output through `clean.py`, and load the new addresses. There is no PostHog→Instantly
integration to automate it, so this stays a scheduled manual step until someone builds
the connector.
