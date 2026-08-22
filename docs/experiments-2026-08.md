# Experiment readout - 22 Aug 2026

Both experiments had been running since 2 May 2026 (~16 weeks) with no
decision taken. Numbers below are person-level, from exposure
(`$feature_flag_called`) through `signup_success` through `enrich_started`,
over the full run.

Activation is measured deliberately: a copy or gating change that buys
signups by lowering the bar can look like a win and cost you the funnel one
step later. Neither of these does that - activation is flat in both.

## Search Limit Test (`search-limit-test`) - 369630

10 free searches (control) vs 5 (test).

| variant | exposed | signups | rate | activated | activation of signups |
|---------|--------:|--------:|-----:|----------:|----------------------:|
| control |   4,607 |     169 | 3.67% |       122 | 72.2% |
| test    |   4,469 |     199 | 4.45% |       143 | 71.9% |

- Signup rate: **+21.4% relative**, z = 1.89, **two-tailed p = 0.058**.
- Activation among signups is unchanged (72.2% vs 71.9%), so the extra
  signups are the same quality as the old ones. The stated hypothesis was
  "more signups without significantly hurting activation" - that second
  half holds.
- On the compound metric (activated users per person exposed: 2.65% vs
  3.20%) the same +21% shows up but p = 0.12, because the conversion is
  rarer and the arms are small.

**Verdict: directionally a winner, a hair short of significance.** Either
ship the 5-search arm (downside is bounded - activation is flat, so the
worst case is the +21% shrinking toward zero, not a hidden cost), or leave
it running 3-4 more weeks to cross p < 0.05. Do not leave it running
another 16 weeks undecided.

## Modal Limit Copy Test (`modal-limit-copy-test`) - 369627

Scarcity headline ("you've used your searches") vs momentum ("you're
getting results").

| variant | exposed | signups | rate | activated | activation of signups |
|---------|--------:|--------:|-----:|----------:|----------------------:|
| control |   8,900 |     365 | 4.10% |       257 | 70.4% |
| test    |   8,968 |     376 | 4.19% |       281 | 74.7% |

- Signup rate: +2.2% relative, z = 0.31, p = 0.76. Flat.
- The hypothesis was **at least +15%**. The observed effect is +2.2%, and
  +15% sits at the very edge of the confidence interval. The headline
  rewrite is not doing what it was supposed to do.
- Activation among signups looks better for the test arm (70.4% -> 74.7%)
  but p = 0.19. Suggestive, not real.

**Verdict: no winner. Call it.** The test arm is marginally ahead on every
metric and behind on none, so shipping it costs nothing - but the honest
read is that limit-modal headline copy is not a lever worth another
sixteen weeks. Free the slot for a test with more room in it.

## Note on what was not done

These were left running rather than concluded in PostHog. Ending an
experiment implies rolling a variant to 100%, which is a code change and a
judgement call about the p = 0.058 above - that belongs to whoever is
watching the result, not to an unattended job.
