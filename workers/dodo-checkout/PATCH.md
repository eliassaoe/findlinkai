# One patch to the checkout worker — makes the failure diagnose itself

Paste this into Cloudflare → Workers & Pages → `dodo-checkout` → Edit code, then Deploy.

It is a **three-line change** to the success response. Nothing else about the worker
changes: same endpoint, same payload, same behaviour, same products.

## Why

Today the worker throws away everything Dodo says on a successful call. It returns:

```js
return json({
  checkout_url: checkoutUrl,
  session_id: sessionId,
  request_id: reqId,
  env: 'live',
  attempt,
  used_email: !!safeEmail,
}, 200, origin);
```

Dodo answers `200` every time — that is why no `checkout_error` ever fires — and then
its own hosted page refuses the session. Whatever Dodo is telling us about that session
is in the response body we are discarding. With the patch, the full body reaches the
browser, and `checkout_redirect_started` already ships it to PostHog on every attempt.

So the next real customer who clicks buy answers the question for us, automatically,
without anyone pasting anything into a console.

## The change

Replace that final `return json({...})` with:

```js
return json({
  checkout_url: checkoutUrl,
  session_id: sessionId,
  request_id: reqId,
  env: 'live',
  attempt,
  used_email: !!safeEmail,

  // Everything Dodo returned, verbatim. The API answers 200 while the hosted
  // page still refuses the session, so the reason — if Dodo states one at all —
  // can only be in here. app.html forwards this into PostHog on every attempt.
  dodo_raw: dodoData,
  dodo_status: dodoResp.status,
  product_id_used: productId,
}, 200, origin);
```

That is the whole patch. `dodoData` and `dodoResp` are already in scope — they are the
same variables the 502 branch above already returns.

## Safe to deploy

- No new secret, no Dodo dashboard change, no schema change.
- `dodo_raw` is additive; `app.html` ignores fields it does not know.
- It cannot break a working checkout, because it changes nothing about how the
  session is created — only what is reported back after it already succeeded.

## Also worth keeping

Your `return_url` fix (dropping `?token=`) is correct and should ship. `app.html` on
this branch now parses the malformed two-`?` URL correctly either way, so payments get
recorded whichever version of the worker is live — but the clean URL is still the right
thing to deploy.
