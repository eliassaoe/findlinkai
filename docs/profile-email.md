# LinkedIn profile + email (`linkedin_profile_to_profile_email`)

Added 8 Nov 2026. **15 credits.** One LinkedIn profile URL in; the full profile
(name, title, company, location, about, experiences, education, skills) **and**
a deliverable work email out, in one lookup.

## Why it exists

The free list (`/liste-gratuite`) shows people both at once. When they land in
the app after signup, the next list should give them the same thing, already set
up under the panel, so the form is pre-set to this enrichment in list mode
(`lfFreeListPreset()` in `app.html`).

`linkedin_profile_to_linkedin_info` (10 credits) was not good enough for this:
its email field is filled on ~4% of rows. `linkedin_profile_to_email` (10) keeps
its own chain (the anchor actor first) and is unchanged.

## The n8n branch

Workflow "linkfinder ai app v 4" (`LntSghdJrXAAFYmr`), `Switch1` rule 22, every node
named `PE · …`:

1. `PE · harvest (profil + email)` — the harvest Apify actor in "Profile details +
   email search" mode (same call as `LPE backup: LinkedIn profile + email (Apify)`).
   Continues on error / no output.
2. `PE · profil depuis harvest` — maps harvest to the exact keys `Build profile1`
   returns (so the app, API and CSV need nothing new). Keeps an email only when
   `status === 'valid' && !free && !catchAllDomain`.
3. `PE · email manquant ?` — no email → `PE · Filtrat` → `PE · Filtrat adapter`
   → `PE · fusion Filtrat` (adds the Filtrat email; if harvest had no profile,
   takes the name/title/company Filtrat saw).
4. `PE · trouvé ?` — a name or an email is a hit: respond with the profile, then
   the callback (`data: $json`). A miss: `{"result": ""}`, half the credits back
   (`PE · remboursement`), then the empty callback.

`Precheck Credits1.creditCosts` has `'linkedin_profile_to_profile_email': 15`.

Live checks, 8 Nov: Satya Nadella, Jeff Weiner, Bill Gates — profile + work email,
8–13 s each, harvest alone. A made-up URL went through Filtrat, came back empty
and was refunded.

## App side

- `creditCosts` 15, `dataConfigurations.linkedin_profile.outputs.profile_email`,
  picker card, smart-start option.
- `lfProfileOut()` makes every `linkedin_info` profile table/CSV path also serve
  `profile_email`, so its table and export are the LinkedIn Profile Data ones
  (they already have an Email column).
- The background runner (`supabase/functions/csv-batch-runner`, deployed v4 on
  8 Nov) treats it the same way, so a handed-over list exports the same columns.
- `tests/profile-email.test.mjs` pins all of this.

## Rolling back

Remove the `profile_email` output from `dataConfigurations` and the two picker
entries; the n8n branch can stay (nothing else reaches rule 22).
