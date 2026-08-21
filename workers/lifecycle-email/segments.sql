-- Lifecycle segments for LinkFinder AI.
-- Run in PostHog (Data > SQL). Non-paying users who have a real email address.
--
-- Note the email filter: `person.properties.email != ''` does NOT work here —
-- missing keys slip through and anonymous visitors flood the result (31,925
-- person_ids vs 1,874 real ones). Test for the '@' instead.

SELECT
    multiIf(
        paid        > 0, '0. PAYING - exclude from all campaigns',
        picked_plan > 0, '1. Picked a plan, never paid',
        saw_pricing > 0, '2. Saw pricing, never picked a plan',
        hit_wall    > 0, '3. Hit the credit wall, never saw pricing',
        lookups    >= 3, '4. Active (3+ lookups), never upgraded',
        lookups     > 0, '5. Tried once or twice, went quiet',
                         '6. Signed up, never ran a lookup'
    )                        AS segment,
    count()                  AS people,
    round(avg(lookups), 1)   AS avg_lookups
FROM (
    SELECT
        person_id,
        countIf(event = 'checkout_payment_success') AS paid,
        countIf(event = 'plan_selected')            AS picked_plan,
        countIf(event = 'pricing_modal_opened')     AS saw_pricing,
        countIf(event = 'credits_exhausted')        AS hit_wall,
        countIf(event = 'enrich_started')           AS lookups
    FROM events
    WHERE timestamp >= now() - INTERVAL 120 DAY
      AND position(toString(person.properties.email), '@') > 0
    GROUP BY person_id
)
GROUP BY segment
ORDER BY segment;

-- Addresses for one segment (swap the HAVING clause to change segment).
-- Pipe the output through clean.py before loading it anywhere.
--
-- SELECT toString(person.properties.email) AS email,
--        countIf(event = 'enrich_started') AS lookups,
--        argMaxIf(toString(properties.plan), timestamp, event = 'plan_selected') AS plan_picked,
--        toDate(max(timestamp)) AS last_seen
-- FROM events
-- WHERE timestamp >= now() - INTERVAL 120 DAY
--   AND position(toString(person.properties.email), '@') > 0
-- GROUP BY email
-- HAVING countIf(event = 'checkout_payment_success') = 0
--    AND countIf(event = 'plan_selected') > 0
-- ORDER BY lookups DESC;
