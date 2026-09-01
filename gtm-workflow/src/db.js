'use strict';

/**
 * campaign_memory.db — the self-learning half of the GTM workflow.
 *
 * Uses node:sqlite, which ships with Node 22.5+, so this whole service has zero
 * npm dependencies. That matters here: n8n runs this next to itself, and a
 * native module (better-sqlite3) would need a compiler on the n8n host.
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS conversions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_email          TEXT,
  full_name           TEXT,
  job_title           TEXT,
  company_name        TEXT,
  company_domain      TEXT,
  company_description TEXT NOT NULL,
  tech_stack          TEXT,
  employee_count      INTEGER,
  signal_type         TEXT,
  signal_context      TEXT,
  reply_sentiment     TEXT NOT NULL DEFAULT 'positive',
  reply_snippet       TEXT,
  source              TEXT NOT NULL DEFAULT 'deliveryman',
  raw_payload         TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_conversions_created_at ON conversions (created_at DESC);

-- One row per converted person. Deliveryman can redeliver a reply webhook, and a
-- lead can reply twice; either way the profile should count once in the lookalike
-- context, otherwise a single chatty prospect skews every future qualification.
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversions_lead_email
  ON conversions (lead_email) WHERE lead_email IS NOT NULL;

CREATE TABLE IF NOT EXISTS outreach_log (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_email          TEXT NOT NULL UNIQUE,
  full_name           TEXT,
  job_title           TEXT,
  company_name        TEXT,
  company_domain      TEXT,
  signal_type         TEXT,
  signal_context      TEXT,
  company_description TEXT,
  tech_stack          TEXT,
  employee_count      INTEGER,
  subject_line        TEXT,
  email_body          TEXT,
  provider            TEXT NOT NULL DEFAULT 'deliveryman',
  provider_message_id TEXT,
  sent_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_outreach_domain ON outreach_log (company_domain);
`;

function resolveDbPath(dbPath) {
  return path.resolve(
    dbPath || process.env.CAMPAIGN_MEMORY_DB || path.join(__dirname, '..', 'campaign_memory.db')
  );
}

function open(dbPath) {
  const file = resolveDbPath(dbPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new DatabaseSync(file);
  // WAL lets the n8n workflow read learning context while a reply webhook writes.
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  return db;
}

/** Normalise a domain so "https://WWW.Acme.com/pricing" and "acme.com" match. */
function normaliseDomain(value) {
  if (!value) return null;
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0]
    .replace(/\.$/, '') || null;
}

function normaliseEmail(value) {
  if (!value) return null;
  const email = String(value).trim().toLowerCase();
  return email.includes('@') ? email : null;
}

function toTechStackText(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value.filter(Boolean).map(String).join(', ') || null;
  if (typeof value === 'object') return Object.keys(value).join(', ') || null;
  return String(value) || null;
}

/**
 * Node 3 reads this. The shape is deliberately flat text: it goes straight into
 * an LLM prompt, so a compact line per win beats nested JSON the model has to
 * unpack. Returns '' when the table is empty — the agent branches on that.
 */
function buildPastPositiveRepliesList(rows) {
  if (!rows.length) return '';
  return rows
    .map((row, index) => {
      const who = [row.job_title, row.company_name].filter(Boolean).join(' @ ') || 'unknown role';
      const parts = [`${index + 1}. [${who}${row.company_domain ? ` | ${row.company_domain}` : ''}]`];
      parts.push(row.company_description);
      if (row.tech_stack) parts.push(`Tech stack: ${row.tech_stack}.`);
      if (row.employee_count) parts.push(`Headcount: ~${row.employee_count}.`);
      if (row.signal_type) parts.push(`Converted from signal: ${row.signal_type}.`);
      if (row.signal_context) parts.push(`Signal context: ${row.signal_context}`);
      return parts.join(' ');
    })
    .join('\n');
}

function recentConversions(db, limit = 10) {
  const capped = Math.min(Math.max(Number(limit) || 10, 1), 100);
  return db
    .prepare(
      `SELECT id, lead_email, full_name, job_title, company_name, company_domain,
              company_description, tech_stack, employee_count, signal_type,
              signal_context, reply_snippet, created_at
         FROM conversions
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT ?`
    )
    .all(capped);
}

function countConversions(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM conversions').get().n;
}

