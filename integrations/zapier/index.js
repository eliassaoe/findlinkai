'use strict';

const { version } = require('./package.json');
const { version: platformVersion } = require('zapier-platform-core');

const authentication = require('./authentication');
const { addBearerToken } = require('./middleware');
const searches = require('./searches');

module.exports = {
  version,
  platformVersion,

  authentication,

  beforeRequest: [addBearerToken],
  afterResponse: [],

  triggers: {},
  // Enrichment is a lookup, not a record feed — every operation is a search.
  searches,
  creates: {},
};
