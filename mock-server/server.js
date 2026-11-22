// Mock implementation of the `cobalt serve` HTTP API 0.2.0 (see ../api_description.md), served
// under the default prefix /api (`POST /api/stats`, `GET /api` for the version).
//
//   npm run mock                              # http://127.0.0.1:8001, CORS on, no auth
//   MOCK_PORT=9000 npm run mock               # another port
//   MOCK_API_KEYS=k1,k2 npm run mock          # require X-API-Key except on GET /api, /api/health
//   MOCK_DELAY_MS=800 npm run mock            # slow every response down (to test loading states)
//   MOCK_MAX_UPLOAD_MB=1 npm run mock         # upload limit (default 100, 0 = no limit)
//   MOCK_STORAGE_DIR=.cobalt-server npm run mock  # serve the runs stored there, not the seed runs
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { SEED_RUNS, loadRuns, runSummary, sortRunsNewestFirst } from './runs.js';
import {
  CobaltError,
  OUTPUT_FORMATS,
  SORT_KEYS,
  buildInspectReport,
  buildQcReport,
  normalizedFileName,
  readFile,
  sortRows,
  statsRow,
  writeRecords,
} from './sequences.js';

export const VERSION = '0.2.0';
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

async function parseUpload(file, ctx) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return readFile(bytes, file.name || 'upload', {
    maxDecompressedBytes: ctx.maxUploadBytes ? ctx.maxUploadBytes * 10 : null,
  });
}

// ---------------------------------------------------------------------------
// JSON body helpers (pydantic-style validation of the stub endpoints' bodies)
// ---------------------------------------------------------------------------

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function parseJsonBody(bytes) {
  const text = new TextDecoder().decode(bytes);
  if (text.trim() === '') {
    throw new ValidationError([
      { type: 'missing', loc: ['body'], msg: 'Field required', input: null },
    ]);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new ValidationError([
      {
        type: 'json_invalid',
        loc: ['body', 0],
        msg: 'JSON decode error',
        input: {},
        ctx: { error: err.message },
      },
    ]);
  }
}

/**
 * Validate a JSON object body against a field spec and fill in defaults.
 * @param {unknown} body
 * @param {Record<string, { kind: 'string' | 'bool' | 'string_dict', default?: unknown }>} spec
 */
