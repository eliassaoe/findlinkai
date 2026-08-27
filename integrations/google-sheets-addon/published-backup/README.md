# The published add-on, as it was before 27 Aug 2026

Pulled straight off the live Apps Script project immediately before the first
push from this repo. Every byte is what tens of thousands of installs were
running, and until this directory existed it was in exactly one place.

## Why appsscript.json matters most

It is not in the parent directory and never should be, because pushing it is how
the add-on's OAuth scopes change by accident. But it needs to exist *somewhere*,
and this is it:

```json
{
  "timeZone": "UTC",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8"
}
```

**No `oauthScopes` block.** That is the fact the whole deployment procedure rests
on: Apps Script infers the scopes from the code, so the code decides them, and a
new Apps Script service silently widens what the add-on asks for. Both deploy
tools refuse to push when that happens.

## Restoring

If a push goes wrong, put these files back the same way they came off:

```bash
LF_TOKEN=<token> node ../tools/push-via-api.mjs <SCRIPT_ID>   # from a checkout at the old commit
```

Or paste them into the editor and deploy the previous version — v3 was live
before this, cut 26 Jan 2026. Old versions are not deleted by a new push, so
rolling back is a version change rather than a restore.

## What was here

| File | Bytes | |
| --- | ---: | --- |
| `appsscript.json` | 108 | The manifest. No scopes block. |
| `Code.gs` | 5,923 | One lookup, name + company only. The eight bugs in `../FINDINGS.md`. |
| `Sidebar.html` | 12,122 | Three column inputs, hardcoded to that one lookup. |
| `Settings.html` | 3,504 | API key. |
| `Help.html` | 3,176 | |

Do not edit anything in this directory. It is a snapshot, not a source.
