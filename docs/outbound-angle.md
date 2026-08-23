# The outbound angle — 23 Aug

## First, what the customers are actually doing

Every subscriber, joined to `enrichment_history`:

| customer | plan | lookups | active days | last used |
|---|---|---|---|---|
| steven@salesignition.com | 2 | 9,058 | 4 | 12 Jun |
| slater@guidance.so | 1 | 6,043 | 2 | 12 Aug |
| richardwen97@protonmail.com | 3 | 4,999 | 2 | 4 Jul |
| simon@institution.co.uk | 1 | 4,076 | **1** | 8 Jun |
| srivastava.atul@legistify.com | 1 | 3,912 | 2 | 19 May |
| j.plakhotniuk@devotedstudios.com | 1 | 901 | **1** | 13 Aug |

Zoom into a single day and the shape is unmistakable:

```
simon@institution.co.uk   4,076 lookups   14:31 → 17:26   one afternoon
slater@guidance.so        6,043 lookups   21:25 → 17:24   straight through the night
steven@salesignition.com  8,878 lookups   three days, running past 3am
```

**These are not users. They are people who arrived with a list, ran it, and
left.** 14 of 30 subscribers made fewer than 20 lookups in their life.

## What that means

The product is being bought as a **one-time job**, and the subscription is
merely the checkout mechanism they were offered. That single fact explains
everything that looks broken:

- MRR stuck near $1k across 6,594 signups
- 571 outbound leads marked "interested", **0 meetings booked, 2 closed**
- churn that reads as "notUsing" — because there was never a second use

**Pouring cold traffic into a $89 subscription is refilling a leaky bucket.**
Each new customer is worth roughly one month. No cold email angle fixes that,
because the problem is not the message.

## The angle: sell the job, not the tool

Customers have already told us with money what they want: *"I have a list.
Enrich it. I'll pay."* That is a project, and a project is worth a call.

> **"Send us the list. You get it back with verified emails and direct dials.
> Priced per record — you only pay for records we fill."**

Why this works where a subscription pitch does not:

| | $89 subscription | per-record project |
|---|---|---|
| Justifies a 20-min call | no — LTV is under the cost of the call | yes |
| Matches observed behaviour | no — they use it once | **exactly** |
| Deal size | $89 | $1–5k |
| Buyer | anyone | someone with a list and a deadline |

The economics also invert. `steven@salesignition.com` ran 9,058 lookups on a
$89 plan. At even $0.30/record that same job is $2,700.

## Who to target — taken from who already pays

The paying list clusters hard in one place: **companies that sell sales
services or software, and need contact data as an input to what they sell.**

```
salesignition.com   sales-automation.ai   jdemand.com    fiber.ai
guidance.so         frictionlessinc.com   brightmove.com (ATS)
devotedstudios.com  legistify.com         mellow.io      resiin.com
```

They have recurring list needs, a budget line for data, and a concrete reason
to take a call. That beats "lead-gen agencies" as a guess, because these are
not a guess — they are the people who already paid.

## The first email

No pitch, no link, one question — the same structure as the CRM-audit campaign
that is already written:

> Subject: your list
>
> Saw you're doing outbound for clients at {company}.
>
> Quick question — when you build a list for a client, how are you filling in
> the missing emails and direct dials? Manually, a tool, or a VA?
>
> Reason I ask: we run those in bulk. A client sent 4,000 rows last month and
> got them back the same afternoon.
>
> Worth a look at yours?

It asks for a reply, not a click. It names a real volume and a real turnaround,
both of which are true and both of which came out of the data above.

## The list nobody is working

**The best outbound targets are the churned power users.**
`simon@institution.co.uk` ran 4,076 lookups in one afternoon in June and has
not been back. That is a person with a recurring list problem who solved it
once. One call with him is worth more than a thousand cold emails, and the
address is already in the database.

Same for `steven@salesignition.com`, `slater@guidance.so`,
`richardwen97@protonmail.com`, `srivastava.atul@legistify.com`.

Six calls, from a list of six, from people who have already paid.

## What has to be true first

1. **Instantly is disconnected** — all 38 accounts, OAuth revoked. Nothing sends
   until that is fixed.
2. **Someone has to take the calls.** This angle trades a self-serve funnel for
   a sales motion. That is the actual decision, not the copy.
3. **Delivery has to be real.** "Send us the list" means someone runs it and
   returns it. At current volumes that is a person and a spreadsheet, which is
   fine — it is how this gets validated before it gets automated.

## What this does not solve

It does not fix retention on the $89 plan, and it is not meant to. The two
motions can coexist: self-serve for people who want to run it themselves,
per-record projects for people who want it done. But if the project motion
works, it — not the subscription — is where the money is.
