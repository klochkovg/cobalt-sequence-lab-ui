// Pipeline runs for the mock Cobalt API: seed data, manifest loading and the list summaries.
//
// The real server stores every run in `<storage_dir>/runs/<run_id>/manifest.json` and reloads them
// at startup. Nothing executes runs yet, so the mock only serves runs that already exist: by
// default the SEED_RUNS below, or the manifests of a storage directory (MOCK_STORAGE_DIR).
import fs from 'node:fs';
import path from 'node:path';

export const STATUSES = ['pending', 'running', 'succeeded', 'failed', 'cancelled'];

export const INTERRUPTED_ERROR = 'interrupted: server stopped';

const FOLD_PIPELINE = {
  name: 'fold-rna-from-fasta',
  version: '0.1.0',
  description: 'Inspect, validate, normalize, then fold each sequence.',
};

const QC_PIPELINE = {
  name: 'qc-report',
  version: '1.2.0',
  description: 'Inspect and validate a file, then tabulate per-record statistics.',
};

const task = (
  name,
  type,
  dependsOn,
  status,
  startedAt = null,
  finishedAt = null,
  error = null,
) => ({
  name,
  type,
  depends_on: dependsOn,
  status,
  started_at: startedAt,
  finished_at: finishedAt,
  error,
});

/**
 * Example runs that cover every run and task status. Unlike the real server, the mock keeps
 * `pending` and `running` runs as they are, so the UI can show them.
 */