function insertConversion(db, input) {
  const description = String(input.company_description || '').trim();
  if (!description) {
    const err = new Error('company_description is required to record a conversion');
    err.statusCode = 422;
    throw err;
  }

  const row = {
    lead_email: normaliseEmail(input.lead_email),
    full_name: input.full_name || null,
    job_title: input.job_title || null,
    company_name: input.company_name || null,
    company_domain: normaliseDomain(input.company_domain),
    company_description: description,
    tech_stack: toTechStackText(input.tech_stack),
    employee_count: Number.isFinite(Number(input.employee_count)) ? Number(input.employee_count) : null,
    signal_type: input.signal_type || null,
    signal_context: input.signal_context || null,
    reply_sentiment: input.reply_sentiment || 'positive',
    reply_snippet: input.reply_snippet || null,
    source: input.source || 'deliveryman',
    raw_payload: input.raw_payload ? JSON.stringify(input.raw_payload) : null,
  };

  // Upsert so a redelivered webhook refreshes the profile instead of erroring or
  // double-counting. Without a lead_email there is nothing to key on, so insert.
  const stmt = db.prepare(
    `INSERT INTO conversions (
       lead_email, full_name, job_title, company_name, company_domain,
       company_description, tech_stack, employee_count, signal_type,
       signal_context, reply_sentiment, reply_snippet, source, raw_payload
     ) VALUES (
       :lead_email, :full_name, :job_title, :company_name, :company_domain,
       :company_description, :tech_stack, :employee_count, :signal_type,
       :signal_context, :reply_sentiment, :reply_snippet, :source, :raw_payload
     )
     ON CONFLICT (lead_email) WHERE lead_email IS NOT NULL DO UPDATE SET
       full_name           = excluded.full_name,
       job_title           = excluded.job_title,
       company_name        = excluded.company_name,
       company_domain      = excluded.company_domain,
       company_description = excluded.company_description,
       tech_stack          = excluded.tech_stack,
       employee_count      = excluded.employee_count,
       signal_type         = excluded.signal_type,
       signal_context      = excluded.signal_context,
       reply_sentiment     = excluded.reply_sentiment,
       reply_snippet       = excluded.reply_snippet,
       raw_payload         = excluded.raw_payload,
       created_at          = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     RETURNING id`
  );

  const { id } = stmt.get(row);
  return db.prepare('SELECT * FROM conversions WHERE id = ?').get(id);
}

function logOutreach(db, input) {
  const email = normaliseEmail(input.lead_email);
  if (!email) {
    const err = new Error('lead_email is required to log outreach');
    err.statusCode = 422;
    throw err;
  }

  const stmt = db.prepare(
    `INSERT INTO outreach_log (
       lead_email, full_name, job_title, company_name, company_domain,
       signal_type, signal_context, company_description, tech_stack, employee_count,
       subject_line, email_body, provider, provider_message_id
     ) VALUES (
       :lead_email, :full_name, :job_title, :company_name, :company_domain,
       :signal_type, :signal_context, :company_description, :tech_stack, :employee_count,
       :subject_line, :email_body, :provider, :provider_message_id
     )
     ON CONFLICT (lead_email) DO UPDATE SET
       job_title           = excluded.job_title,
       company_description = excluded.company_description,
       tech_stack          = excluded.tech_stack,
       employee_count      = excluded.employee_count,
       signal_context      = excluded.signal_context,
       subject_line        = excluded.subject_line,
       email_body          = excluded.email_body,
       provider_message_id = excluded.provider_message_id,
       sent_at             = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     RETURNING id`
  );

  const { id } = stmt.get({
    lead_email: email,
    full_name: input.full_name || null,
    job_title: input.job_title || null,
    company_name: input.company_name || null,
    company_domain: normaliseDomain(input.company_domain),
    signal_type: input.signal_type || null,
    signal_context: input.signal_context || null,
    company_description: input.company_description || null,
    tech_stack: toTechStackText(input.tech_stack),
    employee_count: Number.isFinite(Number(input.employee_count)) ? Number(input.employee_count) : null,
    subject_line: input.subject_line || null,
    email_body: input.email_body || null,
    provider: input.provider || 'deliveryman',
    provider_message_id: input.provider_message_id || null,
  });

  return db.prepare('SELECT * FROM outreach_log WHERE id = ?').get(id);
}

/**
 * The reply webhook rarely carries the company profile back, so Node 6 backfills
 * from what Node 5 recorded at send time. Without this the learning loop only
 * works when Deliveryman echoes every custom variable, which is not guaranteed.
 */
function findOutreach(db, email) {
  const normalised = normaliseEmail(email);
  if (!normalised) return null;
  return db.prepare('SELECT * FROM outreach_log WHERE lead_email = ?').get(normalised) || null;
}

function alreadyContacted(db, email) {
  const normalised = normaliseEmail(email);
  if (!normalised) return false;
  return Boolean(db.prepare('SELECT 1 FROM outreach_log WHERE lead_email = ?').get(normalised));
}

module.exports = {
  SCHEMA,
  SCHEMA_VERSION,
  open,
  resolveDbPath,
  normaliseDomain,
  normaliseEmail,
  buildPastPositiveRepliesList,
  recentConversions,
  countConversions,
  insertConversion,
  logOutreach,
  findOutreach,
  alreadyContacted,
};
