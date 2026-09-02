/**
 * Generates a Make (Integromat) custom app from integrations/catalog/operations.json.
 *
 * Make apps are declarative: each module is a folder of IML/JSON files rather than
 * code, which is why this is generated rather than written — twenty modules that each
 * differ only in a `type` string and a credit cost are exactly what a generator is for.
 *
 * Layout matches Make's own export shape, so the output can be pushed with the Make
 * VS Code extension or pasted into the app editor:
 *
 *   app.json                                  app metadata
 *   general/base.imljson                      base URL, auth header, shared error handling
 *   connections/linkfinderai/*.imljson        API-key connection
 *   modules/<key>/*.imljson                   one folder per operation
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(HERE, '..', 'catalog', 'operations.json'), 'utf8'));

for (const dir of ['general', 'connections', 'modules']) {
  rmSync(join(HERE, dir), { recursive: true, force: true });
}

const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 4)}\n`);
};

const credits = (n) => (n === 1 ? '1 credit' : `${n} credits`);

// ── app metadata ────────────────────────────────────────────────────────────────

writeJson(join(HERE, 'app.json'), {
  name: 'linkfinderai',
  label: 'LinkFinder AI',
  version: 1,
  theme: '#2563eb',
  language: 'en',
  countries: [],
  description:
    'Turn a name, email, company, domain or LinkedIn URL into verified contact and company data. ' +
    'Every module states its credit cost — they range from 1 to 50 credits per lookup.',
});

// ── base ────────────────────────────────────────────────────────────────────────
// Shared by every module: base URL, the bearer header, and the error messages. Doing
// error handling here means a 402 reads the same in all twenty modules.

writeJson(join(HERE, 'general', 'base.imljson'), {
  baseUrl: catalog.apiBase,
  headers: {
    Authorization: 'Bearer {{connection.apiKey}}',
    'Content-Type': 'application/json',
  },
  response: {
    error: {
      401: { message: 'Your LinkFinder AI API key was rejected. Reconnect the connection.' },
      402: {
        message:
          'Your LinkFinder AI account is out of credits. Top up at linkfinderai.com, then run this scenario again.',
      },
      422: { message: '[422] {{body.message}}' },
      429: { message: 'LinkFinder AI rate limit reached. Lower the scenario throughput or retry shortly.' },
      message: '[{{statusCode}}] {{body.message}}',
    },
  },
});

// ── connection ──────────────────────────────────────────────────────────────────

const CONNECTION = join(HERE, 'connections', 'linkfinderai');

writeJson(join(CONNECTION, 'metadata.json'), { name: 'linkfinderai', label: 'LinkFinder AI', type: 'basic' });

writeJson(join(CONNECTION, 'parameters.imljson'), [
  {
    name: 'apiKey',
    type: 'text',
    label: 'API Key',
    required: true,
    help: 'From your LinkFinder AI account at https://linkfinderai.com/api-access. Lookups draw down this key\'s credits.',
  },
]);

// Validating the connection must not run an enrichment — Make re-tests connections,
// and each test would cost credits. Polling a job id that cannot exist is free: a good
// key gets 404 ("no such job"), a bad one gets 401.
writeJson(join(CONNECTION, 'api.imljson'), {
  url: '/status/make-connection-test',
  method: 'GET',
  response: {
    error: {
      401: { message: 'That API key was rejected. Copy it again from linkfinderai.com.' },
    },
    valid: '{{statusCode = 404 || statusCode = 200}}',
  },
});

// ── modules ─────────────────────────────────────────────────────────────────────

const IML_TYPE = { string: 'text', integer: 'number', boolean: 'boolean' };

const sampleType = (value) => {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'text';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'object') return 'collection';
  return 'text';
};

const labelise = (key) =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bUrl\b/, 'URL')
    .replace(/\bLinkedin\b/, 'LinkedIn');

// The catalog's help for a name part promises that "Doe, John" is flipped
// automatically. Every other platform does that in code; Make has no regex in
// IML, so here it would be a lie. Rewritten to ask for the right order instead —
// and the build fails if the catalog's wording changes, rather than silently
// shipping the claim again.
const FLIP_CLAIM = ' "Doe, John" is flipped to "John Doe" automatically.';
const FLIP_REPLACEMENT = ' Enter it as "First Last" — unlike the other platforms, Make cannot reorder "Doe, John" for you.';

function helpFor(part) {
  let help = part.help;
  if (part.name === 'name') {
    if (!help.includes(FLIP_CLAIM)) {
      console.error(
        "make: the catalog's name help no longer contains the flip claim this build rewrites.\n" +
          `        looked for: ${FLIP_CLAIM}\n` +
          `        found:      ${help}\n` +
          '        Update FLIP_REPLACEMENT in make/build.mjs — Make cannot flip "Doe, John".',
      );
      process.exit(1);
    }
    help = help.replace(FLIP_CLAIM, FLIP_REPLACEMENT);
  }
  return part.required
    ? `${help} For example: ${part.example}`
    : `${help} Optional and free — it costs no extra credits and narrows the match. For example: ${part.example}`;
}

function parametersFor(op) {
  // A composite lookup takes one string built from several fields. A single
  // "Full Name and Company" box meant a scenario could only map the name, while
  // app.html sends the name, the company, the location and the job title for the
  // same price. The fields have to exist for anyone to map them.
  const params = op.compositeInput
    ? op.compositeInput.parts.map((part) => ({
        name: part.name,
        type: 'text',
        label: part.label,
        required: Boolean(part.required),
        help: helpFor(part),
      }))
    : [
        {
          name: 'input_data',
          type: 'text',
          label: op.input.label,
          required: true,
          help: `${op.input.help} For example: ${op.input.example}`,
        },
      ];

  for (const param of op.params) {
    const field = {
      name: param.name,
      type: IML_TYPE[param.type] ?? 'text',
      label: param.label,
      required: false,
      help: param.help,
    };
    if (param.default !== undefined) field.default = param.default;
    if (param.min !== undefined) field.validate = { min: param.min, ...(param.max !== undefined ? { max: param.max } : {}) };
    params.push(field);
  }

  return params;
}

function interfaceFor(op) {
  if (op.output.kind === 'scalar') {
    return [
      { name: op.output.field, type: sampleType(op.output.sample), label: labelise(op.output.field) },
      { name: 'value', type: sampleType(op.output.sample), label: 'Value' },
    ];
  }
  return Object.entries(op.output.sample).map(([key, value]) => ({
    name: key,
    type: sampleType(value),
    label: labelise(key),
  }));
}

/**
 * The request. Two steps, because any operation can come back as a job:
 *
 *  1. POST the enrichment. If the response carries a result, we are done.
 *  2. Only when a job id came back, poll /status/{id}, repeating while it is still
 *     processing. Make's `repeat` caps this so a stuck job cannot hang a scenario.
 */