export const SEED_RUNS = [
  {
    run_id: '20261119-201710-52dea242',
    pipeline: FOLD_PIPELINE,
    params: { input: 'tRNA-panel.fasta', min_length: '30' },
    backend: 'local',
    resume: false,
    status: 'running',
    created_at: '2026-11-19T20:17:10.490568Z',
    started_at: '2026-11-19T20:17:10.490638Z',
    finished_at: null,
    error: null,
    tasks: [
      task(
        'inspect',
        'inspect',
        [],
        'succeeded',
        '2026-11-19T20:17:10.490640Z',
        '2026-11-19T20:17:11.102311Z',
      ),
      task('validate', 'validate', [], 'running', '2026-11-19T20:17:10.490643Z'),
      task('normalize', 'normalize', ['validate'], 'pending'),
      task('fold', 'fold_rna', ['normalize'], 'pending'),
    ],
  },
  {
    run_id: '20261119-195502-a13f09c7',
    pipeline: QC_PIPELINE,
    params: { input: 'plasmids.gbk' },
    backend: 'local',
    resume: false,
    status: 'pending',
    created_at: '2026-11-19T19:55:02.118204Z',
    started_at: null,
    finished_at: null,
    error: null,
    tasks: [
      task('inspect', 'inspect', [], 'pending'),
      task('validate', 'validate', [], 'pending'),
      task('stats', 'stats', ['inspect', 'validate'], 'pending'),
    ],
  },
  {
    run_id: '20261119-174233-0b7e6d15',
    pipeline: FOLD_PIPELINE,
    params: { input: 'riboswitches.fasta', min_length: '50' },
    backend: 'local',
    resume: true,
    status: 'failed',
    created_at: '2026-11-19T17:42:33.774015Z',
    started_at: '2026-11-19T17:42:33.774102Z',
    finished_at: '2026-11-19T17:43:05.009871Z',
    error: 'task fold failed',
    tasks: [
      task(
        'inspect',
        'inspect',
        [],
        'succeeded',
        '2026-11-19T17:42:33.774110Z',
        '2026-11-19T17:42:34.250937Z',
      ),
      task(
        'validate',
        'validate',
        [],
        'succeeded',
        '2026-11-19T17:42:33.774115Z',
        '2026-11-19T17:42:34.611402Z',
      ),
      task(
        'normalize',
        'normalize',
        ['validate'],
        'succeeded',
        '2026-11-19T17:42:34.611520Z',
        '2026-11-19T17:42:35.020114Z',
      ),
      task(
        'fold',
        'fold_rna',
        ['normalize'],
        'failed',
        '2026-11-19T17:42:35.020230Z',
        '2026-11-19T17:43:05.009790Z',
        'viennarna: RNAfold exited with status 1: sequence rs_0042 contains invalid characters',
      ),
    ],
  },
  {
    run_id: '20261118-093015-7c2e81fa',
    pipeline: QC_PIPELINE,
    params: { input: 'reads.fq.gz' },
    backend: 'local',
    resume: false,
    status: 'succeeded',
    created_at: '2026-11-18T09:30:15.335810Z',
    started_at: '2026-11-18T09:30:15.335902Z',
    finished_at: '2026-11-18T09:31:48.902266Z',
    error: null,
    tasks: [
      task(
        'inspect',
        'inspect',
        [],
        'succeeded',
        '2026-11-18T09:30:15.335910Z',
        '2026-11-18T09:30:59.441027Z',
      ),
      task(
        'validate',
        'validate',
        [],
        'succeeded',
        '2026-11-18T09:30:15.335915Z',
        '2026-11-18T09:31:02.118733Z',
      ),
      task(
        'stats',
        'stats',
        ['inspect', 'validate'],
        'succeeded',
        '2026-11-18T09:31:02.118840Z',
        '2026-11-18T09:31:48.902190Z',
      ),
    ],
  },
  {
    run_id: '20261117-161140-e94d3b02',
    pipeline: FOLD_PIPELINE,
    params: { input: 'tRNA-panel.fasta' },
    backend: 'local',
    resume: false,
    status: 'cancelled',
    created_at: '2026-11-17T16:11:40.052377Z',
    started_at: '2026-11-17T16:11:40.052460Z',
    finished_at: '2026-11-17T16:12:10.700118Z',
    error: null,
    tasks: [
      task(
        'inspect',
        'inspect',
        [],
        'succeeded',
        '2026-11-17T16:11:40.052470Z',
        '2026-11-17T16:11:41.300512Z',
      ),
      task(
        'validate',
        'validate',
        [],
        'succeeded',
        '2026-11-17T16:11:40.052475Z',
        '2026-11-17T16:11:41.877204Z',
      ),
      task(
        'normalize',
        'normalize',
        ['validate'],
        'cancelled',
        '2026-11-17T16:11:41.877310Z',
        '2026-11-17T16:12:10.700050Z',
      ),
      task('fold', 'fold_rna', ['normalize'], 'cancelled'),
    ],
  },
  {
    // What the real server shows for a run that was running when it stopped.
    run_id: '20261116-120005-5f61c8aa',
    pipeline: QC_PIPELINE,
    params: {},
    backend: 'local',
    resume: false,
    status: 'failed',
    created_at: '2026-11-16T12:00:05.880412Z',
    started_at: '2026-11-16T12:00:05.880497Z',
    finished_at: null,
    error: INTERRUPTED_ERROR,
    tasks: [
      task(
        'inspect',
        'inspect',
        [],
        'succeeded',
        '2026-11-16T12:00:05.880505Z',
        '2026-11-16T12:00:06.931120Z',
      ),
      task('validate', 'validate', [], 'running', '2026-11-16T12:00:05.880511Z'),
      task('stats', 'stats', ['inspect', 'validate'], 'pending'),
    ],
  },
];

// ---------------------------------------------------------------------------
// Manifest loading
// ---------------------------------------------------------------------------

class ManifestError extends Error {}

/** A manifest time as an API time: UTC with `Z`. A naive time is read as UTC. */
function apiTime(value, field) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new ManifestError(`${field}: not a time`);
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}:\d{2})?$/i.exec(
    value,
  );
  if (!match) throw new ManifestError(`${field}: not an ISO 8601 time: ${value}`);
  const [, local, zone] = match;
  if (!zone || /^(z|[+-]00:00)$/i.test(zone)) return `${local}Z`;
  // Another offset: convert to UTC (JavaScript keeps milliseconds only).
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ManifestError(`${field}: not a valid time: ${value}`);
  return date.toISOString();
}

function requireString(value, field) {
  if (typeof value !== 'string') throw new ManifestError(`${field}: expected a string`);
  return value;
}

function optionalString(value, field) {
  return value === null || value === undefined ? null : requireString(value, field);
}

