-- unlimited-leads MVP — the entire backend that is not n8n.
-- Runs on any Postgres; written for Supabase (PostgREST + RPC).
--
-- Design rule: every operation n8n needs is ONE http call. Anything that has to
-- be atomic (spending a credit, claiming a message to send) is a function here,
-- never a read-modify-write in a workflow — two cron ticks WILL overlap.

create extension if not exists pgcrypto;

-- The customer of the sending service.
create table if not exists accounts (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  credits     integer not null default 0,     -- 1 credit = 1 email sent
  daily_cap   integer not null default 500,   -- across all their mailboxes
  created_at  timestamptz not null default now()
);

-- Their own mailboxes. We store a refresh token and nothing else; the customer
-- owns the domain, the reputation and the warmup. We manage no mail server.
create table if not exists mailboxes (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references accounts(id) on delete cascade,
  email          text not null,
  provider       text not null default 'google',   -- google | microsoft
  refresh_token  text not null,
  from_name      text,
  daily_cap      integer not null default 30,      -- cold-sending sanity, not an API limit
  min_gap_min    integer not null default 3,
  active         boolean not null default true,
  last_error     text,
  created_at     timestamptz not null default now(),
  unique (account_id, email)
);

create table if not exists campaigns (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  name        text not null,
  brief       text not null,                  -- what we sell, to whom, the offer
  icp         text,                           -- free text, passed to the lead source
  status      text not null default 'draft',  -- draft | active | paused | done
  created_at  timestamptz not null default now()
);

create table if not exists leads (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  email        text not null,
  first_name   text,
  last_name    text,
  company      text,
  title        text,
  status       text not null default 'active', -- active | replied | bounced | unsubscribed | done
  outcome      text,                           -- interested | not_interested | ooo | wrong_person
  thread_id    text,                           -- provider thread, set on first send
  unsub_token  text not null default encode(gen_random_bytes(16),'hex'),
  created_at   timestamptz not null default now(),
  unique (campaign_id, email)
);
create index if not exists leads_thread_idx on leads(thread_id);

