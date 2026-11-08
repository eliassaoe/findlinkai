# /liste-gratuite — the free 50-profile list (fixed 8 Nov 2026)

French landing page: drop a list of LinkedIn URLs (or first name / last name /
company), get up to 50 full profiles + emails, download after a free signup.

## What was wrong

1. **Lookups in parallel.** 4 people at a time, and for each the profile and the
   email at once: 8 calls in flight against `linkedin-url-finder` and
   `linkfinder-free-tools`. The only real run in the last 30 days
   (`fr_list_run`): 50 rows, **41 errors**, 9 found.
2. **No clear call to action at the end** — a button under the results, easy to
   miss.
3. **The promised download never happened.** The page saves the CSV in
   `localStorage.lf_free_list_results` and says "vous créez votre compte en 1
   clic et il se télécharge", but `app.html` had no `lfDownloadFreeList` — new
   accounts landed in the app with no file.

## What changed

- One person at a time; profile, then email. Each call retried 3 times (0 s,
  1.5 s, 4 s); rows still failing get one more pass at the end
  (`fr_list_second_pass`). A note tells people to keep the page open.
- End of run: popup "Votre liste est prête — X profils complets et Y emails",
  primary **Continuer avec Google et télécharger** (`/sign-up?google=1`),
  secondary email signup, "gratuit, sans carte bancaire … crédits gratuits", and
  "les N autres lignes vous attendent dans l'app" when the file had more than 50.
  Signed-in visitors get "Télécharger ma liste" instead. Events
  `fr_list_modal_shown`, `fr_list_modal_clicked {choice}`, `fr_list_modal_closed`.
- Each row now shows the person's last 3 experiences and 2 educations ("+ N dans le
  fichier" for the rest), so the value is visible before signup. The email stays
  masked (`j•••••@acme.com`) — that is what the signup unlocks.
- `app.html` `lfDownloadFreeList()`: on the first signed-in load (1.5 s after
  `checkAuth`), downloads the saved CSV once if under 7 days old, removes it,
  shows a confirmation, fires `fr_list_downloaded_after_signup`.
- The service-down message compared errors per person to calls made, so it
  could never fire; it now fires when every person failed.

Tested in Playwright with both workers mocked: max 1 call in flight, 3 forced
failures all recovered, popup shown, and the app downloaded the file after
"signup". Pinned by `tests/liste-gratuite.test.mjs`.

**Live results (same day):** two lanes, one per service — while person N's email
is searched, person N+1's profile loads (`profileStage` / `emailStage`), so each
service still sees one call at a time but the list runs about twice as fast.
Each card appears when its person starts (shimmer placeholder), the profile shows
the moment it arrives (photo when the profile service returns a LinkedIn image
URL, otherwise initials; experiences and education fade in one by one), and the
email pops in green. Two live counters (profils, emails) and a progress bar sit
above the results. Tested with 8 people and forced failures: max 1 call in
flight per service, 8/8 recovered.

**Conversion pass (same day):** a reassurance line under the headline (50 profils
gratuits · sans carte · CSV prêt pour votre ATS); in the popup, a setup-call offer
("Vous recrutez en volume ? 15 min avec Eliasse") to
`calendly.com/hamoureliasse/linkfinder-ai?utm_source=liste-gratuite`; a bar fixed
at the bottom after the run ("Votre liste de N profils est prête → Créer mon compte
et télécharger") for people who close the popup; and under the tool, "Ce que vous
recevez", "Après les 50 premiers" with a signup button, and a "Un sourcing sur
mesure ?" call card. Events: `fr_list_sticky_shown/clicked`,
`fr_list_call_clicked {where}`, `fr_list_signup_clicked`.

**Measure:** `fr_list_run.failed` (was 41/50), `fr_list_modal_clicked`, signups
with `data-cta=fr_modal_google`, `fr_list_downloaded_after_signup`, then payments.

## Profiles were empty on the live page (fixed 8 Nov 2026)

Live test with 5 known profiles: emails came back, profile data never did. The
page called `linkedin-url-finder.hamoureliasse.workers.dev`, and that worker no
longer exists in the Cloudflare account (the browser reports "Failed to fetch").
`/linkedin-profile-scraper` called the same dead worker, single and bulk.

Both now call `linkfinder-free-tools` with `type: 'linkedin_profile_to_linkedin_info'`
and `input_data: <url>` — n8n "Linkfinderai free tools" (`KmQzVWHBMOXOWXZD`),
Switch output 4 (Apify profile scraper, harvestapi backup). Same shape as before:
`name, jobTitle, company, location, experiences[], education[] {school, degree,
fieldOfStudy, startDate, endDate}, profilePic` (host `storage.googleapis.com`,
now allowed for the avatar). Checked live: Bill Gates in ~5 s with 3 experiences.

## From the landing page into the app (8 Nov 2026, owner's call)

No download on the landing page any more — the free list is the hook into the app:
- Not signed in: every download button goes to `/sign-up?google=1`.
- Signed in: they go to `/app?action=free_list`.
- In the app, `lfDownloadFreeList()` opens a "Votre liste gratuite est prête" panel
  above the search: the table (name, title, company, email, LinkedIn), **Télécharger
  ma liste (CSV)**, and **Lancer une nouvelle liste →**, which scrolls to and
  highlights the upload area. Since 8 Nov the form under the panel is already set
  to **LinkedIn profile + email** (15 credits, `docs/profile-email.md`) in list
  mode the moment the panel opens (`lfFreeListPreset()`), so the next list is one
  drop away; plus "Vous avez N crédits : de quoi obtenir le profil complet et
  l'email de N/15 personnes de plus".
  Kept 7 days or until closed. All values rendered with `textContent`.
- Events: `fr_list_opened_in_app`, `fr_list_downloaded_in_app`,
  `fr_list_next_list_clicked`, `fr_list_panel_closed`.
