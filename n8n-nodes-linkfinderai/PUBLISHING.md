# Publishing `n8n-nodes-linkfinderai`

Two separate things, in order. **Publishing to npm** makes the node installable
by anyone self-hosting n8n. **Verification by n8n** is what puts it in the
in-app node list on n8n Cloud, which is where the distribution actually is.

## State of the package

Checked 2026-08-23 on this branch:

| check | result |
| --- | --- |
| `npm run build` | clean |
| `npm run lint` (eslint-plugin-n8n-nodes-base) | clean, 0 warnings |
| `npm pack --dry-run` | 9 files, 8.6 kB |
| Name free on npm | yes — registry returns 404 for `n8n-nodes-linkfinderai` |
| Runtime dependencies | none (verification requires this) |
| Operations | 17 across 7 resources, matching the MCP server |
| AI lead search | removed — see `docs/lead-search-bugs.md` |

Never published. Version is `0.1.0` and should stay there for the first
release: nobody has yet run this inside a real n8n instance, and patching
`0.1.x` after the first bug report is less awkward than patching `1.0.1`.

---

## Part 1 — publish to npm

### Route A — GitHub Actions (preferred)

`.github/workflows/publish-n8n-node.yml`. The token lives in repo secrets, so
it never enters a shell history or a chat transcript, and every future release
is one button.

1. Create the token on npm: **Access Tokens → Generate New Token**.
   - A **Granular Access Token** is the safer kind, but for the *first* publish
     of a name that does not exist yet it cannot be scoped to this package —
     there is nothing to select — so it has to be "All packages" this once.
     After the first publish, replace it with one scoped to
     `n8n-nodes-linkfinderai` only.
   - A classic **Automation** token also works and is account-wide by design.
   - Either kind publishes without an interactive 2FA prompt. That is what they
     are for; it is not a way around the account's protection.
2. GitHub → repo → **Settings → Secrets and variables → Actions → New
   repository secret**, named exactly `NPM_TOKEN`.
3. **Actions → Publish n8n node → Run workflow**, leaving `dry_run` **checked**.
   That builds, lints, verifies the version is not already on the registry, and
   uploads the tarball as an artifact without publishing anything.
4. Download the artifact, check the file list, then run it again with `dry_run`
   **unchecked**.
5. Once it succeeds, narrow or delete the token.

The workflow is dispatch-only on purpose. A push trigger would be a trap: npm
version numbers can never be reused, so an accidental merge burns one forever.

### Route B — publish from your own machine

Needs an interactive `npm login` with 2FA, which is why this one cannot be done
from an agent session. From `n8n-nodes-linkfinderai/`:

```bash
npm login                 # opens a browser; use the LinkFinder AI npm account
npm whoami                # confirm it took
npm run build && npm run lint
npm publish --access public
```

`prepublishOnly` is deliberately not wired up — build and lint are above so a
failure stops you before the irreversible step. **npm publishes are permanent:**
a version number can never be reused, even after `npm unpublish`.

Either route, confirm afterwards:

```bash
npm view n8n-nodes-linkfinderai
```

### Smoke-test it for real before telling anyone

```bash
npx n8n                                   # http://localhost:5678
# Settings → Community nodes → Install → n8n-nodes-linkfinderai
```

Add the credential with a real API key (the credential test spends 1 credit on
a `company_name_to_website` lookup for Tesla — that is intentional, it proves
the key *and* the balance are live). Then run one of each shape, because they
fail differently:

- **Company → Website** — plain synchronous path.
- **LinkedIn Profile → Full Info** — the always-async path. Check that "Wait
  for Completion" returns a result rather than a `job_id`, and that turning it
  off returns a `job_id` the **Job → Check Status** operation can finish.
- **Company → Domain → Employees** — the one with extra filter fields.
- A deliberately bad API key — the error should be readable, not a stack trace.

Nothing in this package has ever executed inside n8n. Assume the first run
finds something.

---

## Part 2 — submit for verification

Verified nodes appear in the n8n Cloud node panel without the user installing
anything. This is the part that is worth real traffic; the npm publish alone
only reaches self-hosters who go looking.

Submit at <https://n8n.io/submit-community-node> (n8n's docs page for this is
*Creating and submitting community nodes* — check it for the current form URL
before filling anything in, they move it).

Requirements this package already meets:

- name starts with `n8n-nodes-`
- `n8n-community-node-package` in `keywords`
- MIT licence
- **no runtime dependencies** — the usual rejection reason, and the reason this
  node talks to the API with n8n's own `httpRequestWithAuthentication` instead
  of axios
- `n8nNodesApiVersion: 1`
- published on npm publicly (Part 1 first — they will not review an unpublished
  package)

Review is a queue and takes weeks of calendar time and almost none of ours.
**Submit early and let it sit.** Same applies to the Zapier and Make app
directories, which are the other two-thirds of the same distribution play.

---

## What this is for

Per `docs/data-provider-angle.md` §7, integrations are a **distribution** play,
not a retention one. An integration only retains a customer who actually builds
a workflow, and most never will. What the three directories give us is free,
permanent, intent-qualified discovery in the exact places the target ICP —
lead-gen agencies and RevOps consultancies — already work.

So: get listed, do not over-build.
