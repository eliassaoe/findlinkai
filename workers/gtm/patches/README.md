# Patches to the live LinkFinder AI n8n backend

Scripts here take an n8n export of the production app workflow and return a
modified copy. They never touch the running instance — you import the output
as a **new, inactive** workflow, test it, then swap.

Each script refuses to run if the nodes it expects are missing, so an export
from a different version fails loudly instead of patching the wrong thing.

## `add-explee-fallback.py`

Adds Explee `search/people-by-domains` as a third provider on
`company_domain_to_employees`.

```bash
python3 add-explee-fallback.py linkfinder_ai_app_v4.json v5.json
```

The branch today is two Apify actors in sequence:

```
company-employees-scraper  ->  If3: first_name empty?
                                 no  -> Code37 -> respond
                                 yes -> leads-finder-apollo -> Code54 -> respond
```

The patch changes one connection and adds one node:

```
Code54 -> Respond to Webhook30                      (before)
Code54 -> Explee fallback -> Respond to Webhook30   (after)
```

It emits the same `{employees, totalCount, companyName, timestamp}` shape the
other two providers are mapped to, so `If14` still decides the refund on real
numbers and the response contract does not change. Credits and the refund path
are untouched.

**It cannot make the endpoint worse.** No `EXPLEE_API_KEY` env var, an Explee
error, a timeout, an unexpected shape, or nothing found — every one returns its
input unchanged, and the node is `onError: continueRegularOutput` on top of
that. The endpoint behaves exactly as it does today unless Explee adds
something. Verified against fakes: previous step found people (no call at all),
no key (no call), Explee 500, Explee empty, Explee finds, and an n8n with no
`this.helpers.httpRequest` — the first two make no request, all but the last
return the input untouched.

Turn it on with `EXPLEE_API_KEY` in the n8n environment. Cost is Explee's
1 credit per person (first 100 results free), only on domains both Apify actors
already missed, capped at the `employeeLimit` the customer was charged for.

## Before you import: three hardcoded secrets in the export

The v4 export has live credentials in node parameters rather than in n8n
credentials, so they travel with any copy of the file:

| Node | Field | What |
| --- | --- | --- |
| `HTTP Request50` | `parameters.url` | an Apify API token in the query string |
| `HTTP Request32` | `parameters.headerParameters` | a literal `Bearer …` |
| `HTTP Request29` | `parameters.headerParameters` | the same `Bearer …` |

Move them to n8n credentials (the rest of the workflow already uses
`httpQueryAuth` / `httpHeaderAuth` for exactly this) and rotate all three —
the file has been shared at least once. A URL-embedded token is the worst of
the three: it lands in n8n execution logs in plain text.