/**
 * The `input_data` expression for a composite lookup.
 *
 * Make has no place to run JavaScript in a module's request, so the join is an
 * IML expression: each optional part contributes " value" only when it is set,
 * and the whole thing is trimmed. Built from `if`, `trim` and string
 * concatenation — the same three the rest of this app already relies on.
 *
 * One thing the other platforms do that this cannot: flipping a CRM-style
 * "Doe, John" into "John Doe". There is no regex in IML, so the field help asks
 * for "First Last" rather than pretending. See catalog/OPEN-QUESTIONS.md.
 */
function compositeExpression(composite) {
  const [first, ...rest] = composite.parts;
  const separator = composite.joinWith ?? ' ';
  const head = `if(parameters.${first.name}, parameters.${first.name}, "")`;
  const tail = rest
    .map((part) => `if(parameters.${part.name}, "${separator}" + parameters.${part.name}, "")`)
    .join(' + ');
  return `{{trim(${[head, tail].filter(Boolean).join(' + ')})}}`;
}

function apiFor(op) {
  const body = {
    type: op.type,
    input_data: op.compositeInput ? compositeExpression(op.compositeInput) : '{{parameters.input_data}}',
  };
  for (const param of op.params) {
    body[param.name] = `{{parameters.${param.name}}}`;
  }

  const isList = op.output.kind === 'list';

  // Scalar results arrive bare (`"result": "tesla.com"`), so they get named here;
  // object and list results are already shaped and pass straight through.
  const outputExpression =
    op.output.kind === 'scalar'
      ? { [op.output.field]: '{{temp.result}}', value: '{{temp.result}}' }
      : '{{temp.result}}';

  return [
    {
      url: '/',
      method: 'POST',
      body,
      response: {
        temp: {
          jobId: '{{body.job_id}}',
          result: '{{body.result}}',
          // A job id means the work is still running; anything else is the answer.
          pending: '{{if(body.job_id, true, false)}}',
        },
      },
    },
    {
      condition: '{{temp.pending}}',
      url: '/status/{{temp.jobId}}',
      method: 'GET',
      repeat: {
        condition: '{{body.status = "processing"}}',
        delay: 2000,
        // ~40s of polling. Beyond that the scenario should be restructured around a
        // webhook rather than held open.
        limit: 20,
      },
      response: {
        error: {
          404: { message: 'That LinkFinder AI job was not found. Job results expire 10 minutes after they finish.' },
        },
        temp: {
          // The status endpoint has been seen returning the payload both flat and
          // wrapped in `data`; accept either.
          result: '{{if(body.data, body.data.result, body.result)}}',
        },
      },
    },
    {
      // A third pass with no request: Make emits the bundle(s) from `temp`, which is
      // now populated whether the answer came back inline or from the job.
      response: isList
        ? { iterate: '{{temp.result}}', output: '{{item}}' }
        : { output: outputExpression },
    },
  ];
}

const modules = [];

for (const op of catalog.operations) {
  const dir = join(HERE, 'modules', op.key);

  const costLine = op.perEmployeeBilling
    ? 'Billed 0.5 credits per employee returned.'
    : `Costs ${credits(op.credits)} per lookup, including lookups that find nothing.`;

  writeJson(join(dir, 'metadata.json'), {
    name: op.key,
    label: op.label,
    description: `${op.input.help} ${costLine}`,
    // "action" is Make's type for a module that does one thing and returns a result;
    // list-returning operations are "search", which emit one bundle per item.
    typeId: op.output.kind === 'list' ? 'search' : 'action',
    connection: 'linkfinderai',
  });

  writeJson(join(dir, 'api.imljson'), apiFor(op));
  writeJson(join(dir, 'parameters.imljson'), parametersFor(op));
  writeJson(join(dir, 'interface.imljson'), interfaceFor(op));
  writeJson(join(dir, 'samples.imljson'), op.output.kind === 'scalar'
    ? { [op.output.field]: op.output.sample, value: op.output.sample }
    : op.output.sample);

  modules.push(op);
}

const searches = modules.filter((m) => m.output.kind === 'list').length;
console.log(
  `make: generated ${modules.length} modules from spec v${catalog.specVersion} ` +
    `(${modules.length - searches} actions, ${searches} searches)`,
);