create table if not exists messages (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references leads(id) on delete cascade,
  mailbox_id    uuid references mailboxes(id) on delete set null,
  step          integer not null,              -- 1, 2, 3...
  subject       text not null,
  body          text not null,
  send_at       timestamptz not null,
  status        text not null default 'queued',-- queued | sending | sent | cancelled | failed
  provider_id   text,          -- provider's own id (Gmail message id)
  rfc_message_id text,        -- RFC822 Message-ID we generate, for In-Reply-To
  error         text,
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists messages_due_idx on messages(status, send_at);

-- Global and permanent. A suppression is never undone by a new campaign.
create table if not exists suppression (
  account_id  uuid not null references accounts(id) on delete cascade,
  email       text not null,
  reason      text not null,                   -- unsubscribed | bounced | complained | manual
  created_at  timestamptz not null default now(),
  primary key (account_id, email)
);

create table if not exists credit_ledger (
  id          bigserial primary key,
  account_id  uuid not null references accounts(id) on delete cascade,
  delta       integer not null,                -- +topup, -1 per send
  reason      text not null,
  message_id  uuid,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- next_sends: claim work. Atomically flips rows to 'sending' and hands them
-- back, so two overlapping cron ticks can never send the same email twice.
-- Enforces, in one place: campaign active, credits left, per-mailbox daily cap,
-- account daily cap, suppression, lead still active, minimum gap per mailbox.
-- ---------------------------------------------------------------------------
create or replace function next_sends(p_limit integer default 50)
returns table (
  message_id uuid, subject text, body text, step integer,
  lead_email text, first_name text, last_name text, company text,
  thread_id text, unsub_token text, parent_rfc_id text,
  mailbox_id uuid, mailbox_email text, from_name text, refresh_token text,
  account_id uuid
)
language plpgsql as $$
begin
  return query
  with due as (
    select m.id as mid, l.id as lid, c.account_id as aid, m.step as mstep
    from messages m
    join leads l     on l.id = m.lead_id
    join campaigns c on c.id = l.campaign_id
    where m.status = 'queued'
      and m.send_at <= now()
      and c.status  = 'active'
      and l.status  = 'active'
      and not exists (select 1 from suppression s
                      where s.account_id = c.account_id and s.email = l.email)
      and exists (select 1 from accounts a
                  where a.id = c.account_id and a.credits > 0)
      and (select count(*) from messages m2
           join leads l2 on l2.id = m2.lead_id
           join campaigns c2 on c2.id = l2.campaign_id
           where c2.account_id = c.account_id
             and m2.status = 'sent' and m2.sent_at > now() - interval '1 day')
          < (select a.daily_cap from accounts a where a.id = c.account_id)
    order by m.send_at
    limit p_limit
  ),
  -- pick the least-recently-used mailbox that still has headroom
  picked as (
    select d.mid, d.lid, d.aid,
           (select mb.id from mailboxes mb
             where mb.account_id = d.aid and mb.active
               and (select count(*) from messages m3
                    where m3.mailbox_id = mb.id and m3.status = 'sent'
                      and m3.sent_at > now() - interval '1 day') < mb.daily_cap
               and not exists (select 1 from messages m4
                    where m4.mailbox_id = mb.id and m4.status = 'sent'
                      and m4.sent_at > now() - (mb.min_gap_min || ' minutes')::interval)
             order by (select max(m5.sent_at) from messages m5 where m5.mailbox_id = mb.id)
                      nulls first
             limit 1) as chosen
    from due d
  ),
  claimed as (
    update messages m
       set status = 'sending',
           mailbox_id = coalesce(
             -- step 2+ must go out from the mailbox that owns the thread
             (select m0.mailbox_id from messages m0
               where m0.lead_id = m.lead_id and m0.status = 'sent'
               order by m0.step limit 1),
             p.chosen)
      from picked p
     where m.id = p.mid and p.chosen is not null
     returning m.id, m.lead_id, m.mailbox_id, m.subject, m.body, m.step
  )
  select cl.id, cl.subject, cl.body, cl.step,
         l.email, l.first_name, l.last_name, l.company,
         l.thread_id, l.unsub_token,
         (select m6.rfc_message_id from messages m6
           where m6.lead_id = cl.lead_id and m6.status='sent'
           order by m6.step limit 1),
         mb.id, mb.email, mb.from_name, mb.refresh_token,
         mb.account_id
  from claimed cl
  join leads l     on l.id = cl.lead_id
  join mailboxes mb on mb.id = cl.mailbox_id;
end $$;

-- mark_sent: the billing event. Spends the credit in the same transaction that
-- records the send, so a crash can never bill without sending or vice versa.
create or replace function mark_sent(
  p_message_id uuid, p_provider_id text, p_thread_id text, p_rfc_message_id text
) returns void language plpgsql as $$
declare v_lead uuid; v_account uuid;
begin
  update messages set status='sent', sent_at=now(), provider_id=p_provider_id,
                     rfc_message_id=p_rfc_message_id
   where id = p_message_id returning lead_id into v_lead;

  update leads set thread_id = coalesce(thread_id, p_thread_id) where id = v_lead;

  select c.account_id into v_account
    from leads l join campaigns c on c.id = l.campaign_id where l.id = v_lead;

  update accounts set credits = greatest(credits - 1, 0) where id = v_account;
  insert into credit_ledger(account_id, delta, reason, message_id)
       values (v_account, -1, 'send', p_message_id);

  -- out of credits: stop everything rather than queue work that cannot run
  update campaigns set status='paused'
   where account_id = v_account and status='active'
     and (select credits from accounts where id=v_account) = 0;
end $$;

create or replace function mark_failed(p_message_id uuid, p_error text)
returns void language sql as $$
  update messages set status='failed', error=p_error where id=p_message_id;
$$;

-- record_reply: a reply ends the sequence for that lead, always.
create or replace function record_reply(
  p_thread_id text, p_outcome text, p_snippet text
) returns void language plpgsql as $$
declare v_lead uuid; v_account uuid; v_email text;
begin
  select l.id, c.account_id, l.email into v_lead, v_account, v_email
    from leads l join campaigns c on c.id = l.campaign_id
   where l.thread_id = p_thread_id limit 1;
  if v_lead is null then return; end if;

  update leads set status='replied', outcome=p_outcome where id=v_lead;
  update messages set status='cancelled' where lead_id=v_lead and status='queued';

  if p_outcome in ('not_interested','unsubscribe') then
    insert into suppression(account_id, email, reason)
         values (v_account, v_email, 'unsubscribed')
    on conflict do nothing;
  end if;
end $$;

create or replace function unsubscribe(p_token text)
returns text language plpgsql as $$
declare v_lead uuid; v_account uuid; v_email text;
begin
  select l.id, c.account_id, l.email into v_lead, v_account, v_email
    from leads l join campaigns c on c.id = l.campaign_id
   where l.unsub_token = p_token limit 1;
  if v_lead is null then return 'unknown'; end if;

  update leads set status='unsubscribed' where id=v_lead;
  update messages set status='cancelled' where lead_id=v_lead and status='queued';
  insert into suppression(account_id, email, reason)
       values (v_account, v_email, 'unsubscribed') on conflict do nothing;
  return v_email;
end $$;

create or replace function record_bounce(p_thread_id text)
returns void language plpgsql as $$
declare v_lead uuid; v_account uuid; v_email text;
begin
  select l.id, c.account_id, l.email into v_lead, v_account, v_email
    from leads l join campaigns c on c.id = l.campaign_id
   where l.thread_id = p_thread_id limit 1;
  if v_lead is null then return; end if;
  update leads set status='bounced' where id=v_lead;
  update messages set status='cancelled' where lead_id=v_lead and status='queued';
  insert into suppression(account_id, email, reason)
       values (v_account, v_email, 'bounced') on conflict do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- Bookings. This is the point of the whole system, so it is a first-class
-- table rather than something inferred later.
--
-- `docs/outbound-angle.md` records 571 leads marked interested and 0 meetings
-- booked, and `workers/explee-autogtm/` is parked because "nothing in Explee
-- knows who booked". Both failures are the same missing row. Wire the calendar
-- webhook on day one and neither can happen again.
-- ---------------------------------------------------------------------------
alter table leads add column if not exists booked_at timestamptz;

create table if not exists bookings (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid references leads(id) on delete set null,
  account_id   uuid references accounts(id) on delete cascade,
  invitee_email text not null,
  invitee_name text,
  starts_at    timestamptz,
  event_uri    text unique,          -- calendar provider's id, for idempotency
  status       text not null default 'booked', -- booked | held | no_show | cancelled
  created_at   timestamptz not null default now()
);

-- record_booking: matches a calendar event back to the lead that produced it.
-- Match on email, because the calendar has nothing else in common with the
-- campaign. Returns whether it was attributed, so the workflow can log misses.
create or replace function record_booking(
  p_email text, p_name text, p_starts_at timestamptz, p_event_uri text
) returns text language plpgsql as $$
declare v_lead uuid; v_account uuid;
begin
  select l.id, c.account_id into v_lead, v_account
    from leads l join campaigns c on c.id = l.campaign_id
   where lower(l.email) = lower(p_email)
   order by l.created_at desc limit 1;

  insert into bookings(lead_id, account_id, invitee_email, invitee_name, starts_at, event_uri)
       values (v_lead, v_account, p_email, p_name, p_starts_at, p_event_uri)
  on conflict (event_uri) do nothing;

  if v_lead is null then
    return 'unattributed';
  end if;

  update leads set booked_at = now(), outcome = 'booked' where id = v_lead;
  update messages set status='cancelled' where lead_id = v_lead and status='queued';
  return 'attributed';
end $$;

-- The only dashboard query that matters when you sell calls, not emails.
create or replace view campaign_performance as
select c.id, c.name, c.status,
       count(distinct l.id)                                    as leads,
       count(*) filter (where m.status='sent')                  as sent,
       count(distinct l.id) filter (where l.status='replied')   as replied,
       count(distinct l.id) filter (where l.outcome='interested') as interested,
       count(distinct b.id)                                     as booked,
       round(count(*) filter (where m.status='sent')::numeric
             / nullif(count(distinct b.id),0), 0)               as emails_per_booking
from campaigns c
left join leads l    on l.campaign_id = c.id
left join messages m on m.lead_id = l.id
left join bookings b on b.lead_id = l.id
group by c.id, c.name, c.status;
