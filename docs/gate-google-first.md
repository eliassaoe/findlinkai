# Free-limit gate: Google first

**Shipped:** 2026-10-31 · `js/lf-gate.js` (`addGoogleToGate`), `sign-up.html` (`?google=1&source=gate`)

## Why

US visitors, 60 days to 2026-10-31 (PostHog, IP country = US):

| step | people |
| --- | --- |
| Hit the free-limit gate on a tool page | 208 |
| Clicked its button ("Create free account") | 57 (27%) |
| Signed up afterwards | 34 (16%) |
| Paid | 0 |

The button went to `/sign-up`, a second page asking them to choose again. Of
the people who click "Continue with Google" there, ~90% finish signing up; the
email form loses people to typos, passwords and `server_error`.

## What changed

- The gate's main button is now **Continue with Google**. It links to
  `/sign-up?google=1&source=gate`, which starts the Google redirect on load
  (the same hand-off `/agency` already used), so it's one click from the tool
  page to the Google account picker.
- The old link stays under it as **or sign up with email**.
- Installed by `lf-gate.js` at runtime, so all 26 `#limitModal` copies get it
  without editing each page.

## How to read it

- `free_limit_cta_clicked` has `method: 'google' | 'email'`.
- `signup_google_autostart` and `signup_google_clicked` have `source: 'gate_modal'`.
- **Re-check around 2026-11-30:** US gate-hit → signup rate against the 16%
  above. If it isn't higher, roll back by removing the
  `addGoogleToGate(modal);` call in `watchGate()`.
