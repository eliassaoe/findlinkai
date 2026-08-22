// n8n loads nodes and credentials from the "n8n" block in package.json, not from
// this file. It exists because package.json declares "main" and npm/Node will
// fail to resolve the package without it.
module.exports = {};
