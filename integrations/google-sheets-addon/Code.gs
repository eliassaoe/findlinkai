/**
 * @OnlyCurrentDoc
 *
 * LinkedIn Profile Finder Add-on
 * Uses LinkFinder AI API to find LinkedIn profile URLs from names and companies
 *
 * Every service used here — SpreadsheetApp, PropertiesService, UrlFetchApp,
 * Utilities, HtmlService — is one the published version already used, and
 * @OnlyCurrentDoc is unchanged. No new OAuth scopes, so this does not need
 * re-verification by Google.
 */

// How long to keep going before handing control back. Apps Script kills any
// script at six minutes; stopping at five leaves room to report where to resume.
var TIME_BUDGET_MS = 5 * 60 * 1000;

// A few lookups always come back as a job. Sixty seconds is generous for those
// and never reached by the synchronous ones, which are the overwhelming majority.
var POLL_ATTEMPTS = 20;
var POLL_INTERVAL_MS = 3000;

// Add menu when add-on is installed
function onInstall(e) {
  onOpen(e);
}

// Add menu when document is opened
function onOpen(e) {
  SpreadsheetApp.getUi()
    .createAddonMenu()
    .addItem('Enrich a column', 'showSidebar')
    .addItem('Settings', 'showSettings')
    .addItem('Help', 'showHelp')
    .addToUi();
}

// Show sidebar for finding profiles
function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('LinkFinder AI')
  SpreadsheetApp.getUi().showSidebar(html);
}

// Show settings dialog
function showSettings() {
  const html = HtmlService.createHtmlOutputFromFile('Settings')
    .setWidth(400)
    .setHeight(300);
  SpreadsheetApp.getUi().showModalDialog(html, 'API Settings');
}

// Show help dialog
function showHelp() {
  const html = HtmlService.createHtmlOutputFromFile('Help')
    .setWidth(500)
    .setHeight(400);
  SpreadsheetApp.getUi().showModalDialog(html,'Help & Documentation');
}

// Save API key to user properties
function saveApiKey(apiKey) {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('Invalid API key.');
  }
  PropertiesService.getUserProperties().setProperty('LINKFINDER_API_KEY', apiKey.trim());
  return { success: true, message: 'Your API key is stored securely in your Google account and is never shared.' };
}

// Get API key from user properties
function getApiKey() {
  const key = PropertiesService.getUserProperties().getProperty('LINKFINDER_API_KEY')
  return key;
}

// Check if API key is configured
function isApiKeyConfigured() {
  const apiKey = getApiKey();
  return apiKey && apiKey.trim() !== '';
}

/**
 * What the panel needs to know about the sheet in front of the user.
 *
 * Asking someone to type "F" means asking them to count columns and to know
 * what is in them. Every comparable add-on offers a dropdown of the header
 * names instead, and it is the difference between reading the sheet and
 * remembering it.
 *
 * Also returns how many rows still need work, so the panel can multiply the
 * per-row price into a real number before anyone spends it.
 */
function getSheetInfo() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var lastRow = sheet.getLastRow();
  var lastColumn = Math.max(sheet.getLastColumn(), 1);

  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var columns = [];
  for (var i = 0; i < headers.length; i++) {
    var letter = columnNumberToLetter(i + 1);
    var name = String(headers[i] == null ? '' : headers[i]).trim();
    columns.push({ letter: letter, name: name, label: name ? letter + ' — ' + name : letter + ' (empty)' });
  }

  // A couple of spare columns past the data, so the answer has somewhere to go
  // on a sheet whose last column is already full.
  for (var extra = 1; extra <= 4; extra++) {
    var letter = columnNumberToLetter(lastColumn + extra);
    columns.push({ letter: letter, name: '', label: letter + ' (empty)' });
  }

  return {
    sheetName: sheet.getName(),
    lastRow: lastRow,
    dataRows: Math.max(0, lastRow - 1),
    columns: columns,
    firstEmpty: columnNumberToLetter(lastColumn + 1)
  };
}

