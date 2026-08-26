/**
 * LinkFinder AI for Google Sheets.
 *
 * The strategy note behind this: the single most-run operation is
 * lead_full_name_to_linkedin_url — a column goes in, a column comes out, repeatedly.
 * That is a spreadsheet job, and the people running it are sales ops who will never
 * copy an API key. So this add-on is the same enrichment reachable without one.
 *
 * Two ways in:
 *   1. Enrich a column   — menu-driven, handles thousands of rows across the 6-minute
 *                          execution limit by scheduling itself to continue.
 *   2. =LINKFINDER(...)  — a custom function, for one-off cells.
 */

var SETTINGS_KEY_API = 'LINKFINDER_API_KEY';
var STATE_KEY = 'LINKFINDER_JOB_STATE';

// Apps Script kills a script at 6 minutes. Stopping at 4.5 leaves room to save state
// and schedule the continuation rather than losing the rows already paid for.
var TIME_BUDGET_MS = 4.5 * 60 * 1000;

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('LinkFinder AI')
    .addItem('Enrich a column…', 'showSidebar')
    .addItem('Set API key…', 'promptForApiKey')
    .addSeparator()
    .addItem('Stop a running job', 'cancelRun')
    .addToUi();
}

function onInstall() {
  onOpen();
}

function showSidebar() {
  var html = HtmlService.createTemplateFromFile('Sidebar').evaluate().setTitle('LinkFinder AI');
  SpreadsheetApp.getUi().showSidebar(html);
}

/** Operations, for the sidebar dropdown. */
function getOperations() {
  return LINKFINDER_OPERATIONS;
}

// ── API key ────────────────────────────────────────────────────────────────────
// Stored per user, not per document, so a shared sheet does not leak one person's key
// (and their credits) to everyone else who can open it.

function promptForApiKey() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt(
    'LinkFinder AI API key',
    'Paste your API key from linkfinderai.com → API. It is stored against your Google account only — other people using this sheet will need to enter their own.',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  var key = response.getResponseText().trim();
  if (!key) {
    ui.alert('No key entered.');
    return;
  }

  PropertiesService.getUserProperties().setProperty(SETTINGS_KEY_API, key);
  ui.alert('API key saved.');
}

function getApiKey() {
  var key = PropertiesService.getUserProperties().getProperty(SETTINGS_KEY_API);
  if (!key) {
    throw new Error('No LinkFinder AI API key set. Use LinkFinder AI → Set API key… first.');
  }
  return key;
}

function hasApiKey() {
  return Boolean(PropertiesService.getUserProperties().getProperty(SETTINGS_KEY_API));
}

// ── the API call ───────────────────────────────────────────────────────────────

function callLinkFinder(type, inputData, params) {
  var operation = lfOperation(type);
  var response = postEnrichment(type, inputData, params);

  // The Instagram operation's type name differs between the spec and the published
  // docs. Retry the alternative once if the API rejects the first as unknown.
  if (response.getResponseCode() === 422 && operation && operation.altType) {
    response = postEnrichment(operation.altType, inputData, params);
  }

  var body = parseJson(response);
  assertOk(response.getResponseCode(), body);

  if (response.getResponseCode() !== 202 && !body.job_id) {
    assertNotUpstreamError(body.result);
    return body.result === undefined ? null : body.result;
  }

  return pollJob(body.job_id, body.poll_url);
}

function postEnrichment(type, inputData, params) {
  var payload = { type: type, input_data: inputData };
  if (params) {
    for (var key in params) {
      if (params[key] !== '' && params[key] !== null && params[key] !== undefined) payload[key] = params[key];
    }
  }

  return UrlFetchApp.fetch(LINKFINDER_API_BASE, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + getApiKey() },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

function pollJob(jobId, pollUrl) {
  var url = pollUrl || LINKFINDER_API_BASE + '/status/' + jobId;
  var deadline = Date.now() + 90 * 1000;
  var delay = 2000;

  while (Date.now() < deadline) {
    Utilities.sleep(delay);

    var response = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + getApiKey() },
      muteHttpExceptions: true
    });

    if (response.getResponseCode() === 404) {
      throw new Error('That LinkFinder AI job expired. Results are kept for 10 minutes.');
    }

    var body = parseJson(response);
    assertOk(response.getResponseCode(), body);

    if (body.status === 'error') throw new Error(body.message || 'The lookup failed.');

    if (body.status !== 'processing') {
      var payload = body.data || body;
      assertNotUpstreamError(payload.result);
      return payload.result === undefined ? null : payload.result;
    }

    delay = Math.min(delay * 1.5, 5000);
  }

  throw new Error('This lookup was still running after 90 seconds. Try it again, or use the API directly.');
}

function parseJson(response) {
  try {
    return JSON.parse(response.getContentText() || '{}');
  } catch (e) {
    return {};
  }
}

function assertOk(status, body) {
  if (status === 401) throw new Error('Your LinkFinder AI API key was rejected. Set it again from the menu.');
  if (status === 402) throw new Error('Out of credits. Top up at linkfinderai.com and run this again.');
  if (status === 422) throw new Error(body.message || 'LinkFinder AI rejected this input for that lookup.');
  if (status === 429) throw new Error('Rate limited by LinkFinder AI. Wait a moment and continue.');
  if (status >= 500) throw new Error(body.message || 'LinkFinder AI had a server error.');
}

/**
 * Some operations answer 200 with status "success" while the result is really an
 * upstream failure — leads_finder_ai was observed returning a provider permissions
 * error as its only result. Without this the sheet would fill with error objects.
 */
function assertNotUpstreamError(result) {
  var items = Array.isArray(result) ? result : [result];

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (!item || typeof item !== 'object' || !item.error) continue;

    var message = typeof item.error === 'string' ? item.error : item.error.message || 'provider error';
    throw new Error('LinkFinder AI returned a provider error instead of data: ' + String(message).slice(0, 200));
  }
}

// ── custom function ────────────────────────────────────────────────────────────

/**
 * Enrich one value.
 *
 * @param {string} type    The lookup, e.g. "lead_full_name_to_linkedin_url".
 * @param {string} input   What to look up.
 * @return {string} The result, or an empty string when nothing was found.
 * @customfunction
 */
function LINKFINDER(type, input) {
  if (!type || !input) return '';

  var operation = lfOperation(type);
  if (!operation) {
    throw new Error('Unknown lookup "' + type + '". Use the sidebar to see the ' + LINKFINDER_OPERATIONS.length + ' available.');
  }

  var result = callLinkFinder(type, String(input).trim(), null);
  return formatResult(result, operation);
}

/** Sheets cells hold one value, so an object or list is flattened to something readable. */
function formatResult(result, operation) {
  if (result === null || result === undefined || result === '') return '';
  if (typeof result !== 'object') return result;

  if (Array.isArray(result)) {
    return result
      .map(function (item) {
        return item && typeof item === 'object' ? item.linkedinUrl || item.email || item.name || '' : item;
      })
      .filter(String)
      .join(', ');
  }

  // Prefer whatever the operation is actually for, then fall back to anything useful.
  return (
    result[operation.outputField] ||
    result.email ||
    result.linkedinUrl ||
    result.mobileNumber ||
    result.website ||
    result.name ||
    JSON.stringify(result)
  );
}
