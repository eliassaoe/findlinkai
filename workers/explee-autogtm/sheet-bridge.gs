/**
 * Google Sheet <-> follow-up loop. Deploy this bound to your hot-leads sheet.
 *
 * SETUP, ONCE
 *   1. Sheet -> Extensions -> Apps Script, paste this file, save.
 *   2. Set TOKEN below to a long random string.
 *   3. Deploy -> New deployment -> Web app.
 *        Execute as: Me.   Who has access: Anyone with the link.
 *      "Anyone with the link" is what lets a script call it; TOKEN is what stops
 *      anyone else. Treat the /exec URL and the token together as a password.
 *   4. Copy the /exec URL into recover.py --sheet-webapp, the token into
 *      --sheet-token.
 *
 * THE SHEET
 *   Row 1 must contain headers. `email` is required; the rest are optional and
 *   filled in for you when the column exists:
 *
 *     email          the lead's address - how rows are matched
 *     booked         type anything when they book. A win, and counted as one.
 *     stop           type anything to leave them alone for any other reason
 *     first_name, company, job_title, campaign, last_reply, replied_at
 *     followups_sent, next_action   <- written back by the loop, do not edit
 *     inbox          a link straight to the conversation in Explee
 *
 *   Only email matters. Every other column is yours to delete.
 */

var TOKEN = 'CHANGE-ME-to-a-long-random-string';
var SHEET_NAME = '';   // '' = the first sheet

function sheet_() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  return SHEET_NAME ? book.getSheetByName(SHEET_NAME) : book.getSheets()[0];
}

function headers_(sh) {
  var width = Math.max(sh.getLastColumn(), 1);
  return sh.getRange(1, 1, 1, width).getValues()[0].map(function (h) {
    return String(h).trim().toLowerCase();
  });
}

function col_(head, names) {
  for (var i = 0; i < names.length; i++) {
    var at = head.indexOf(names[i]);
    if (at !== -1) return at;
  }
  return -1;
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

var NO = ['', 'no', 'non', 'false', '0', 'n', '-'];

function marked_(value) {
  return NO.indexOf(String(value || '').trim().toLowerCase()) === -1;
}

/** GET ?token=...  ->  {"booked": [...], "stopped": [...]} */
function doGet(e) {
  if (!e || !e.parameter || e.parameter.token !== TOKEN) return json_({ error: 'bad token' });
  var sh = sheet_();
  if (sh.getLastRow() < 2) return json_({ booked: [], stopped: [] });
  var head = headers_(sh);
  var emailAt = col_(head, ['email', 'e-mail', 'mail']);
  var bookedAt = col_(head, ['booked', 'rdv', 'call', 'meeting']);
  var stopAt = col_(head, ['stop', 'done', 'handled', 'traite', 'traité', 'ne pas relancer']);
  if (emailAt === -1 || (bookedAt === -1 && stopAt === -1)) {
    return json_({ error: 'need an "email" column and a "booked" (or "stop") column in row 1' });
  }
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  var booked = [], stopped = [];
  for (var i = 0; i < rows.length; i++) {
    var email = String(rows[i][emailAt] || '').trim().toLowerCase();
    if (!email) continue;
    if (bookedAt !== -1 && marked_(rows[i][bookedAt])) booked.push(email);
    else if (stopAt !== -1 && marked_(rows[i][stopAt])) stopped.push(email);
  }
  return json_({ booked: booked, stopped: stopped });
}

/** POST {token, action:'append', rows:[{email, first_name, ...}]} -> {added: n} */
function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ error: 'body must be JSON' });
  }
  if (body.token !== TOKEN) return json_({ error: 'bad token' });
  if (body.action !== 'append' && body.action !== 'update') {
    return json_({ error: 'unknown action' });
  }

  // One writer at a time: two runs of the loop must not interleave and duplicate
  // a lead, which is how someone ends up mailed twice.
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_();
    var head = headers_(sh);
    var emailAt = col_(head, ['email', 'e-mail', 'mail']);
    if (emailAt === -1) return json_({ error: 'need an "email" column in row 1' });

    var known = {};
    if (sh.getLastRow() > 1) {
      var existing = sh.getRange(2, emailAt + 1, sh.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < existing.length; i++) {
        known[String(existing[i][0] || '').trim().toLowerCase()] = true;
      }
    }

    // 'update' writes loop state back onto rows that already exist, so the sheet
    // shows what the follow-up loop is doing without anyone opening a terminal.
    if (body.action === 'update') {
      var index = {};
      if (sh.getLastRow() > 1) {
        var col = sh.getRange(2, emailAt + 1, sh.getLastRow() - 1, 1).getValues();
        for (var r = 0; r < col.length; r++) {
          index[String(col[r][0] || '').trim().toLowerCase()] = r + 2;
        }
      }
      var touched = 0;
      (body.rows || []).forEach(function (row) {
        var at = index[String(row.email || '').trim().toLowerCase()];
        if (!at) return;
        Object.keys(row).forEach(function (name) {
          var c = head.indexOf(String(name).toLowerCase());
          if (c !== -1 && name !== 'email') sh.getRange(at, c + 1).setValue(row[name]);
        });
        touched++;
      });
      return json_({ updated: touched });
    }

    var out = [];
    (body.rows || []).forEach(function (row) {
      var email = String(row.email || '').trim().toLowerCase();
      if (!email || known[email]) return;      // already in the sheet: never twice
      known[email] = true;
      out.push(head.map(function (name) {
        return row[name] !== undefined && row[name] !== null ? row[name] : '';
      }));
    });
    if (out.length) {
      sh.getRange(sh.getLastRow() + 1, 1, out.length, head.length).setValues(out);
    }
    return json_({ added: out.length });
  } finally {
    lock.releaseLock();
  }
}
