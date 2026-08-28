# The value summary on the account page

Under Billing on `account.html` there is a section headed **What you've found** —
one hero number, a range toggle (Last 30 days / All time), and a row of tiles:
email addresses, phone numbers, LinkedIn profiles, profiles enriched, websites,
companies, employees.

It exists because the account page is where someone decides whether to keep
paying, and until now that page showed only what they had *spent*.

## The number is what was FOUND, not what was tried

This is the whole difficulty. Hit rates across the lookup types run from ~93%
(company websites) down to ~10% (mobile numbers), so counting rows in
`enrichment_history` would overstate the value several times over — on the one
page where overstating it is most expensive.

Deciding "found" means reading the stored `result`, and the shapes differ per
lookup type and have drifted over time. All of these are misses that a naive
count would score as hits:

| Shape | Meaning | Seen |
| --- | --- | --- |
| `{"result": ""}` | provider returned nothing | 24,754 rows for one type alone |
| `{"result": "Not Found"}` | explicit miss | common |
| `{}` | older rows, no payload | scattered |
| a scrape object whose every field is blank | page loaded, nothing on it | common |
| an employee array whose entries are provider notices | `⚠️ No Leads found`, `❤️ Check the log` | company-domain lookups |

That last one is the nastiest: the notices sit in the array where people go, so
`jsonb_array_length` counts them as employees found.

## Where the counting happens

In Postgres, not in the page — one round trip, and the shape rules live in one
place. `public.user_value_summary(p_user_id text)` is `security definer` and
granted to `anon, authenticated`, matching how the rest of the app reads its own
tables (see `docs/csv-enrichment-history.md` on the RLS posture).

`account.html` POSTs to `rest/v1/rpc/user_value_summary` with the user token and
renders the counts. If `lookups` is 0 the whole section stays hidden — a new
account is better served by no section than by a wall of zeroes.

```sql
create or replace function public.user_value_summary(p_user_id text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
with rows as (
    select type, result, "timestamp" as at
      from public.enrichment_history
     where user_id = p_user_id
),
classified as (
    select
        at,
        case
            when type like '%\_to\_email'  then 'emails'
            when type like '%\_to\_phone'  then 'phones'
            when type in ('lead_full_name_to_linkedin_url', 'email_to_linkedin_url') then 'profiles'
            when type = 'linkedin_profile_to_linkedin_info' then 'profiles_full'
            when type = 'company_name_to_website'           then 'websites'
            when type in ('company_name_to_linkedin_url', 'linkedin_company_to_linkedin_info',
                          'linkedin_company_to_employee_count') then 'companies'
            when type like '%\_to\_employees'               then 'people'
            when type = 'linkedin_post_to_reactions'        then 'people'
            else 'other'
        end as category,
        case
            -- Provider notices ride in the employees array as fake people
            -- ("⚠️ No Leads found"). Requiring the name to start alphanumeric
            -- drops them without maintaining a list of notice strings.
            when jsonb_typeof(result) = 'array' and type like '%\_to\_employees' then (
                select count(*) from jsonb_array_elements(result) e
                 where coalesce(btrim(e->>'name'), '') <> ''
                   and e->>'name' ~ '^[A-Za-z0-9]'
            )
            when jsonb_typeof(result) = 'array' then jsonb_array_length(result)
            when jsonb_typeof(result) = 'object' and result ? 'result' then
                case when coalesce(btrim(result->>'result'), '') <> ''
                      and lower(btrim(result->>'result')) not in
                          ('not found', 'no match', 'n/a', '-', 'null', 'none', 'error')
                     then 1 else 0 end
            -- A scrape returns the record itself rather than a `result` key.
            when jsonb_typeof(result) = 'object' then
                case when coalesce(btrim(result->>'name'), '') <> '' then 1 else 0 end
            else 0
        end::bigint as found
      from rows
)
select jsonb_build_object(
    'total',      coalesce((select sum(found) from classified), 0),
    'lookups',    (select count(*) from classified),
    'first_at',   (select min(at) from classified),
    'last_at',    (select max(at) from classified),
    'all_time',   coalesce((
        select jsonb_object_agg(category, n)
          from (select category, sum(found) as n from classified
                 where found > 0 group by category) x
    ), '{}'::jsonb),
    'last_30',    coalesce((
        select jsonb_object_agg(category, n)
          from (select category, sum(found) as n from classified
                 where found > 0 and at > now() - interval '30 days' group by category) y
    ), '{}'::jsonb)
);
$$;

grant execute on function public.user_value_summary(text) to anon, authenticated;
```

Live on project `snxhsboboatjywgwdeds`. Checked against the owner's own account:
5,319 lookups, 4,983 found.

## Sharing it

The **Share** button next to the range toggle opens a card built for a feed —
their hero number, all seven tiles, and the branding painted into the picture.

The branding has to be *in the image*. A feed crops captions and strips links
out of pictures, so a card without the wordmark and `linkfinderai.com` on it is
an anonymous number that markets nothing. The card is drawn on a `<canvas>` at
1200×675 (rendered at 2×), which is why the logo mark is drawn with paths: a
Font Awesome glyph does not render to canvas.

The **link goes in the post text**, where it is clickable, and it is their own
referral link (`?ref=CODE`, from the existing referral worker — 25% lifetime
commission) whenever that worker knows their code. That is what makes posting
worth their while, and it means every signup this produces already has a payout
attached and shows up in a system we have. Without a code it falls back to the
plain site with UTMs, so the button never breaks. Every link carries
`utm_source=<network>&utm_medium=share&utm_campaign=value_card`, so it is
possible to find out whether any of this actually works.

| Button | What happens |
| --- | --- |
| Copy image | PNG to the clipboard — the only way to get a picture into LinkedIn, X or Slack. Falls back to a download where `ClipboardItem` is missing (Firefox). |
| Download | The PNG, named for the range. |
| LinkedIn | `linkedin.com/feed/?shareActive=true&text=…` — the feed composer keeps the caption, unlike `share-offsite`, which posts a bare URL. |
| X | `twitter.com/intent/tweet` with the caption. A test pins the worst case under 280 characters. |
| Slack | No web composer exists; the caption goes to the clipboard with a note to paste the image under it. |
| Email | `mailto:` with a subject and body. |

The image is copied to the clipboard *before* the composer opens, because the
composer takes the tab.

Two things this must never do, both pinned by `tests/value-share.test.mjs`:

- **Paint anything but totals.** The card is built from a summary that lives
  beside real contact data, and a user broadcasts this. One test collects every
  string the card paints and fails on anything that is not a known label, a
  number, or the branding.
- **Promise a commission to someone with no code.** The footnote only mentions
  25% when a code came back, and it says the referral link is in the post text —
  not on the card, which carries the bare domain. Both are on screen together,
  so a wrong claim there is visible instantly.

The X mark is an inlined SVG: `fa-x-twitter` needs Font Awesome 6.4.2 and all
213 pages here load 6.4.0.

## Two things to know before changing it

**`other` is deliberately not rendered, and the hero does not include it.** The
RPC still classifies and counts it — that is what `total` is for — but the page
sums the tiles it is showing, so the hero always equals what is on screen
underneath it. A tile labelled "Other" is worth nothing to a reader. The cost is
that a new lookup type lands in `other` and stays invisible until someone gives
it a category here and a tile in `VALUE_TILES`; `tests/account-value.test.mjs`
pins that the hero and the tiles agree.

**Don't rebuild this from a page fetch.** The History page's old stats row
reported "1,000 enrichments" for this same account, because the page fetches with
`limit=1000` and counted what came back. Counting in the database is the reason
the figure is right.
