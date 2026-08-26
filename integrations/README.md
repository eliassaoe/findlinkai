# LinkFinder AI integrations

Every integration in here is generated from one source of truth, so that twenty
operations across half a dozen platforms cannot drift apart.

```
openapi.json  ──┐
                ├──►  catalog/operations.json  ──►  zapier/  make/  n8n  nango  outreach/
catalog/overlay.json ─┘
```

* **`openapi.json`** (repo root) owns *behaviour*: which operations exist, what each
  costs, whether it is always async, what its input looks like.
* **`catalog/overlay.json`** owns *presentation*: labels, categories, which optional
  params apply, and the shape of the result.
* **`catalog/build.mjs`** merges them and **fails** if they disagree — an operation
  added to the spec but not described, a param an operation cannot actually accept, a
  duplicate module key. That check is the whole point: it makes "add an operation
  everywhere" a build error rather than a thing someone has to remember.

## Rebuilding everything

```bash
node catalog/build.mjs        # first — everything else reads its output
node zapier/build.mjs
node make/build.mjs
node ../n8n-nodes-linkfinderai/build.mjs
```

## Credit costs are not uniform

The single most common mistake when wiring these up is assuming every lookup costs 1
credit. It does not, and the generated integrations carry the real numbers:

| Operation | Credits |
| --- | --- |
| `linkedin_profile_to_phone` | **50** |
| `linkedin_profile_to_email`, `linkedin_profile_to_linkedin_info` | 10 |
| `lead_full_name_to_email` | 7 |
| `linkedin_company_to_linkedin_info` | 6 |
| `email_to_linkedin_url` | 5 |
| everything else | 1 |
| employee lists | 0.5 per employee returned |

Every call is charged, **including one that finds nothing**.

> `api-documentation.html` currently contradicts this — it states "every request costs
> 1 credit regardless of endpoint" and shows a 1-credit pill on 13 endpoints. That page
> is wrong; `app.html`'s `creditCosts` and `openapi.json` agree with the table above.
