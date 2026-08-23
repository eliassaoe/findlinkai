# Two live bugs in lead search — found 23 Aug while building an outbound list

> **Bug 1 is now moot: AI lead search was removed from the product on 23 Aug.**
> It is no longer in the MCP server, the n8n node, the API docs or any landing
> page, so no customer can reach the broken Apify actor. Bug 2 still stands —
> `find_company_employees` remains a shipping feature and still leaks the
> actor's placeholder rows when a filter matches nothing.

Both hit paying customers right now. Found by using the product, not reading it.

## 1. `find_leads_ai` returns 403 for everyone

```
403 "full-permission-actor-not-approved"
"This Actor requires full access to your account. You must approve its
 permissions before running it"
approvalUrl: https://console.apify.com/actors/IoSHqwTR9YGhzccez?approvePermissions=true
```

Apify changed its permission model and the actor behind AI lead search now
needs explicit approval. Until someone clicks that URL while logged into the
Apify account, **every AI lead search fails**.

This is not a niche path — `find_leads` is exported from
`mcp-server/src/server.ts`, so every customer driving LinkFinder AI from Claude
or ChatGPT hits it, as does the in-app lead search.

**Fix:** approve the actor at the URL above. Then re-run a search to confirm.

**Then fix it properly:** a 403 from Apify should not surface as a raw
`AxiosError` with a stack trace. It should be caught and returned as "lead
search is temporarily unavailable, no credits charged" — and it must not
charge credits.

## 2. `find_company_employees` returns Apify's placeholder rows AS LEADS

`find_company_employees(company_domain: "belkins.io", seniority: "Founder",
employee_count: 3)` returned:

```json
[ { "name": "❤️ We improve the Actor everyday. Contact us if you are having any issue" },
  { "name": "⚠️  No Leads found. Tweak your filters and try again" } ]
```

Every other field null. These are the Apify actor's own UI placeholder rows,
passed straight through as if they were people. A customer sees two "leads"
whose names are the vendor's marketing copy — which also leaks that the data
comes from a third-party Apify actor.

**Root cause of the empty result:** the `seniority` filter is case-sensitive
against lowercase values. Real records come back as `"seniority": "manager"`,
`"founder"`, `"vp"`, `"head"`, `"entry"`. Passing `"Founder"` matches nothing.
The tool description offers no allowed values, so callers guess.

**Fix, three parts:**
1. Drop any row where `personId` is null before returning. No exceptions —
   a real person always has one.
2. Lowercase the `seniority` and `department` filters server-side.
3. Document the accepted values in the tool description:
   `founder, owner, c_suite, partner, vp, director, head, manager, senior, entry, intern`.
4. Return an empty array for no matches, and do not charge for it.

## What this costs

Unfiltered `find_company_employees` works and returns real, usable records —
name, title, LinkedIn URL, company, and an email for roughly 40% of rows
(5/5 at belkins.io, 2/7 at growleads.io). So the data is good. The wrapper
around it is what is broken.

Also worth knowing: there is **no geography filter** on this path. A search for
US/UK agencies returned an India-based team, because the only inputs are domain,
department and seniority. Building a geo-targeted list means filtering
client-side on the `country` field after paying for the rows.