/**
 * Builds the value sent to the API.
 *
 * The lookup takes one string, but the more of the person it describes the more
 * certain the match — and it costs the same either way. "John Smith" alone
 * matches thousands of people; "John Smith Acme Berlin VP Sales" matches one.
 * This is the same string app.html builds for its own CSV runs.
 */
function buildLookupInput(operation, values) {
  var text = function (v) { return String(v == null ? '' : v).trim(); };

  if (!operation.compositeInput) return text(values.input);

  var parts = [];
  for (var i = 0; i < operation.compositeInput.parts.length; i++) {
    var part = operation.compositeInput.parts[i];
    var value = text(values[part.name]);
    if (!value) continue;

    // CRM exports use "Doe, John". The lookup wants "John Doe". Only the name is
    // ever in that form — a company like "Gates, Foundation" is left alone.
    if (part.name === 'name') {
      var flipped = value.match(/^\s*([^,]{1,60}?)\s*,\s*([^,]{1,60}?)\s*$/);
      if (flipped) value = flipped[2] + ' ' + flipped[1];
    }
    parts.push(value);
  }
  return parts.join(operation.compositeInput.joinWith || ' ');
}

/**
 * The original three-argument entry point, kept so an older Sidebar.html still
 * works if the two files are updated out of step.
 */
function findLinkedInProfilesFromSelection(nameColumn, companyColumn, outputColumn, locationColumn, jobTitleColumn) {
  return runEnrichment({
    type: 'lead_full_name_to_linkedin_url',
    outputColumn: outputColumn,
    columns: { name: nameColumn, company: companyColumn, location: locationColumn, job_title: jobTitleColumn }
  });
}

/**
 * Runs any of the lookups over a column.
 *
 * config = {
 *   type:         'lead_full_name_to_email',
 *   outputColumn: 'F',
 *   columns:      { name: 'A', company: 'B', … }  or  { input: 'A' },
 *   params:       { department: 'Sales', … }      // optional, per lookup
 * }
 */
