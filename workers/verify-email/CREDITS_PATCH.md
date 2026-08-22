# Patch for `linkfinderaicredits`

The app needs `email_verified` to know whether to show the banner. The credits
worker is a pass-through to n8n, so the cleanest place to add it is on the way
back out — no n8n change required.

Immediately after `const data = await response.json();`:

```js
      const data = await response.json();

      // Ask verify-email whether this account has confirmed its address. Wrapped
      // in its own try/catch and deliberately non-fatal: if this call fails the
      // response is exactly what it was before, the app sees no email_verified
      // field, and the banner stays hidden. A verification lookup must never be
      // able to break the credit display.
      try {
        const v = await fetch('https://verifyemail.hamoureliasse.workers.dev/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Origin': allowedOrigin },
          body: JSON.stringify({ token: requestData.token })
        });
        if (v.ok) {
          const status = await v.json();
          if (typeof status.email_verified === 'boolean') {
            data.email_verified = status.email_verified;
            data.verify_cap = status.verify_cap;
          }
        }
      } catch (e) {
        console.error('verify-email status lookup failed (non-fatal):', e);
      }
```

That is the whole change. It adds one subrequest to a call the app already makes
on every page load, and it degrades to today's behaviour on any failure.

## Ordering

Deploy this **last**. Until it ships, no banner appears for anyone, which is the
correct state while the cap is not yet in force.