function validateJsonBody(body, spec) {
  if (!isObject(body)) {
    throw new ValidationError([
      {
        type: 'model_attributes_type',
        loc: ['body'],
        msg: 'Input should be a valid dictionary or object to extract fields from',
        input: body,
      },
    ]);
  }
  const errors = [];
  const result = {};
  const stringError = (loc, input) => ({
    type: 'string_type',
    loc,
    msg: 'Input should be a valid string',
    input,
  });
  for (const [name, field] of Object.entries(spec)) {
    const loc = ['body', name];
    const value = body[name];
    if (value === undefined) {
      if ('default' in field) result[name] = structuredClone(field.default);
      else errors.push({ type: 'missing', loc, msg: 'Field required', input: body });
      continue;
    }
    if (field.kind === 'string') {
      if (typeof value === 'string') result[name] = value;
      else errors.push(stringError(loc, value));
    } else if (field.kind === 'bool') {
      const lowered = typeof value === 'string' ? value.trim().toLowerCase() : null;
      if (typeof value === 'boolean') result[name] = value;
      else if (value === 0 || value === 1) result[name] = value === 1;
      else if (TRUE_VALUES.includes(lowered)) result[name] = true;
      else if (FALSE_VALUES.includes(lowered)) result[name] = false;
      else if (lowered !== null) {
        errors.push({
          type: 'bool_parsing',
          loc,
          msg: 'Input should be a valid boolean, unable to interpret input',
          input: value,
        });
      } else
        errors.push({
          type: 'bool_type',
          loc,
          msg: 'Input should be a valid boolean',
          input: value,
        });
    } else if (field.kind === 'string_dict') {
      if (!isObject(value)) {
        errors.push({
          type: 'dict_type',
          loc,
          msg: 'Input should be a valid dictionary',
          input: value,
        });
        continue;
      }
      const bad = Object.entries(value).filter(([, v]) => typeof v !== 'string');
      for (const [key, v] of bad) errors.push(stringError([...loc, key], v));
      if (bad.length === 0) result[name] = { ...value };
    }
  }
  if (errors.length > 0) throw new ValidationError(errors);
  return result;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleInspect({ form, ctx }) {
  const [file] = uploads(form, { required: true });
  const overviewOnly = boolField(form, 'overview_only');
  const limit = nonNegativeIntField(form, 'output_seq_number');
  const offset = nonNegativeIntField(form, 'offset') ?? 0;
  const includeSequence = boolField(form, 'include_sequence', true);
  const maxWarnings = nonNegativeIntField(form, 'max_warnings');
  const parsed = await parseUpload(file, ctx);
  return json(
    200,
    buildInspectReport(parsed, { overviewOnly, limit, offset, includeSequence, maxWarnings }),
  );
}

async function handleValidate({ form, ctx }) {
  const [file] = uploads(form, { required: true });
  const maxWarnings = nonNegativeIntField(form, 'max_warnings');
  return json(200, buildQcReport(await parseUpload(file, ctx), { maxWarnings }));
}

async function handleStats({ form, ctx }) {
  const files = uploads(form, { required: false });
  const sort = enumField(form, 'sort', SORT_KEYS, null);
  const desc = boolField(form, 'desc');
  const sequenceValue = form.get('sequence');
  const sequence =
    typeof sequenceValue === 'string' && sequenceValue.trim() !== '' ? sequenceValue : null;

  if (files.length === 0 && sequence === null) {
    throw new ValidationError([
      {
        type: 'missing',
        loc: ['body', 'file'],
        msg: 'give one or more files or a sequence',
        input: null,
      },
    ]);
  }
  if (files.length > 0 && sequence !== null) {
    throw new ValidationError([
      {
        type: 'value_error',
        loc: ['body', 'sequence'],
        msg: 'give either files or a sequence, not both',
        input: sequence,
      },
    ]);
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
      const parsed = await parseUpload(file, ctx);
      rows.push(...parsed.records.map((raw) => statsRow(raw, parsed.format, parsed.file)));
    }
  }
  if (sort) rows = sortRows(rows, sort, desc);
  return json(200, rows);
}

/** `Content-Disposition: attachment` with an ASCII `filename` and, if needed, `filename*` (RFC 6266). */
export function contentDisposition(fileName) {
  const ascii = /^[\x20-\x7e]*$/.test(fileName);
  const fallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '\\$&');
  let value = `attachment; filename="${fallback}"`;
  if (!ascii) {
    const encoded = encodeURIComponent(fileName).replace(
      /['()*!]/g,
      (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
    );
    value += `; filename*=UTF-8''${encoded}`;
  }
  return value;
}

async function handleNormalize({ form, ctx }) {
  const [file] = uploads(form, { required: true });
  const format = enumField(form, 'format', OUTPUT_FORMATS, 'fasta');
  const parsed = await parseUpload(file, ctx);
  const { text, read, written, skipped } = writeRecords(parsed, format);
  return new HttpResponse(200, {
    text,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': contentDisposition(normalizedFileName(file.name, format)),
      'X-Records-Read': String(read),
      'X-Records-Written': String(written),
      'X-Records-Skipped': String(skipped),
    },
  });
}

async function handleRunsList({ ctx }) {
  return json(200, sortRunsNewestFirst([...ctx.runs.values()]).map(runSummary));
}

async function handleRunsShow({ match, ctx }) {
  let runId = match[1];
  try {
    runId = decodeURIComponent(runId);
  } catch {
    // Keep a malformed escape as it is: no run has such an id.
  }
  const run = ctx.runs.get(runId);
  return run ? json(200, run) : detail(404, `run not found: ${runId}`);
}