function requireStatus(value, field) {
  if (!STATUSES.includes(value)) throw new ManifestError(`${field}: unknown status ${value}`);
  return value;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Turn a parsed manifest into an API run object. Unknown keys are dropped.
 * @throws {ManifestError} when the manifest is broken
 */
export function runFromManifest(manifest) {
  if (!isObject(manifest)) throw new ManifestError('not a JSON object');
  const { pipeline } = manifest;
  if (!isObject(pipeline)) throw new ManifestError('pipeline: expected an object');
  const params = manifest.params ?? {};
  if (!isObject(params) || Object.values(params).some((v) => typeof v !== 'string')) {
    throw new ManifestError('params: expected an object of strings');
  }
  if (!Array.isArray(manifest.tasks)) throw new ManifestError('tasks: expected a list');
  return {
    run_id: requireString(manifest.run_id, 'run_id'),
    pipeline: {
      name: requireString(pipeline.name, 'pipeline.name'),
      version: optionalString(pipeline.version, 'pipeline.version'),
      description: optionalString(pipeline.description, 'pipeline.description'),
    },
    params: { ...params },
    backend: manifest.backend === undefined ? 'local' : requireString(manifest.backend, 'backend'),
    resume: manifest.resume === undefined ? false : manifest.resume === true,
    status: requireStatus(manifest.status, 'status'),
    created_at: apiTime(manifest.created_at, 'created_at'),
    started_at: apiTime(manifest.started_at, 'started_at'),
    finished_at: apiTime(manifest.finished_at, 'finished_at'),
    error: optionalString(manifest.error, 'error'),
    tasks: manifest.tasks.map((t, i) => {
      if (!isObject(t)) throw new ManifestError(`tasks[${i}]: expected an object`);
      const dependsOn = t.depends_on ?? [];
      if (!Array.isArray(dependsOn) || dependsOn.some((d) => typeof d !== 'string')) {
        throw new ManifestError(`tasks[${i}].depends_on: expected a list of strings`);
      }
      return {
        name: requireString(t.name, `tasks[${i}].name`),
        type: requireString(t.type, `tasks[${i}].type`),
        depends_on: [...dependsOn].sort(),
        status: requireStatus(t.status, `tasks[${i}].status`),
        started_at: apiTime(t.started_at, `tasks[${i}].started_at`),
        finished_at: apiTime(t.finished_at, `tasks[${i}].finished_at`),
        error: optionalString(t.error, `tasks[${i}].error`),
      };
    }),
  };
}

/**
 * Load every run stored in `<storageDir>/runs/<run_id>/manifest.json`, like the real server at
 * startup: a broken manifest, or one whose `run_id` doesn't match its directory, is skipped with
 * a warning, and a `pending` or `running` run becomes `failed` ("interrupted: server stopped").
 * The mock never writes: the manifest on disk is left as it is.
 * @param {string} storageDir
 * @param {{ warn?: (message: string) => void }} [options]
 */
export function loadRuns(storageDir, { warn = console.warn } = {}) {
  const runsDir = path.join(storageDir, 'runs');
  let entries;
  try {
    entries = fs.readdirSync(runsDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const runs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(runsDir, entry.name, 'manifest.json');
    let run;
    try {
      run = runFromManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
    } catch (err) {
      warn(`skipping run ${entry.name}: broken manifest: ${err.message}`);
      continue;
    }
    if (run.run_id !== entry.name) {
      warn(`skipping run ${entry.name}: manifest run_id ${run.run_id} doesn't match its directory`);
      continue;
    }
    if (run.status === 'pending' || run.status === 'running') {
      run.status = 'failed';
      run.error = INTERRUPTED_ERROR;
    }
    runs.push(run);
  }
  return runs;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

/** Runs newest first. Run ids start with the creation time, so they sort by it. */
export function sortRunsNewestFirst(runs) {
  return [...runs].sort((a, b) =>
    a.created_at === b.created_at
      ? b.run_id.localeCompare(a.run_id)
      : (b.created_at ?? '').localeCompare(a.created_at ?? ''),
  );
}

/** The `GET /runs` summary of a run: no params or per-task details, only task counts. */
export function runSummary(run) {
  const tasks = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  for (const t of run.tasks) tasks[t.status] += 1;
  return {
    run_id: run.run_id,
    pipeline: run.pipeline,
    status: run.status,
    created_at: run.created_at,
    started_at: run.started_at,
    finished_at: run.finished_at,
    tasks,
  };
}
