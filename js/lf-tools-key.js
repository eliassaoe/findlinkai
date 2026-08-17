// Shared client key for the free-tools worker (linkfinder-free-tools.hamoureliasse.workers.dev)
// and related workers (auth, feedback). Single source of truth so rotating this value only
// requires editing this one file, instead of the 38 pages that used to hardcode it inline.
//
// TODO: fill in the real value below and update the matching secret on the Cloudflare Worker
// side at the same time. The previous value was committed in plaintext across 38 public HTML
// files for an unknown period and must be treated as already compromised - rotate it, don't
// reuse it here.
//
// Longer term: a value shipped to every browser is not actually secret and provides no real
// access control. The durable fix is moving these calls behind server-side rate limiting
// (Cloudflare Rate Limiting Rules / Turnstile) instead of a shared client-side key.
window.LF_API_KEY = 'REPLACE_ME_WITH_ROTATED_KEY';
