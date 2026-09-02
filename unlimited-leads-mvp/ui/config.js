// Copy to config.js and fill in. Both values are public by design: the anon key
// is meant for browsers, and the API worker does every authorization check.
// The Explee key is NOT here and must never be — it lives in the worker.
window.UL_CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_ANON_KEY',
  API_BASE: 'https://unlimited-leads-tenant-api.YOUR-SUBDOMAIN.workers.dev',
};
