# Bounce rate is about recency, not verification — 26 Aug

Follow-up to `email-verified-is-wrong.md`. That doc is still right about
`email_verified` being garbage. It is **incomplete** about what to gate on
instead. Verification status is necessary and nowhere near sufficient.

## The send

PostHog workflow `11. AEO / LinkFinder VIP - listicle placement offer`
(`01a038b0-a39c-0000-6829-912e9f901270`) dispatched once on 25 Aug 11:40 UTC:
153 recipients, 149 delivered, **10 bounced (6.5%)**. Eight of the ten came back
in 1–5 seconds — immediate MX rejection, i.e. hard bounces. 8/153 = **5.2% hard
bounce**, above the 5% threshold at which SES puts a sender under review.

## Three hypotheses, tested

**"Gate on Google auth."** Doesn't work. Google signups were the *majority* of
the bounces.

| signup method | sent | bounced | rate | hard | hard rate |
|---|---|---|---|---|---|
| Google auth | 119 | 7 | 5.9% | 6 | **5.0%** |
| email + password | 34 | 3 | 8.8% | 2 | 5.9% |

Google-only would have moved 5.2% → 5.0% hard. Still at the threshold.

**"Verify the addresses before sending."** Doesn't work either, on this list.
Instantly's verifier returned `verification_status: verified` for
`dan@topo.io` — with `catch_all: true`. That address hard-bounced. Catch-all
B2B domains accept anything at SMTP probe time, so a verifier cannot see
through them, and most of this list is catch-all B2B.

**"Gate on whether they came back."** This works.

| segment | people | bounced | rate |
|---|---|---|---|
| confirmed in `auth.users` AND returned after signup | 22 | 0 | **0.0%** |
| confirmed, never returned (`last_sign_in_at` ≈ `confirmed_at`) | 98 | 7 | 7.1% |
| no `auth.users` row at all | 33 | 3 | 9.1% |

Zero bounces among people who signed in again even once.

## Why

Google verified those mailboxes **at signup, not today**. Every one of the six
Google bouncers has `last_sign_in_at` within five minutes of `confirmed_at` —
signed up once between 19 Jun and 4 Aug, never came back. `dan@topo.io`
confirmed 3 Aug and hard-bounced 25 Aug, 22 days later. B2B mailboxes at small
companies die fast, and a one-time signup gives you no signal that the person
is still there.

**Verification tells you an address was real once. Return activity tells you
someone is still behind it.**

## The gate to use

```sql
-- eligible to receive marketing
SELECT u.email
FROM linkfinderai_users u
JOIN auth.users a ON lower(a.email) = lower(u.email)
WHERE a.confirmed_at IS NOT NULL
  AND a.last_sign_in_at > a.confirmed_at + interval '5 minutes';
```

Layer product activity (`enrich_started`, `csv_uploaded`) on top when the list
needs to be bigger than that query returns. Do not substitute
`email_verified`, `plan_type`, or `is_unlimited` — none of them carry this.

## Two traps found alongside

**The PostHog person property `email_verified` is not set at all.** All 153
recipients had it `null`. The workflow gate was
`email_verified is_not "false"`, and `is_not` passes unset values, so the gate
matched 100% of the cohort and filtered nobody. Workflows 1, 2, 3, 5, 6, 8 and 9
all carry the same gate and are therefore all effectively ungated. Either
`$set` the property from `auth.users` on identify, or gate on a cohort built
from the SQL above.

**PostHog does not auto-suppress hard bounces.** After the 25 Aug send the
opt-out list held 31 entries, none of them the ten bouncers — all ten were
still scheduled to receive touches 2, 3 and 4, i.e. 30 more hard bounces. They
were added manually via `opt-outs-add`. **After every batch send, suppress the
bounces before the next touch fires.** Nothing does this for you.

## Also worth fixing on that workflow

- `email_sending_rate_limit: null` — 153 emails left in 1.4 seconds. Cold-ish
  domain, no ramp.
- Sending from `support@linkfinderai.com`, the transactional domain. Marketing
  bounces there degrade receipts and password resets. Use a subdomain.
- `conversion: null` and `exit_condition: exit_only_at_end` — bookings are not
  tracked, and anyone who books still receives the rest of the sequence.
