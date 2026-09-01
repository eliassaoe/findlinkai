'use strict';

/**
 * Loads ./config.json on every read so the offer, ICP and guardrails can be
 * edited on a running system. A cheap mtime check keeps that from turning into a
 * disk read per webhook while still picking up an edit within milliseconds.
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_PATH = path.join(__dirname, '..', 'config.json');

let cached = null;
let cachedMtimeMs = null;
let cachedPath = null;

function configPath() {
  return path.resolve(process.env.GTM_CONFIG_PATH || DEFAULT_PATH);
}

const REQUIRED_SECTIONS = ['offer', 'icp', 'disqualifiers', 'copywriting'];

function validate(config, file) {
  const missing = REQUIRED_SECTIONS.filter((key) => !config[key] || typeof config[key] !== 'object');
  if (missing.length) {
    throw new Error(`${file} is missing required section(s): ${missing.join(', ')}`);
  }
  if (!config.offer.frictionless_offer || !config.offer.cta) {
    throw new Error(`${file}: offer.frictionless_offer and offer.cta are both required — the copywriter builds sentences 2 and 3 from them`);
  }
  return config;
}

function loadConfig({ force = false } = {}) {
  const file = configPath();
  let mtimeMs;
  try {
    mtimeMs = fs.statSync(file).mtimeMs;
  } catch (cause) {
    const err = new Error(`Cannot read GTM config at ${file}. Set GTM_CONFIG_PATH or create the file.`);
    err.statusCode = 500;
    err.cause = cause;
    throw err;
  }

  if (!force && cached && cachedPath === file && cachedMtimeMs === mtimeMs) {
    return cached;
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (cause) {
    const err = new Error(`${file} is not valid JSON: ${cause.message}`);
    err.statusCode = 500;
    throw err;
  }

  cached = Object.freeze(validate(parsed, file));
  cachedMtimeMs = mtimeMs;
  cachedPath = file;
  return cached;
}

const lower = (v) => String(v == null ? '' : v).toLowerCase();

/**
 * Deterministic hard-guardrail pass, run before the LLM sees the lead.
 *
 * The AI agent still owns the semantic lookalike gate — this only catches the
 * rules that are objectively checkable, so an obvious miss never costs a model
 * call. Rules come from config.disqualifiers.hard, so editing config.json
 * changes the gate with no code change.
 */
function evaluateHardDisqualifiers(lead, config = loadConfig()) {
  const hard = (config.disqualifiers && config.disqualifiers.hard) || {};
  const hits = [];

  const title = lower(lead.job_title);
  const company = lower(lead.company_name);
  const domain = lower(lead.company_domain);
  const email = lower(lead.lead_email || lead.email);
  const industry = lower(lead.industry);
  const headcount = Number(lead.employee_count);

  for (const needle of hard.job_title_contains || []) {
    if (title && title.includes(lower(needle))) hits.push(`job_title contains "${needle}"`);
  }
  for (const needle of hard.company_name_contains || []) {
    if (company && company.includes(lower(needle))) hits.push(`company_name contains "${needle}"`);
  }
  for (const banned of hard.industries || []) {
    if (industry && industry === lower(banned)) hits.push(`industry is "${banned}"`);
  }
  for (const banned of hard.blocked_domains || []) {
    const b = lower(banned);
    if (domain && (domain === b || domain.endsWith(`.${b}`))) hits.push(`company_domain is blocked ("${banned}")`);
    else if (!domain && email && email.endsWith(`@${b}`)) hits.push(`email domain is blocked ("${banned}")`);
  }
  if (email) {
    const localPart = email.split('@')[0];
    for (const prefix of hard.blocked_email_prefixes || []) {
      if (localPart === lower(prefix)) hits.push(`email is a role address ("${prefix}@")`);
    }
  }
  if (hard.employee_count && Number.isFinite(headcount) && headcount > 0) {
    if (Number.isFinite(hard.employee_count.min) && headcount < hard.employee_count.min) {
      hits.push(`employee_count ${headcount} is below the floor of ${hard.employee_count.min}`);
    }
    if (Number.isFinite(hard.employee_count.max) && headcount > hard.employee_count.max) {
      hits.push(`employee_count ${headcount} is above the ceiling of ${hard.employee_count.max}`);
    }
  }

  return { hit: hits.length > 0, rules: hits };
}

module.exports = { loadConfig, configPath, evaluateHardDisqualifiers, DEFAULT_PATH };