const notImplemented = (command) => detail(501, `cobalt ${command} is not implemented yet`);

async function handleRun({ body }) {
  validateJsonBody(body, {
    pipeline: { kind: 'string' },
    params: { kind: 'string_dict', default: {} },
    backend: { kind: 'string', default: 'local' },
    resume: { kind: 'bool', default: false },
  });
  return notImplemented('run');
}

async function handleFoldRna({ body }) {
  validateJsonBody(body, {
    sequence: { kind: 'string' },
    adapter: { kind: 'string', default: 'viennarna' },
  });
  return notImplemented('foldrna');
}

/** All endpoints are served under this prefix, e.g. `POST /api/stats`. */
export const API_PREFIX = '/api';

/**
 * Route table, paths relative to API_PREFIX: [method, pattern, handler, { public, body }].
 * `body` is 'form' (multipart or urlencoded) or 'json'; without it the body is ignored.
 */
const ROUTES = [
  ['GET', /^\/$/, async () => json(200, { title: TITLE, version: VERSION }), { public: true }],
  ['GET', /^\/health$/, async () => json(200, { status: 'ok' }), { public: true }],
  ['POST', /^\/inspect$/, handleInspect, { body: 'form' }],
  ['POST', /^\/validate$/, handleValidate, { body: 'form' }],
  ['POST', /^\/stats$/, handleStats, { body: 'form' }],
  ['POST', /^\/normalize$/, handleNormalize, { body: 'form' }],
  ['GET', /^\/me$/, async ({ ctx }) => json(200, { name: ctx.userName }), {}],
  ['GET', /^\/runs$/, handleRunsList, {}],
  ['GET', /^\/runs\/([^/]+)$/, handleRunsShow, {}],
  ['POST', /^\/run$/, handleRun, { body: 'json' }],
  ['POST', /^\/foldrna$/, handleFoldRna, { body: 'json' }],
];

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

/** Response headers browsers may read across origins (`/normalize` result metadata). */
const EXPOSED_HEADERS = [
  'Content-Disposition',
  'X-Records-Read',
  'X-Records-Written',
  'X-Records-Skipped',
];

function corsHeaders(req) {
  return {
    'Access-Control-Allow-Origin': req.headers.origin ?? '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] ?? '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Expose-Headers': EXPOSED_HEADERS.join(', '),
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

class PayloadTooLarge extends Error {}

const tooLarge = (ctx) => detail(413, `upload too large: limit is ${ctx.maxUploadMb} MB`);

/** Read the whole request body, failing once it passes the limit (then the rest is discarded). */
function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const onData = (chunk) => {
      size += chunk.length;
      if (maxBytes && size > maxBytes) {
        req.off('data', onData);
        req.resume(); // drain and discard the rest
        reject(new PayloadTooLarge());
        return;
      }
      chunks.push(chunk);
    };
    req.on('data', onData);
    req.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    req.on('error', reject);
  });
}

async function parseForm(req, url, bytes) {
  const contentType = req.headers['content-type'] ?? '';
  if (!/multipart\/form-data|application\/x-www-form-urlencoded/i.test(contentType)) {
    return new FormData();
  }
  const request = new Request(url, {
    method: req.method,
    headers: { 'content-type': contentType },
    body: bytes,
  });
  try {
    return await request.formData();
  } catch {
    return new FormData();
  }
}

