# What each lead source can actually do

Measured in a live session, not read off a docs page. Written down because
the session that measured it does not survive.

## LinkFinder `find_leads_ai` — batch size has a hard ceiling

| fetch_count | behaviour |
| --- | --- |
| 10 | synchronous, returns in a couple of seconds |
| 100 | returns `status: processing` + a `job_id`, and then **never finishes** |

Four separate 100-lead queries were fired at once. All four were still
`processing` nine minutes later, past the ten-minute mark at which results
expire. Nothing came back from any of them.

So: **do not ask for 100.** Stay at or near 10 per call and make more
calls. If a larger batch is ever needed, treat `processing` as a warning
rather than a normal path — the synchronous answer is the one that works.

Whether those four calls consumed credits is not established. Check the
balance after any run that ends this way.

## LinkFinder `find_company_employees` — flaky, roughly half the time

Answers `HTTP 200` / `status: "success"` with a fake person whose only
non-null field is a status message:

    {"personId": null, "name": "We are on maintenance. Check back in 48hrs"}

Measured across ~20 calls: about half, interleaved with good answers for
similar domains seconds apart. Not an outage — a coin flip. Handled by
`outbound/build_campaign.py` (`provider_outage`, `OUTAGE_RETRIES`); see
the README there.

## G2 — reachable only through the MCP connector

`data.g2.com`, `api.g2.com` and `g2.com` are all refused at the egress
proxy's CONNECT step from inside an agent session. A `G2_API_TOKEN` does
**not** help here; it only helps on a normal machine, which is why
`outbound/source_g2.py` is written to run there.

Through the MCP connector, a buyer-scoped account gets:

- `list_categories` — the full taxonomy, 2,287 of them
- `show_category` with `include=products` — **the top 5 products only**,
  with domain, review_count and star_rating
- `list_vendors` — unscoped, 230,194 rows, but with no category or name
  filter, so not siftable
- `list_products` — returns 0 rows for every filter. Entitlement-gated.

Consequence for planning: G2 yields about **1.6 in-band prospects per
category call**, so a 200-prospect list is roughly 125 category calls plus
one enrichment call per prospect. There is no bulk path.
