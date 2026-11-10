// Mock implementation of the `cobalt serve` HTTP API (see ../api_description.md).
//
//   npm run mock                       # http://127.0.0.1:8000, CORS on, no auth
//   MOCK_PORT=9000 npm run mock        # another port
//   MOCK_API_KEYS=k1,k2 npm run mock   # require X-API-Key on everything except GET /
//   MOCK_DELAY_MS=800 npm run mock     # slow every response down (to test loading states)
import http from 'node:http';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import {
  CobaltError,
  OUTPUT_FORMATS,
  SORT_KEYS,
  buildInspectReport,
  buildQcReport,
  readFile,
  sortRows,
  statsRow,
  writeRecords,
} from './sequences.js';

export const VERSION = '0.1.0';
export const TITLE = 'Cobalt Sequence Lab';

/** A response to send: JSON body, plain-text body or empty body. */
class HttpResponse {
  constructor(status, { json, text, headers = {} } = {}) {
    this.status = status;
    this.json = json;
    this.text = text;
    this.headers = headers;
  }
}

const json = (status, body, headers) => new HttpResponse(status, { json: body, headers });
const detail = (status, message, headers) => json(status, { detail: message }, headers);

/** A FastAPI/pydantic style validation error (422 with an array `detail`). */
class ValidationError extends Error {
  constructor(errors) {
    super('validation error');
    this.errors = errors;
  }
}

const missing = (field) => ({
  type: 'missing',
  loc: ['body', field],
  msg: 'Field required',
  input: null,
});

// ---------------------------------------------------------------------------
// Form helpers
// ---------------------------------------------------------------------------

const TRUE_VALUES = ['true', '1', 'yes', 'on', 't', 'y'];
const FALSE_VALUES = ['false', '0', 'no', 'off', 'f', 'n'];

function boolField(form, name, fallback = false) {
  const value = form.get(name);
  if (value === null) return fallback;
  const lowered = String(value).trim().toLowerCase();
  if (TRUE_VALUES.includes(lowered)) return true;
  if (FALSE_VALUES.includes(lowered)) return false;
  throw new ValidationError([
    {
      type: 'bool_parsing',
      loc: ['body', name],
      msg: 'Input should be a valid boolean, unable to interpret input',
      input: value,
    },
  ]);
}

function nonNegativeIntField(form, name) {
  const value = form.get(name);
  if (value === null || value === '') return null;
  if (!/^[+-]?\d+$/.test(String(value).trim())) {
    throw new ValidationError([
      {
        type: 'int_parsing',
        loc: ['body', name],
        msg: 'Input should be a valid integer, unable to parse string as an integer',
        input: value,
      },
    ]);
  }
  const number = Number(value);
  if (number < 0) {
    throw new ValidationError([
      {
        type: 'greater_than_equal',
        loc: ['body', name],
        msg: 'Input should be greater than or equal to 0',
        input: value,
        ctx: { ge: 0 },
      },
    ]);
  }
  return number;
}

function enumField(form, name, allowed, fallback) {
  const value = form.get(name);
  if (value === null || value === '') return fallback;
  if (allowed.includes(value)) return value;
  const quoted = allowed.map((v) => `'${v}'`);
  const expected = `${quoted.slice(0, -1).join(', ')} or ${quoted.at(-1)}`;
  throw new ValidationError([
    {
      type: 'enum',
      loc: ['body', name],
      msg: `Input should be ${expected}`,
      input: value,
      ctx: { expected },
    },
  ]);
}

function uploads(form, { required }) {
  const values = form.getAll('file');
  if (values.length === 0) {
    if (required) throw new ValidationError([missing('file')]);
    return [];
  }
  // A part sent without a filename arrives as a plain string field: treat it as an unnamed upload.
  return values.map((value) => (typeof value === 'string' ? new File([value], '') : value));
}

