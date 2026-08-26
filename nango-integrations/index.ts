// Zero-YAML entrypoint. The Nango CLI discovers scripts through this file only:
// anything not imported here is invisible to compile, dryrun and deploy.
//
// Every CRM exposes the same three actions. HubSpot's are hand-written (it came
// first and has extra property-mapping behaviour); the rest are built from a shared
// implementation over a per-CRM adapter — see shared/crm.ts.

// HubSpot
import './hubspot/actions/enrich-contact.js';
import './hubspot/actions/enrich-company.js';
import './hubspot/actions/check-linkfinder-job.js';

// Salesforce
import './salesforce/actions/enrich-contact.js';
import './salesforce/actions/enrich-company.js';
import './salesforce/actions/check-linkfinder-job.js';

// Pipedrive
import './pipedrive/actions/enrich-contact.js';
import './pipedrive/actions/enrich-company.js';
import './pipedrive/actions/check-linkfinder-job.js';

// Zoho CRM
import './zoho/actions/enrich-contact.js';
import './zoho/actions/enrich-company.js';
import './zoho/actions/check-linkfinder-job.js';

// Close
import './close/actions/enrich-contact.js';
import './close/actions/enrich-company.js';
import './close/actions/check-linkfinder-job.js';

// monday.com
import './monday/actions/enrich-contact.js';
import './monday/actions/enrich-company.js';
import './monday/actions/check-linkfinder-job.js';