async function dispatch(req, ctx) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') : url.pathname;

  if (req.method === 'OPTIONS') return new HttpResponse(204);

  // Refuse a declared oversized body before reading it.
  const declared = Number(req.headers['content-length']);
  if (ctx.maxUploadBytes && Number.isFinite(declared) && declared > ctx.maxUploadBytes) {
    req.resume();
    return tooLarge(ctx);
  }

  // Everything lives under API_PREFIX; the route table holds the paths after it.
  if (path !== API_PREFIX && !path.startsWith(API_PREFIX + '/')) {
    req.resume();
    return detail(404, 'Not Found');
  }
  const routePath = path.slice(API_PREFIX.length) || '/';

  const matching = ROUTES.filter(([, pattern]) => pattern.test(routePath));
  if (matching.length === 0) {
    req.resume();
    return detail(404, 'Not Found');
  }
  const route = matching.find(([method]) => method === req.method);
  if (!route) {
    req.resume();
    return detail(405, 'Method Not Allowed');
  }
  const [, pattern, handler, options] = route;

  if (!options.public && ctx.apiKeys.length > 0) {
    const key = req.headers['x-api-key'];
    if (typeof key !== 'string' || !ctx.apiKeys.includes(key)) {
      req.resume();
      return detail(401, 'Invalid or missing API key', { 'WWW-Authenticate': 'ApiKey' });
    }
  }

  try {
    const input = { ctx, match: pattern.exec(routePath), form: null, body: undefined };
    if (options.body) {
      const bytes = await readBody(req, ctx.maxUploadBytes);
      if (options.body === 'form') input.form = await parseForm(req, url, bytes);
      else input.body = parseJsonBody(bytes);
    } else {
      req.resume();
    }
    return await handler(input);
  } catch (err) {
    if (err instanceof PayloadTooLarge) return tooLarge(ctx);
    if (err instanceof ValidationError) return json(422, { detail: err.errors });
    if (err instanceof CobaltError) return detail(err.status, err.message);
    throw err;
  }
}

/**
 * Create the mock server (not yet listening).
 * @param {{ apiKeys?: string[], delayMs?: number, log?: boolean, maxUploadMb?: number,
 *           runs?: object[], userName?: string }} [options]
 *   `maxUploadMb`: request body limit in MiB (default 100, 0 = no limit).
 *   `runs`: the stored pipeline runs to serve (default: the seed runs).
 *   `userName`: the name `GET /me` returns for the caller (default `lab user`).
 */
export function createServer({
  apiKeys = [],
  delayMs = 0,
  log = false,
  maxUploadMb = 100,
  runs = SEED_RUNS,
  userName = 'lab user',
} = {}) {
  const ctx = {
    apiKeys,
    maxUploadMb,
    maxUploadBytes: maxUploadMb > 0 ? Math.floor(maxUploadMb * 1024 * 1024) : 0,
    runs: new Map(runs.map((run) => [run.run_id, run])),
    userName,
  };
  return http.createServer(async (req, res) => {
    let response;
    try {
      response = await dispatch(req, ctx);
    } catch (err) {
      console.error(err);
      req.resume();
      response = detail(500, 'Internal server error');
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
  const port = Number(process.env.MOCK_PORT ?? 8001);
  const host = process.env.MOCK_HOST ?? '127.0.0.1';
  const apiKeys = (process.env.MOCK_API_KEYS ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  const delayMs = Number(process.env.MOCK_DELAY_MS ?? 0);
  const maxUploadMb = Number(process.env.MOCK_MAX_UPLOAD_MB ?? 100);
  const storageDir = process.env.MOCK_STORAGE_DIR;
  const runs = storageDir ? loadRuns(storageDir) : SEED_RUNS;
  const userName = process.env.MOCK_USER_NAME || undefined;
  const server = createServer({ apiKeys, delayMs, log: true, maxUploadMb, runs, userName });
  server.listen(port, host, () => {
    console.log(`Cobalt mock server ${VERSION} listening on http://${host}:${port}`);
    console.log(
      `  auth: ${apiKeys.length ? `api-key (${apiKeys.length} key(s))` : 'none'}, CORS: any origin`,
    );
    console.log(`  upload limit: ${maxUploadMb > 0 ? `${maxUploadMb} MB` : 'none'}`);
    console.log(
      `  runs: ${runs.length} ${storageDir ? `loaded from ${storageDir}/runs` : 'seed runs'}`,
    );
    if (delayMs) console.log(`  delay: ${delayMs} ms`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
