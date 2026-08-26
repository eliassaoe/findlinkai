/**
 * Column enrichment.
 *
 * The part that matters here is that it survives Apps Script's 6-minute execution
 * limit. A few thousand rows cannot finish in one run, so progress is written to the
 * sheet as it goes and the run schedules itself to continue — meaning an interrupted
 * job never re-enriches (and re-charges for) a row that already has an answer.
 */

function startRun(config) {
  var sheet = SpreadsheetApp.getActiveSheet();

  var state = {
    sheetId: sheet.getSheetId(),
    type: config.type,
    sourceColumn: config.sourceColumn,
    targetColumn: config.targetColumn,
    firstRow: Number(config.firstRow) || 2,
    lastRow: Number(config.lastRow) || sheet.getLastRow(),
    params: config.params || {},
    cursor: Number(config.firstRow) || 2,
    done: 0,
    found: 0,
    failed: 0,
    cancelled: false
  };

  PropertiesService.getDocumentProperties().setProperty(STATE_KEY, JSON.stringify(state));

  var operation = lfOperation(config.type);
  sheet.getRange(1, columnToIndex(config.targetColumn)).setValue(operation ? operation.label : config.type);

  return continueRun();
}

/** Runs until the row range is finished or the time budget is spent. */
function continueRun() {
  var raw = PropertiesService.getDocumentProperties().getProperty(STATE_KEY);
  if (!raw) return { finished: true, message: 'Nothing running.' };

  var state = JSON.parse(raw);
  if (state.cancelled) {
    finishRun();
    return { finished: true, message: 'Stopped. ' + state.done + ' rows were enriched.' };
  }

  var sheet = sheetById(state.sheetId);
  var operation = lfOperation(state.type);
  var started = Date.now();
  var sourceIndex = columnToIndex(state.sourceColumn);
  var targetIndex = columnToIndex(state.targetColumn);

  while (state.cursor <= state.lastRow) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      // Out of time, not out of work. Save and pick up where this left off.
      PropertiesService.getDocumentProperties().setProperty(STATE_KEY, JSON.stringify(state));
      scheduleContinuation();
      return {
        finished: false,
        done: state.done,
        found: state.found,
        failed: state.failed,
        message: 'Paused at row ' + state.cursor + ' and will continue automatically in a minute.'
      };
    }

    var input = sheet.getRange(state.cursor, sourceIndex).getDisplayValue();
    var existing = sheet.getRange(state.cursor, targetIndex).getDisplayValue();

    // Never spend a credit on a row that already has an answer. This is what makes
    // resuming safe, and re-running the same range cheap.
    if (!input || existing) {
      state.cursor++;
      continue;
    }

    try {
      var result = callLinkFinder(state.type, input.trim(), state.params);
      var value = formatResult(result, operation);
      sheet.getRange(state.cursor, targetIndex).setValue(value === '' ? 'Not found' : value);
      if (value !== '') state.found++;
    } catch (error) {
      // Write the failure into the row rather than aborting the run — one bad input
      // must not strand the rows after it.
      sheet.getRange(state.cursor, targetIndex).setValue('Error: ' + error.message);
      state.failed++;

      // Out of credits or a bad key will not fix itself; stop rather than writing the
      // same error into every remaining row.
      if (/out of credits|key was rejected/i.test(error.message)) {
        state.cursor++;
        PropertiesService.getDocumentProperties().setProperty(STATE_KEY, JSON.stringify(state));
        finishRun();
        return { finished: true, done: state.done, found: state.found, failed: state.failed, message: error.message };
      }
    }

    state.done++;
    state.cursor++;

    if (state.done % 10 === 0) {
      PropertiesService.getDocumentProperties().setProperty(STATE_KEY, JSON.stringify(state));
      SpreadsheetApp.flush();
    }
  }

  finishRun();
  return {
    finished: true,
    done: state.done,
    found: state.found,
    failed: state.failed,
    message: 'Done. ' + state.found + ' of ' + state.done + ' rows found a result.'
  };
}

function cancelRun() {
  var raw = PropertiesService.getDocumentProperties().getProperty(STATE_KEY);
  if (!raw) {
    SpreadsheetApp.getUi().alert('Nothing is running.');
    return;
  }

  var state = JSON.parse(raw);
  state.cancelled = true;
  PropertiesService.getDocumentProperties().setProperty(STATE_KEY, JSON.stringify(state));
  clearContinuations();
  SpreadsheetApp.getUi().alert('Stopping after the row in progress.');
}

function getRunStatus() {
  var raw = PropertiesService.getDocumentProperties().getProperty(STATE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function finishRun() {
  PropertiesService.getDocumentProperties().deleteProperty(STATE_KEY);
  clearContinuations();
}

function scheduleContinuation() {
  clearContinuations();
  ScriptApp.newTrigger('continueRun').timeBased().after(60 * 1000).create();
}

function clearContinuations() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'continueRun') ScriptApp.deleteTrigger(triggers[i]);
  }
}

function sheetById(id) {
  var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === id) return sheets[i];
  }
  throw new Error('The sheet this run started on no longer exists.');
}

/** "A" -> 1, "AB" -> 28. */
function columnToIndex(column) {
  var letters = String(column).toUpperCase().replace(/[^A-Z]/g, '');
  if (!letters) throw new Error('"' + column + '" is not a column letter.');

  var index = 0;
  for (var i = 0; i < letters.length; i++) {
    index = index * 26 + (letters.charCodeAt(i) - 64);
  }
  return index;
}