function runEnrichment(config) {
  var apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API key not configured. Please set your API key in Settings.');
  }

  var operation = lfOperation(config.type);
  if (!operation) throw new Error('Unknown lookup: ' + config.type);

  var sheet = SpreadsheetApp.getActiveSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('Sheet needs at least 2 rows (header + data)');

  var startRow = 2;                       // row 1 is the header
  var numRows = lastRow - startRow + 1;
  var outputColumn = columnLetterToNumber(config.outputColumn);

  // Which sheet column feeds each part of the lookup.
  var partColumns = {};
  var requiredPart = operation.compositeInput ? operation.compositeInput.parts[0].name : 'input';
  for (var part in (config.columns || {})) {
    if (config.columns[part]) partColumns[part] = columnLetterToNumber(config.columns[part]);
  }
  if (!partColumns[requiredPart]) {
    throw new Error('Set the column holding ' + (operation.compositeInput
      ? operation.compositeInput.parts[0].label
      : operation.inputLabel) + ' first.');
  }

  // Read every column involved in one call, including the output column so
  // already-filled rows can be skipped without a read per row.
  var lastColumn = outputColumn;
  for (var k in partColumns) lastColumn = Math.max(lastColumn, partColumns[k]);
  var reservedTo = outputColumn + (operation.outputKind === 'list' ? 1
                  : (operation.columns ? (config.fields && config.fields.length ? config.fields.length : operation.columns.default.length) : 1)) - 1;
  lastColumn = Math.max(lastColumn, reservedTo);
  var grid = sheet.getRange(startRow, 1, numRows, lastColumn).getValues();
  var at = function (row, col) { return col ? row[col - 1] : ''; };

  // What this run writes: one column for a scalar, one per chosen field for a
  // result with many, or a whole separate sheet for one that returns a list.
  var fields = fieldsFor(operation, config.fields);
  var writesList = operation.outputKind === 'list';
  var width = writesList ? 1 : (fields ? fields.length : 1);

  var resultSheet = null;
  if (writesList) resultSheet = resultSheetFor(operation, fields);

  // Label the columns, so a sheet with several runs stays readable.
  var headers = [];
  if (writesList) headers = [operation.label];
  else if (fields) for (var h = 0; h < fields.length; h++) headers.push(operation.labels[fields[h]]);
  else headers = [operation.label];

  var headerRange = sheet.getRange(1, outputColumn, 1, width);
  var existingHeaders = headerRange.getValues()[0];
  var headersNeeded = false;
  for (var hh = 0; hh < width; hh++) {
    if (!existingHeaders[hh] || String(existingHeaders[hh]).trim() === '') headersNeeded = true;
  }
  if (headersNeeded) headerRange.setValues([headers]);

  var processedCount = 0, errorCount = 0, skippedCount = 0, foundCount = 0;
  var started = Date.now();

  for (var i = 0; i < grid.length; i++) {
    var row = grid[i];

    var values = {};
    for (var name in partColumns) values[name] = at(row, partColumns[name]);
    if (!values[requiredPart] || String(values[requiredPart]).trim() === '') continue;

    // Never pay twice for a row that already has an answer. This is what makes a
    // re-run cheap and a resume after the time budget safe.
    var existing = at(row, outputColumn);
    if (existing && existing.toString().trim() !== '') { skippedCount++; continue; }

    // Apps Script terminates any script at six minutes. Stop before that and say
    // where to resume — everything written so far is already in the sheet.
    if (Date.now() - started > TIME_BUDGET_MS) {
      return {
        success: true, incomplete: true, resumeRow: startRow + i,
        processed: processedCount, found: foundCount, errors: errorCount, skipped: skippedCount,
        total: grid.length,
        message: 'Stopped at row ' + (startRow + i) + ' to stay inside Google\'s 6-minute limit. ' +
                 'Run it again to continue — finished rows are skipped and cost nothing.'
      };
    }

    var inputData = buildLookupInput(operation, values);

    try {
      var raw = callLinkFinderApi(apiKey, operation, inputData, config.params);
      var empty = isEmptyResult(raw);
      if (!empty) assertNotProviderError(raw);

      // Written per row rather than batched at the end: a run that is cut short
      // must not throw away work the user has already paid for.
      if (writesList) {
        // One input can return hundreds of people. They go to their own sheet,
        // and the source row gets a count so it can be skipped on a re-run.
        var items = empty ? [] : (Object.prototype.toString.call(raw) === '[object Array]' ? raw : [raw]);
        if (items.length) {
          var rows = [];
          for (var r = 0; r < items.length; r++) rows.push([inputData].concat(rowFor(items[r], fields)));
          resultSheet.getRange(resultSheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
          foundCount++;
        }
        sheet.getRange(startRow + i, outputColumn)
             .setValue(items.length ? items.length + ' result(s)' : 'Not found');
      } else if (fields) {
        // A result with many fields, spread across its columns in one write.
        // A miss says so in the first column and leaves the rest empty, rather
        // than writing "Not found" nine times across the row.
        var cells;
        if (empty) {
          cells = ['Not found'];
          while (cells.length < fields.length) cells.push('');
        } else {
          cells = rowFor(raw, fields);
        }
        sheet.getRange(startRow + i, outputColumn, 1, fields.length).setValues([cells]);
        if (!empty) foundCount++;
      } else {
        var value = formatResult(raw, operation);
        sheet.getRange(startRow + i, outputColumn).setValue(value);
        if (value !== 'Not found') foundCount++;
      }

      processedCount++;
      SpreadsheetApp.flush();
      Utilities.sleep(500);              // rate limiting
    } catch (error) {
      sheet.getRange(startRow + i, outputColumn).setValue('ERROR: ' + error.message);
      errorCount++;
      SpreadsheetApp.flush();

      // Out of credits or a rejected key will not resolve on the next row, and
      // continuing would write the same message into every remaining one.
      if (error.stopRun) {
        return {
          success: false, stopped: true,
          processed: processedCount, found: foundCount, errors: errorCount, skipped: skippedCount,
          total: grid.length, message: error.message
        };
      }
    }
  }

  return {
    success: true,
    processed: processedCount, found: foundCount, errors: errorCount, skipped: skippedCount,
    total: grid.length,
    resultSheet: resultSheet ? resultSheet.getName() : null,
    columnsWritten: writesList ? 1 : width
  };
}

