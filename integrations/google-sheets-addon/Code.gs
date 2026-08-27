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
  var grid = sheet.getRange(startRow, 1, numRows, lastColumn).getValues();
  var at = function (row, col) { return col ? row[col - 1] : ''; };

  // Label the results column, so a sheet with several runs stays readable.
  if (!sheet.getRange(1, outputColumn).getValue()) {
    sheet.getRange(1, outputColumn).setValue(operation.label);
  }

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
      var result = callLinkFinderApi(apiKey, operation, inputData, config.params);
      // Written per row rather than batched at the end: a run that is cut short
      // must not throw away work the user has already paid for.
      sheet.getRange(startRow + i, outputColumn).setValue(result);
      if (result !== 'Not found') foundCount++;
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
    total: grid.length
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
    return formatResult(pollForResult(apiKey, result.poll_url || (url + '/status/' + result.job_id)), operation);
  }

  return formatResult(result.result, operation);
}

/**
 * A cell holds one value, so a list or an object has to be flattened. Prefer the
 * field the lookup is actually for before falling back to anything identifying.
 */
function formatResult(result, operation) {
  if (result === null || result === undefined || result === '') return 'Not found';

  // A provider failure can arrive dressed as a successful result.
  if (result.error) {
    throw new Error('LinkFinder AI provider error: ' +
      (result.error.message || 'unknown').toString().slice(0, 200));
  }

  if (typeof result !== 'object') return result;

  if (Object.prototype.toString.call(result) === '[object Array]') {
    if (!result.length) return 'Not found';
    var items = [];
    for (var i = 0; i < result.length; i++) {
      var item = result[i];
      items.push(item && typeof item === 'object'
        ? (item.linkedinUrl || item.email || item.name || JSON.stringify(item))
        : item);
    }
    return items.join(', ');
  }

  return result[operation.outputField] || result.email || result.linkedinUrl ||
         result.mobileNumber || result.website || result.name || JSON.stringify(result);
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
