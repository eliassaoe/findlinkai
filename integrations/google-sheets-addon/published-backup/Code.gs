/**
 * @OnlyCurrentDoc
 *
 * LinkedIn Profile Finder Add-on
 * Uses LinkFinder AI API to find LinkedIn profile URLs from names and companies
 */

// Add menu when add-on is installed
function onInstall(e) {
  onOpen(e);
}

// Add menu when document is opened
function onOpen(e) {
  SpreadsheetApp.getUi()
    .createAddonMenu()
    .addItem('Find LinkedIn Profiles', 'showSidebar')
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


// Find LinkedIn profiles using selected columns
function findLinkedInProfilesFromSelection(nameColumn, companyColumn, outputColumn) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API key not configured. Please set your API key in Settings.');
  }
  
  // Convert column letters to numbers if needed
  nameColumn = columnLetterToNumber(nameColumn);
  outputColumn = columnLetterToNumber(outputColumn);
  if (companyColumn) {
    companyColumn = columnLetterToNumber(companyColumn);
  }
  
  const sheet = SpreadsheetApp.getActiveSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    throw new Error('Sheet needs at least 2 rows (header + data)');
  }
  
  // Start from row 2 (skip header)
  const startRow = 2;
  const numRows = lastRow - startRow + 1;
  
  const names = sheet.getRange(startRow, nameColumn, numRows, 1).getValues();
  const companies = companyColumn ? sheet.getRange(startRow, companyColumn, numRows, 1).getValues() : [];
  
  var results = [];
  var processedCount = 0;
  var errorCount = 0;
  
  for (var i = 0; i < names.length; i++) {
    var name = names[i][0];
    var company = companies.length > 0 ? companies[i][0] : '';
    
    if (!name || name.toString().trim() === '') {
      results.push(['']);
      continue;
    }
    
    var inputData = name.toString().trim();
    if (company && company.toString().trim() !== '') {
      inputData += ' ' + company.toString().trim();
    }
    
    try {
      var linkedInUrl = callLinkFinderApi(apiKey, inputData);
      results.push([linkedInUrl]);
      processedCount++;
      Utilities.sleep(500); // Rate limiting
    } catch (error) {
      results.push(['ERROR: ' + error.message]);
      errorCount++;
    }
  }
  
  sheet.getRange(startRow, outputColumn, results.length, 1).setValues(results);
  
  return {
    success: true,
    processed: processedCount,
    errors: errorCount,
    total: names.length
  };
}

// Call LinkFinder AI API
function callLinkFinderApi(apiKey, inputData) {
  const url = 'https://api.linkfinderai.com';
  
  var payload = {
    'type': 'lead_full_name_to_linkedin_url',
    'input_data': inputData
  };
  
  var options = {
    'method': 'post',
    'contentType': 'application/json',
    'headers': {
      'Authorization': 'Bearer ' + apiKey
    },
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  };
  
  try {
    Logger.log('Calling API with data: ' + inputData);
    var response = UrlFetchApp.fetch(url, options);
    var responseCode = response.getResponseCode();
    var responseText = response.getContentText();
    
    Logger.log('Response code: ' + responseCode);
    Logger.log('Response text: ' + responseText);
    
    if (responseCode !== 200) {
      throw new Error('API request failed with status ' + responseCode + ': ' + responseText);
    }
    
    var result = JSON.parse(responseText);
    
    if (result.status === 'success' && result.result) {
      return result.result;
    } else if (result.status === 'error') {
      Logger.log('API returned error: ' + JSON.stringify(result));
      return 'Not found';
    } else {
      Logger.log('Unexpected response: ' + JSON.stringify(result));
      return 'Not found';
    }
  } catch (error) {
    Logger.log('API Error: ' + error.message);
    throw new Error('API request failed: ' + error.message);
  }
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


