// Call LinkFinder AI API
function callLinkFinderApi(apiKey, operation, inputData, params) {
  const url = LINKFINDER_API_BASE;

  var payload = { 'type': operation.type, 'input_data': inputData };
  for (var p in (params || {})) {
    if (params[p] !== '' && params[p] !== null && params[p] !== undefined) payload[p] = params[p];
  }

  var options = {
    'method': 'post',
    'contentType': 'application/json',
    'headers': {
      'Authorization': 'Bearer ' + apiKey
    },
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  };

  Logger.log('Calling API with data: ' + inputData);
  var response = UrlFetchApp.fetch(url, options);
  var responseCode = response.getResponseCode();
  var responseText = response.getContentText();

  Logger.log('Response code: ' + responseCode);
  Logger.log('Response text: ' + responseText);

  var result = {};
  try { result = JSON.parse(responseText) || {}; } catch (e) { result = {}; }

  // These say nothing about whether the person exists, so they must never be
  // reported as "Not found". The two that cannot fix themselves stop the run.
  // The Instagram lookup's type name differs between the spec and the published
  // docs, and nothing settles which is right — so retry the other once.
  if (responseCode === 422 && operation.altType) {
    payload.type = operation.altType;
    options.payload = JSON.stringify(payload);
    response = UrlFetchApp.fetch(url, options);
    responseCode = response.getResponseCode();
    responseText = response.getContentText();
    try { result = JSON.parse(responseText) || {}; } catch (e) { result = {}; }
  }

  if (responseCode === 401) throw stopError('Your API key was rejected. Check it in Settings.');
  if (responseCode === 402) throw stopError('Your LinkFinder AI account is out of credits.');
  if (responseCode === 429) throw new Error('Rate limited by LinkFinder AI — try this row again shortly.');
  if (responseCode >= 400) throw new Error(result.message || ('LinkFinder AI error ' + responseCode));

  // Normally synchronous, but the API can hand back a job under load — and a few
  // lookups always do. That is a valid response, not a failure.
  if (result.job_id) {
    return pollForResult(apiKey, result.poll_url || (url + '/status/' + result.job_id));
  }

  return result.result;
}

/**
 * The value for a lookup that returns a single thing.
 *
 * Only used for scalar results now. A result with many fields is spread across
 * columns instead — see rowFor() — because a 10-credit profile lookup landing as
 * JSON in one cell is data nobody can sort, filter or mail-merge.
 */
function formatResult(result, operation) {
  if (isEmptyResult(result)) return 'Not found';
  assertNotProviderError(result);
  if (typeof result !== 'object') return result;

  // A scalar operation that answered with an object anyway: take its own field.
  return result[operation.outputField] || result.email || result.linkedinUrl ||
         result.mobileNumber || result.website || result.name || JSON.stringify(result);
}

function isEmptyResult(result) {
  if (result === null || result === undefined || result === '') return true;
  return Object.prototype.toString.call(result) === '[object Array]' && !result.length;
}

/** A provider failure can arrive dressed as a successful result. */
function assertNotProviderError(result) {
  if (result && result.error) {
    throw new Error('LinkFinder AI provider error: ' +
      (result.error.message || 'unknown').toString().slice(0, 200));
  }
}

