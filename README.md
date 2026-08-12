# LinkFinder AI — OpenAPI Spec

Unofficial OpenAPI 3.0 spec for the [LinkFinder AI](https://linkfinderai.com) API, built from their public docs.

## Files
- `openapi.yaml` — the spec (source of truth)
- `openapi.json` — same spec, JSON format (some tools prefer this)

## How to publish on GitHub
1. Push this repo (or add these files to an existing repo).
2. Get the **raw** file URL, e.g.:
   `https://raw.githubusercontent.com/<your-username>/<repo>/main/openapi.json`
3. Use that raw URL as the "spec URL" input in an API→MCP converter.

## Notes on this spec
- LinkFinder AI uses a **single dispatch endpoint** (`POST /`) — the `type` field in the body selects the operation, rather than separate REST paths per feature. This spec models that as one path with an enum on `type`.
- `linkedin_profile_to_linkedin_info` **always** responds `202` (async) — poll `/status/{job_id}` until `done`.
- Any other endpoint (most commonly `company_domain_to_employees`) can *also* fall back to the same async 202/job_id shape if it runs past ~27 seconds — don't assume a fixed sync response shape purely from the endpoint name.
- Every request costs 1 credit, including failed/empty lookups.
- Auth: `Authorization: Bearer YOUR_API_KEY` on every request.

## Updating
If LinkFinder AI adds endpoints or changes the `type` enum, update the `enum` list under
`components.schemas.EnrichmentRequest.properties.type` in `openapi.yaml`, then re-run the
conversion script below to regenerate `openapi.json`.

```bash
pip install pyyaml
python3 -c "
import yaml, json
with open('openapi.yaml') as f:
    data = yaml.safe_load(f)
with open('openapi.json', 'w') as f:
    json.dump(data, f, indent=2)
"
```
