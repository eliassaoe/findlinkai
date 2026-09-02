# The published add-on — what is wrong with it

Source of `Code.gs` as published to the Google Workspace Marketplace (28 Jan 2026),
reviewed 27 Aug 2026. Ordered by how much damage each one does to a user.

## 1. A run that hits the 6-minute limit loses everything ⚠️

`findLinkedInProfilesFromSelection` accumulates every result in a `results` array
and writes it to the sheet **once, after the loop finishes**:

```js
for (var i = 0; i < names.length; i++) { … results.push([linkedInUrl]); }
sheet.getRange(startRow, outputColumn, results.length, 1).setValues(results);
```

Apps Script kills any script at six minutes. With `Utilities.sleep(500)` per row
plus the API call, that ceiling is roughly **400–700 rows**. Past it the script is
terminated before the write — so the user sees **an empty column**, and has still
been **charged for every lookup**.

A 2,000-row sheet cannot succeed at all, and each attempt costs real credits.

## 2. Re-running re-charges every row

Nothing checks whether the output cell already has a value. After the timeout in
(1) the natural reaction is to run it again, which pays for all of it a second
time — and hits the same wall at the same place.

## 3. Only name and company reach the lookup

```js
var inputData = name.toString().trim();
if (company && …) inputData += ' ' + company.toString().trim();
```

`app.html` builds this input from **four** fields — name, company, location and
job title. This is the gap a user reported: they could not get location or job
title in. Same credit cost, worse match: "John Smith" alone matches thousands of
people, "John Smith Acme Berlin VP Sales" matches one.

## 4. "Doe, John" is looked up as-is

CRM exports use `Last, First`. The app flips it; this does not, so every row from
a CRM export is looked up backwards.

## 5. Real failures are reported as "Not found"

```js
} else if (result.status === 'error') { return 'Not found'; }
```

An out-of-credits or rejected-key response reads identically to the person not
existing. A whole column of "Not found" looks like bad data rather than a
billing problem.

## 6. A 402 fills every row with an error instead of stopping

The thrown error is caught per row, written as `ERROR: …`, and the loop
continues — writing the same message thousands of times for a condition that
cannot resolve itself.

## 7. Any non-200 throws, including 202

```js
if (responseCode !== 200) throw new Error(…);
```

`lead_full_name_to_linkedin_url` is normally synchronous, but the API can return
`202` with a job under load. That is a valid response and this treats it as a
failure.

## 8. A finished async job is read as "Not found"

Found while writing the tests for the rewrite, not in the published version — the
published code threw on any non-200 (bug 7) and so never reached a poll at all.
The first pass of the fix polled correctly and then read the wrong key:

```js
result = pollForResult(...);        // returns { status: 'done', result: {…} }
return formatResult(result.result, operation);   // …then reads .result of that
```

`pollForResult` returned the envelope, and `callLinkFinderApi` unwrapped it a
second time. A job that had succeeded — and had been charged — was written to the
sheet as `Not found`. It now unwraps in one place and returns the value itself,
distinguishes `status: "error"` from an empty result, and fails a stuck job as one
bad row rather than a dead run.

---

## Scope note

Every fix below uses only services the add-on already calls — `SpreadsheetApp`,
`PropertiesService`, `UrlFetchApp`, `Utilities`, `HtmlService` — and keeps
`@OnlyCurrentDoc`. **No new OAuth scopes**, so nothing here should require
re-verification by Google.

`findLinkedInProfilesFromSelection` keeps its signature — the two new column
arguments are appended and optional — so a stale `Sidebar.html` still works if the
files are pasted into the editor out of step.
