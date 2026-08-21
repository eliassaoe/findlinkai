-- Per-variant performance for the lifecycle emails. This is the query the weekly
-- job runs; everything it decides comes out of these rows.
--
-- The trick that makes this work with no extra instrumentation: PostHog stamps
-- $email_subject on every engagement event. Subjects are unique per variant in
-- variants.json, so the subject IS the variant label. No A/B split node, no UTM
-- convention to keep in sync, nothing to forget when swapping copy.
--
-- ($workflow_action_id alone is not a key - 'email_1' exists in three different
-- workflows - so the grain is workflow + action + subject.)
--
-- Read the columns in this order and no other:
--   converted  -> the only number that decides anything
--   clicked    -> the tiebreak, and the leading indicator while conversions are thin
--   opened     -> DIAGNOSTIC ONLY. Apple Mail Privacy Protection fires opens for
--                 people who never looked, inflating this 12-18%. A subject that
--                 wins opens and loses clicks is curiosity bait and must lose.
--   bounced / failed -> deliverability alarm, not a ranking signal.
--
-- Requires Settings -> Workflows -> Engagement events to be ON. It does not
-- backfill, so rows only exist from the day that was switched on.

WITH
    -- One row per person per variant, at the moment it was sent to them.
    sends AS (
        SELECT
            properties.$workflow_id        AS workflow_id,
            properties.$workflow_action_id AS action_id,
            properties.$email_subject      AS subject,
            person_id                      AS pid,
            min(timestamp)                 AS sent_at
        FROM events
        WHERE event = '$workflows_email_sent'
          AND timestamp > now() - INTERVAL {window_days} DAY
        GROUP BY workflow_id, action_id, subject, pid
    ),

    -- Opens and clicks are counted per PERSON, not per event: one person opening
    -- five times is one opener. Counting events would let a single obsessive
    -- reader outvote a hundred people.
    engagement AS (
        SELECT
            properties.$workflow_id        AS workflow_id,
            properties.$workflow_action_id AS action_id,
            properties.$email_subject      AS subject,
            uniqIf(person_id, event = '$workflows_email_delivered')    AS delivered,
            uniqIf(person_id, event = '$workflows_email_opened')       AS opened,
            uniqIf(person_id, event = '$workflows_email_link_clicked') AS clicked,
            uniqIf(person_id, event = '$workflows_email_bounced')      AS bounced,
            uniqIf(person_id, event IN ('$workflows_email_blocked', '$workflows_email_failed')) AS failed
        FROM events
        WHERE event IN (
                  '$workflows_email_delivered', '$workflows_email_opened',
                  '$workflows_email_link_clicked', '$workflows_email_bounced',
                  '$workflows_email_blocked', '$workflows_email_failed')
          AND timestamp > now() - INTERVAL {window_days} DAY
        GROUP BY workflow_id, action_id, subject
    ),

    -- Every event that counts as a win for some step, kept flat so the join below
    -- can pick the right one per step.
    goal_hits AS (
        SELECT person_id AS pid, event, timestamp
        FROM events
        WHERE event IN ('enrich_started', 'checkout_payment_success',
                        'payg_credits_purchased', 'payment_succeeded_server')
          AND timestamp > now() - INTERVAL {window_days} DAY
    ),

    -- A conversion only counts inside the attribution window AFTER the send.
    -- Without the lower bound, someone who already paid last month would be
    -- credited to whatever email happened to land afterwards.
    converted AS (
        SELECT
            s.workflow_id AS workflow_id,
            s.action_id   AS action_id,
            s.subject     AS subject,
            uniq(s.pid)   AS converted
        FROM sends AS s
        INNER JOIN goal_hits AS g ON g.pid = s.pid
        WHERE g.timestamp > s.sent_at
          AND g.timestamp < s.sent_at + INTERVAL {attribution_days} DAY
          AND g.event = multiIf(
                s.action_id = 'email_upgrade', 'checkout_payment_success',
                s.action_id IN ('email_welcome', 'email_no_lookup'), 'enrich_started',
                s.workflow_id = '01a0257d-5b54-0000-42a7-fcd74f8a0a1d', 'enrich_started',
                'checkout_payment_success')
        GROUP BY workflow_id, action_id, subject
    )

SELECT
    s.workflow_id                                   AS workflow_id,
    s.action_id                                     AS action_id,
    s.subject                                       AS subject,
    uniq(s.pid)                                     AS sent,
    max(e.delivered)                                AS delivered,
    max(e.opened)                                   AS opened,
    max(e.clicked)                                  AS clicked,
    max(e.bounced)                                  AS bounced,
    max(e.failed)                                   AS failed,
    max(coalesce(c.converted, 0))                   AS converted,
    round(max(e.clicked)   / nullif(uniq(s.pid), 0), 4) AS click_rate,
    round(max(coalesce(c.converted, 0)) / nullif(uniq(s.pid), 0), 4) AS conversion_rate,
    round(max(e.opened)    / nullif(uniq(s.pid), 0), 4) AS open_rate_diagnostic_only,
    min(s.sent_at)                                  AS first_sent,
    max(s.sent_at)                                  AS last_sent
FROM sends AS s
LEFT JOIN engagement AS e
       ON e.workflow_id = s.workflow_id AND e.action_id = s.action_id AND e.subject = s.subject
LEFT JOIN converted AS c
       ON c.workflow_id = s.workflow_id AND c.action_id = s.action_id AND c.subject = s.subject
GROUP BY workflow_id, action_id, subject
ORDER BY action_id ASC, conversion_rate DESC, click_rate DESC