async function parseUpload(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return readFile(bytes, file.name || 'upload');
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleInspect(form) {
  const [file] = uploads(form, { required: true });
  const overviewOnly = boolField(form, 'overview_only');
  const limit = nonNegativeIntField(form, 'output_seq_number');
  const parsed = await parseUpload(file);
  return json(200, buildInspectReport(parsed, { overviewOnly, limit }));
}

async function handleValidate(form) {
  const [file] = uploads(form, { required: true });
  return json(200, buildQcReport(await parseUpload(file)));
}

async function handleStats(form) {
  const files = uploads(form, { required: false });
  const sort = enumField(form, 'sort', SORT_KEYS, null);
  const desc = boolField(form, 'desc');
  const sequenceValue = form.get('sequence');
  const sequence =
    typeof sequenceValue === 'string' && sequenceValue.trim() !== '' ? sequenceValue : null;

  if (files.length > 0 === (sequence !== null)) {
    return detail(422, 'give either file uploads or a sequence, not both');
  }

  let rows = [];
  if (sequence !== null) {
    const cleaned = sequence.replace(/\s+/g, '');
    rows.push(
      statsRow(
        {
          id: 'direct_input',
          description: '',
          sequence: cleaned,
          length: cleaned.length,
          qualities: null,
          organism: null,
          molecule_type: null,
          topology: null,
          feature_count: 0,
          annotatedType: null,
        },
        'raw',
        null,
      ),
    );
  } else {
    for (const file of files) {
      const parsed = await parseUpload(file);
      rows.push(...parsed.records.map((raw) => statsRow(raw, parsed.format, parsed.file)));
    }
  }
  if (sort) rows = sortRows(rows, sort, desc);
  return json(200, rows);
}

async function handleNormalize(form) {
  const [file] = uploads(form, { required: true });
  const format = enumField(form, 'format', OUTPUT_FORMATS, 'fasta');
  const parsed = await parseUpload(file);
  return new HttpResponse(200, {
    text: writeRecords(parsed, format),
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

const notImplemented = (command) => async () =>
  detail(501, `cobalt ${command} is not implemented yet`);

/** Route table: [method, pattern, handler, { public, form }] */
const ROUTES = [
  ['GET', /^\/$/, async () => json(200, { title: TITLE, version: VERSION }), { public: true }],
  ['POST', /^\/inspect$/, handleInspect, { form: true }],
  ['POST', /^\/validate$/, handleValidate, { form: true }],
  ['POST', /^\/stats$/, handleStats, { form: true }],
  ['POST', /^\/normalize$/, handleNormalize, { form: true }],
  ['POST', /^\/foldrna$/, notImplemented('foldrna'), {}],
  ['POST', /^\/run$/, notImplemented('run'), {}],
  ['GET', /^\/runs$/, notImplemented('runs list'), {}],
  ['GET', /^\/runs\/[^/]+$/, notImplemented('runs show'), {}],
];

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

function corsHeaders(req) {
  return {
    'Access-Control-Allow-Origin': req.headers.origin ?? '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] ?? '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

async function readForm(req, url) {
  const contentType = req.headers['content-type'] ?? '';
  if (!/multipart\/form-data|application\/x-www-form-urlencoded/i.test(contentType)) {
    req.resume(); // drain
    return new FormData();
  }
  const request = new Request(url, {
    method: req.method,
    headers: { 'content-type': contentType },
    body: Readable.toWeb(req),
    duplex: 'half',
  });
  try {
    return await request.formData();
  } catch {
    return new FormData();
  }
}

async function dispatch(req, { apiKeys }) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') : url.pathname;

  if (req.method === 'OPTIONS') return new HttpResponse(204);

  const matching = ROUTES.filter(([, pattern]) => pattern.test(path));
  if (matching.length === 0) return detail(404, 'Not Found');
  const route = matching.find(([method]) => method === req.method);
  if (!route) return detail(405, 'Method Not Allowed');
  const [, , handler, options] = route;

  if (!options.public && apiKeys.length > 0) {
    const key = req.headers['x-api-key'];
    if (typeof key !== 'string' || !apiKeys.includes(key)) {
      req.resume();
      return detail(401, 'Invalid or missing API key', { 'WWW-Authenticate': 'ApiKey' });
    }
  }

  const form = options.form ? await readForm(req, url) : null;
  if (!options.form) req.resume();
  try {
    return await handler(form);
  } catch (err) {
    if (err instanceof ValidationError) return json(422, { detail: err.errors });
    if (err instanceof CobaltError) return detail(422, err.message);
    throw err;
  }
}

/**
 * Create the mock server (not yet listening).
 * @param {{ apiKeys?: string[], delayMs?: number, log?: boolean }} [options]
 */
export function createServer({ apiKeys = [], delayMs = 0, log = false } = {}) {
  return http.createServer(async (req, res) => {
    let response;
    try {
      response = await dispatch(req, { apiKeys });
    } catch (err) {
      console.error(err);
      response = new HttpResponse(500, {
        text: 'Internal Server Error',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));

    const headers = { ...corsHeaders(req), ...response.headers };
    let body = '';
    if (response.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(response.json);
    } else if (response.text !== undefined) {
      body = response.text;
    }
    res.writeHead(response.status, headers);
    res.end(body);
    if (log) console.log(`${req.method} ${req.url} → ${response.status}`);
  });
}

function main() {
  const port = Number(process.env.MOCK_PORT ?? 8000);
  const host = process.env.MOCK_HOST ?? '127.0.0.1';
  const apiKeys = (process.env.MOCK_API_KEYS ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  const delayMs = Number(process.env.MOCK_DELAY_MS ?? 0);
  const server = createServer({ apiKeys, delayMs, log: true });
  server.listen(port, host, () => {
    console.log(`Cobalt mock server ${VERSION} listening on http://${host}:${port}`);
    console.log(
      `  auth: ${apiKeys.length ? `api-key (${apiKeys.length} key(s))` : 'none'}, CORS: any origin`,
    );
    if (delayMs) console.log(`  delay: ${delayMs} ms`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
