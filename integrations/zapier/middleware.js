'use strict';

/** Attaches the API key to every request. Zapier calls this before each one. */
const addBearerToken = (request, z, bundle) => {
  if (bundle.authData && bundle.authData.api_key) {
    request.headers = request.headers || {};
    request.headers.Authorization = `Bearer ${bundle.authData.api_key}`;
    request.headers['Content-Type'] = 'application/json';
  }
  return request;
};

module.exports = { addBearerToken };
