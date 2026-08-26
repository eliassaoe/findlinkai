'use strict';

const { API_BASE } = require('./lib/linkfinder');

/**
 * Every enrichment costs credits, and Zapier re-tests a connection routinely — so the
 * connection test must not be an enrichment. It polls a job id that cannot exist
 * instead: the status endpoint is authenticated but free, so a valid key gets a 404
 * ("no such job", which is the expected answer) and an invalid one gets a 401.
 */
const test = async (z) => {
  const response = await z.request({
    url: `${API_BASE}/status/zapier-connection-test`,
    method: 'GET',
    skipThrowForStatus: true,
  });

  if (response.status === 401) {
    throw new z.errors.Error('That API key was rejected. Copy it again from linkfinderai.com → API.', 'AuthenticationError', 401);
  }
  if (response.status >= 500) {
    throw new z.errors.Error('LinkFinder AI is not responding right now. Try connecting again shortly.', 'ServerError', response.status);
  }

  // 404 is the success case: the key authenticated, the made-up job simply does not exist.
  return { connected: true };
};

module.exports = {
  type: 'custom',

  fields: [
    {
      key: 'api_key',
      label: 'API Key',
      type: 'password',
      required: true,
      helpText:
        'Find this in [your LinkFinder AI account](https://linkfinderai.com/api-access) under API. ' +
        'Enrichments run against this key and draw down its credits.',
    },
  ],

  test,

  // Shown on the connection in the Zap editor so someone with several keys can tell them apart.
  connectionLabel: 'LinkFinder AI',
};
