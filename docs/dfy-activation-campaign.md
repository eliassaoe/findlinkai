# Done For You — the activation campaign, and a correction

**Date:** 2026-08-31 · **Source:** Supabase `snxhsboboatjywgwdeds`, measured live.

## The correction first

`docs/ai-sdr-offer.md` said *"of 120 paying accounts, 68 had never run a single
enrichment."* The count is right. **The label is wrong**, and it points the
campaign at the wrong people.

Measured now:

| cohort | accounts | never ran | confirmed in `auth.users` | median idle credits |
| --- | --- | --- | --- | --- |
| subscribers (`subscription_id is not null`) | **31** | **1** | 1 | 4,995 |
| pack buyers (`is_unlimited`, no subscription) | **89** | **67** | 18 | 10,000 |

The "120" was `is_unlimited`, which CLAUDE.md already warns is **not** a
subscriber flag — credit-pack buyers carry it too. So:

- **There is no dormant-subscriber problem.** 30 of 31 subscribers use the tool.
  The churn story that number implied does not exist.
- **The dormant money is credit-pack buyers.** 67 people paid once, never ran a
  single lookup. Median balance 10,000 credits — that is the **$200 pack**. They
  each spent real money and got nothing back.

That reframes the offer. A pack buyer who never activated is not a lapsed user
to win back; they are someone who bought a tool to do a job and then did not do
the job. That is the strongest possible qualification for done-for-you, and it
is why this list is worth the send despite being small.

## The list

```sql
select lu.email, lu.first_name, lu.credits
from linkfinderai_users lu
left join auth.users au on lower(au.email) = lower(lu.email)
left join (select user_id, count(*) n from enrichment_history group by user_id) h
       on h.user_id = lu.token
where lu.subscription_id is null
  and lu.is_unlimited
  and coalesce(h.n, 0) = 0
order by lu.credits desc;
```

67 rows. Not committed here — customer emails do not belong in git.

## Two constraints that shape the send

**Only 12 of 67 have a first name.** Any template opening `Bonjour {{first_name}}`
breaks for 55 people. The copy below is nameless by design.

**Only 18 of 67 are confirmed in `auth.users`.** Per
`docs/email-verified-is-wrong.md`, that is the only trustworthy signal, and
`email_verified` is useless here. These people did pay, so their addresses are
likelier real than a random signup's — but the account email need not be the
Stripe email.

## Do not run this in Instantly

67 addresses, an offer with a $750/month floor, sold by the founder. Cold-email
tooling is the wrong instrument: it risks the sending domains on a list with 49
unconfirmed addresses, and it strips the one advantage this send has, which is
that it comes from a person the recipient has already paid.

Send from the personal inbox, in two waves — the 18 confirmed first, check for
bounces, then the rest. Reply-rate is the metric. Per
`docs/revenue-levers-2026-08.md`, PostHog flags **100% of email opens and clicks
as bot traffic**, so opens and clicks measure nothing. **Booked calls are the
metric.**

## The email

Modelled on an outbound mail that works: an observation, the pain named
plainly, the mechanics in one sentence, the risk reversal, a question that is
easy to answer. No links, no formatting, no pitch.

### English

> **Subject:** your LinkFinder credits
>
> You bought credits on LinkFinder AI and never ran a single lookup.
>
> That is rarely the tool. Building the list, writing the sequence, chasing the
> replies and getting the meeting booked is a job of its own, and it is the
> first one that gets dropped.
>
> That part is what we do now. I build the list of companies to contact, run the
> campaign, handle the replies, and the meeting lands in your calendar.
>
> $150 per meeting that actually holds, five a month minimum. Your credits stay
> on your account either way — they do not expire.
>
> Worth a quick word?
>
> Eliasse

### French

> **Objet :** vos crédits LinkFinder
>
> Vous avez acheté des crédits sur LinkFinder AI sans jamais lancer une seule
> recherche.
>
> Ce n'est presque jamais l'outil. Construire la liste, écrire la séquence,
> relancer, décrocher le rendez-vous — c'est un travail à part entière, et c'est
> le premier qu'on repousse.
>
> C'est cette partie que je prends en charge. Je gère la liste des entreprises à
> contacter, la campagne, les réponses et le rendez-vous dans votre agenda.
>
> 150 $ par rendez-vous tenu, 5 par mois minimum. Vos crédits restent sur votre
> compte, ils n'expirent pas.
>
> Ça vaudrait le coup d'en parler ?
>
> Eliasse

### The one bump, 4 days later

> Still worth a word? If outbound is not a priority right now, say so and I will
> leave it there — your credits keep.

## Say the minimum out loud

The model email this is built on says *"vous ne payez qu'au rendez-vous tenu"*
with no floor. Ours has one: **five meetings a month, so $750 minimum.** Leaving
that out reads as pay-per-meeting with no commitment and gets discovered on the
call, which costs more than the reply it wins. It stays in the copy.
