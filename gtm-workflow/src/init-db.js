#!/usr/bin/env node
'use strict';

/**
 * Initialise campaign_memory.db.
 *
 *   node src/init-db.js                 create the schema (idempotent)
 *   node src/init-db.js --seed          add three example conversions so the
 *                                       lookalike gate has something to match on
 *   node src/init-db.js --reset         drop and recreate (destructive)
 *   node src/init-db.js --show          print what is currently stored
 */

const db = require('./db');
const { loadConfig, configPath } = require('./config');

const args = new Set(process.argv.slice(2));
const file = db.resolveDbPath();

if (args.has('--help') || args.has('-h')) {
  console.log(require('node:fs').readFileSync(__filename, 'utf8').split('*/')[0].split('/**')[1].trim());
  process.exit(0);
}

if (args.has('--reset')) {
  const handle = db.open();
  handle.exec('DROP TABLE IF EXISTS conversions; DROP TABLE IF EXISTS outreach_log;');
  handle.close();
  console.log(`[init-db] dropped conversions and outreach_log in ${file}`);
}

const handle = db.open();
console.log(`[init-db] schema v${db.SCHEMA_VERSION} ready at ${file}`);

try {
  const config = loadConfig();
  console.log(`[init-db] config OK at ${configPath()} — offer: ${config.offer.product}`);
} catch (err) {
  console.warn(`[init-db] WARNING: ${err.message}`);
}

if (args.has('--seed')) {
  const seeds = [
    {
      lead_email: 'dana@northbeamlabs.io',
      full_name: 'Dana Okafor',
      job_title: 'Head of Growth',
      company_name: 'Northbeam Labs',
      company_domain: 'northbeamlabs.io',
      company_description:
        'Series A B2B SaaS selling a product analytics suite to mid-market ecommerce teams. Runs a two-person outbound motion out of HubSpot and buys enrichment credits per lead from three separate vendors.',
      tech_stack: ['HubSpot', 'Clay', 'Instantly', 'n8n'],
      employee_count: 48,
      signal_type: 'competitor_post_comment',
      signal_context: 'Commented on an Apollo post asking whether anyone had found a cheaper per-email rate at volume.',
      reply_snippet: 'Yes — send the enriched file over, I want to see the match rate against our own list.',
      source: 'seed',
    },
    {
      lead_email: 'marcus@rellyops.com',
      full_name: 'Marcus Idowu',
      job_title: 'RevOps Lead',
      company_name: 'Relly Ops',
      company_domain: 'rellyops.com',
      company_description:
        'Boutique RevOps consultancy that builds outbound infrastructure for B2B SaaS clients. Bills clients for enrichment as a pass-through cost, so a lower per-lookup price is margin.',
      tech_stack: ['Salesforce', 'Clay', 'Smartlead', 'Make'],
      employee_count: 14,
      signal_type: 'group_join',
      signal_context: 'Joined the "GTM Engineering" LinkedIn group and posted about consolidating four enrichment vendors into one API.',
      reply_snippet: 'Interested. What does the API look like for bulk?',
      source: 'seed',
    },
    {
      lead_email: 'priya@shipfast.dev',
      full_name: 'Priya Raman',
      job_title: 'Founder',
      company_name: 'Shipfast',
      company_domain: 'shipfast.dev',
      company_description:
        'Twelve-person developer-tools startup doing founder-led sales. Enriches leads by hand in a Google Sheet before every send and has no CRM.',
      tech_stack: ['Attio', 'Google Sheets', 'Zapier'],
      employee_count: 12,
      signal_type: 'role_change',
      signal_context: 'Announced moving from Head of Product to Founder and said the first hire would be sales.',
      reply_snippet: 'Send it. If the Sheets add-on works the way you describe that saves my whole Monday.',
      source: 'seed',
    },
  ];

  for (const seed of seeds) db.insertConversion(handle, seed);
  console.log(`[init-db] seeded ${seeds.length} example conversions`);
}

if (args.has('--show') || args.has('--seed')) {
  const rows = db.recentConversions(handle, 10);
  console.log(`\n[init-db] conversions in table: ${db.countConversions(handle)}`);
  console.log('[init-db] past_positive_replies_list as Node 3 would emit it:\n');
  console.log(db.buildPastPositiveRepliesList(rows) || '(empty — the agent falls back to the ICP block alone)');
}

handle.close();