/** The chosen fields of one result object, in the chosen order, as a row. */
function rowFor(item, fields) {
  var row = [];
  for (var i = 0; i < fields.length; i++) {
    var value = item ? item[fields[i]] : '';
    if (value === null || value === undefined) value = '';
    // Nested arrays and objects have no useful cell form; a count is honest and
    // sortable where JSON is neither.
    if (Object.prototype.toString.call(value) === '[object Array]') {
      value = value.length ? value.length + ' item(s)' : '';
    } else if (typeof value === 'object') {
      value = JSON.stringify(value);
    }
    row.push(value);
  }
  return row;
}

/** The fields a run will write: what the panel chose, or the catalog default. */
function fieldsFor(operation, chosen) {
  if (!operation.columns) return null;                       // scalar
  if (chosen && chosen.length) {
    // Keep the catalog's order regardless of the order they were ticked in, so
    // two runs of the same lookup produce the same columns in the same places.
    var all = Object.keys(operation.labels);
    var picked = [];
    for (var i = 0; i < all.length; i++) {
      if (chosen.indexOf(all[i]) !== -1) picked.push(all[i]);
    }
    return picked.length ? picked : operation.columns.default;
  }
  return operation.columns.default;
}

/**
 * The sheet a list lookup writes into.
 *
 * One input row can produce hundreds of results — every employee at a company,
 * every reaction on a post — so they cannot go beside the row that asked for
 * them. They get their own sheet, one result per row, with the input that found
 * them in the first column so the two can be joined back together.
 */
function resultSheetFor(operation, fields) {
  var name = ('LinkFinder — ' + operation.label).slice(0, 90);
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(name);

  if (!sheet) {
    sheet = book.insertSheet(name);
    var header = ['Looked up'];
    for (var i = 0; i < fields.length; i++) header.push(operation.labels[fields[i]]);
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, header.length).setFontWeight('bold');
  }
  return sheet;
}

/** An error that should end the whole run rather than just mark one row. */
function stopError(message) {
  var e = new Error(message);
  e.stopRun = true;
  return e;
}

/**
 * Waits for an async job and returns the value it found — not the envelope.
 *
 * The documented shape is { status, result }; some responses wrap it one level
 * deeper in `data`. Unwrapping both here, in one place, is what stops a finished
 * job from being read as an empty result and written to the sheet as "Not found".
 */
function pollForResult(apiKey, pollUrl) {
  for (var i = 0; i < POLL_ATTEMPTS; i++) {
    Utilities.sleep(POLL_INTERVAL_MS);

    var response = UrlFetchApp.fetch(pollUrl, {
      'headers': { 'Authorization': 'Bearer ' + apiKey },
      'muteHttpExceptions': true
    });

    if (response.getResponseCode() === 404) {
      throw new Error('The job expired before it could be read — try this row again.');
    }

    var body = {};
    try { body = JSON.parse(response.getContentText()) || {}; } catch (e) { body = {}; }

    if (!body.status || body.status === 'processing') continue;
    if (body.status === 'error') {
      throw new Error(body.message || 'The lookup failed while it was running.');
    }

    var payload = body.data || body;
    return payload.result === undefined ? payload : payload.result;
  }

  throw new Error('Still running after ' + Math.round(POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000) +
                  ' seconds — try this row again.');
}

// Convert column letter to number
function columnLetterToNumber(column = 2) {
  // If already a number, return it
  if (typeof column === 'number') {
    return column;
  }

  // If it's a string that's actually a number
  if (!isNaN(column)) {
    return parseInt(column);
  }

  // Convert letter(s) to number
  column = column.toUpperCase();
  var result = 0;
  for (var i = 0; i < column.length; i++) {
    result = result * 26 + (column.charCodeAt(i) - 64);
  }
  return result;
}

// Convert column number to letter
function columnNumberToLetter(column) {
  var temp, letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}
