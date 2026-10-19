-- Files dropped into the support chat, held until the user decides what to do
-- with them. A file only becomes a csv_enrichment_batches row (and so a card in
-- History, and work for csv-batch-runner) when the user presses Start in the
-- chat — parking it in that table as a draft would put a card in History for
-- every file anyone ever asked a question about.
--
-- Only the support-agent edge function touches this, with the service key, so
-- RLS is on with no policies: anon and authenticated see nothing.

create table if not exists public.support_chat_uploads (
    id uuid primary key default gen_random_uuid(),
    user_id text not null,              -- the LinkFinder token, as everywhere else
    file_name text,
    csv_headers jsonb not null,
    input_rows jsonb not null,          -- the parsed grid, same shape as csv_enrichment_batches.input_rows
    file_rows integer not null,
    batch_id uuid references public.csv_enrichment_batches(id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists support_chat_uploads_user_idx
    on public.support_chat_uploads (user_id, created_at desc);

alter table public.support_chat_uploads enable row level security;

-- A chat file is only useful for the conversation it was dropped into. Two
-- days is generous; anything queued already lives on in the batch row.
create extension if not exists pg_cron;
select cron.schedule(
    'support-chat-uploads-cleanup',
    '17 3 * * *',
    $$delete from public.support_chat_uploads where created_at < now() - interval '2 days'$$
);
