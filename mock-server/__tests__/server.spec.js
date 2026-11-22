// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SEED_RUNS, loadRuns } from '../runs.js';
import { createServer } from '../server.js';

const FASTQ =
  '@read1 high quality\nACGTACGTAC\n+\nIIIIIIIIII\n@read2 low quality, lowercase\nacgtnacgta\n+\n!!!!!+++++\n';
const PROTEIN_FASTA = '>p1 a protein\nMKVLAEFW\n';

async function startServer(options) {
  const server = createServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  // Every endpoint lives under /api, so tests use paths relative to it.
  return { server, origin, baseUrl: `${origin}/api` };
}

function form(fields) {
  const data = new FormData();
  for (const [name, value] of fields) {
    if (value && typeof value === 'object' && 'content' in value) {
      data.append(name, new Blob([value.content]), value.name);
    } else {
      data.append(name, value);
    }
  }
  return data;
}

const file = (name, content) => ['file', { name, content }];

describe('mock server (no auth)', () => {
  let server;
  let origin;
  let baseUrl;
  const post = (path, fields, init = {}) =>
    fetch(baseUrl + path, { method: 'POST', body: form(fields), ...init });

  beforeAll(async () => {
    ({ server, origin, baseUrl } = await startServer());
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it('GET / returns title and version, with or without the trailing slash', async () => {
    for (const url of [baseUrl, baseUrl + '/']) {
      const res = await fetch(url);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ title: 'Cobalt Sequence Lab', version: '0.2.0' });
    }
  });

  it('GET /health returns ok', async () => {
    const res = await fetch(baseUrl + '/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('GET /me returns the default user name', async () => {
    const res = await fetch(baseUrl + '/me');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'lab user' });
  });

  it('answers CORS preflight requests', async () => {
    const res = await fetch(baseUrl + '/inspect', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'x-api-key',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(res.headers.get('access-control-allow-headers')).toBe('x-api-key');
    expect(res.headers.get('access-control-expose-headers')).toBe(
      'Content-Disposition, X-Records-Read, X-Records-Written, X-Records-Skipped',
    );
  });

  it('returns 404 for unknown or unprefixed routes and 405 for wrong methods', async () => {
    expect((await fetch(baseUrl + '/nope')).status).toBe(404);
    expect((await fetch(origin + '/')).status).toBe(404);
    expect((await fetch(origin + '/stats', { method: 'POST' })).status).toBe(404);
    expect((await fetch(baseUrl + '/inspect')).status).toBe(405);
  });

  describe('POST /inspect', () => {
    it('returns an InspectReport', async () => {
      const res = await post('/inspect', [file('sample.fastq', FASTQ)]);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        file: 'sample.fastq',
        records_num: 2,
        format: 'fastq',
        compression: null,
        min_length: 10,
        max_length: 10,
        mean_length: 10,
        molecule_types: { DNA: 2 },
        warning_counts: {
          duplicate_id: 0,
          empty_sequence: 0,
          invalid_characters: 0,
          undefined_sequence: 0,
        },
        warnings: [],
      });
      expect(body.records[1]).toEqual({
        id: 'read2',
        length: 10,
        sequence: 'acgtnacgta',
        gc_fraction: 4 / 9,
        type: 'DNA',
        molecule_type: null,
        description: 'low quality, lowercase',
        organism: null,
        mean_quality: 5,
        min_quality: 0,
        q30_fraction: 0,
      });
    });

    it('honours overview_only and output_seq_number', async () => {
      let body = await (
        await post('/inspect', [file('s.fq', FASTQ), ['overview_only', 'yes']])
      ).json();
      expect(body.records).toEqual([]);
      expect(body.records_num).toBe(2);

      body = await (
        await post('/inspect', [file('s.fq', FASTQ), ['output_seq_number', '1']])
      ).json();
      expect(body.records.map((r) => r.id)).toEqual(['read1']);
    });

    it('pages with offset, drops sequences and limits warnings', async () => {
      const ten = Array.from({ length: 10 }, (_, i) => `>s${i + 1}\nAC*T\n`).join('');
      const body = await (
        await post('/inspect', [
          file('ten.fa', ten),
          ['offset', '2'],
          ['output_seq_number', '3'],
          ['include_sequence', 'false'],
          ['max_warnings', '1'],
        ])
      ).json();
      expect(body.records_num).toBe(10);
      expect(body.records.map((r) => r.id)).toEqual(['s3', 's4', 's5']);
      expect(body.records[0]).toMatchObject({ sequence: null, length: 4, gc_fraction: 1 / 3 });
      expect(body.records_offset).toBe(2);
      expect(body.warnings).toHaveLength(1);
      expect(body.warnings_truncated).toBe(true);
      expect(body.warning_counts.invalid_characters).toBe(10);

      const past = await (await post('/inspect', [file('ten.fa', ten), ['offset', '50']])).json();
      expect(past).toMatchObject({ records: [], records_offset: 50, warnings_truncated: false });
    });

    it('rejects a negative offset', async () => {
      const res = await post('/inspect', [file('a.fa', '>a\nAC\n'), ['offset', '-1']]);
      expect(res.status).toBe(422);
      expect((await res.json()).detail[0].loc).toEqual(['body', 'offset']);
    });

    it('rejects a negative output_seq_number with a validation error array', async () => {
      const res = await post('/inspect', [file('s.fq', FASTQ), ['output_seq_number', '-1']]);
      expect(res.status).toBe(422);
      const { detail } = await res.json();
      expect(detail[0]).toMatchObject({
        type: 'greater_than_equal',
        loc: ['body', 'output_seq_number'],
      });
    });

    it('rejects a missing file', async () => {
      const res = await post('/inspect', [['overview_only', 'true']]);
      expect(res.status).toBe(422);
      expect((await res.json()).detail).toEqual([
        { type: 'missing', loc: ['body', 'file'], msg: 'Field required', input: null },
      ]);
    });

    it('rejects an unrecognized file with a string detail', async () => {
      const res = await post('/inspect', [file('notes.txt', 'just some notes')]);
      expect(res.status).toBe(422);
      expect((await res.json()).detail).toMatch(/^notes\.txt: unrecognized format, expected FASTA/);
    });

    it('reports an empty file as an empty result', async () => {
      const body = await (await post('/inspect', [file('empty.fa', '')])).json();
      expect(body).toMatchObject({
        records_num: 0,
        format: null,
        min_length: null,
        max_length: null,
        mean_length: null,
        molecule_types: {},
        warnings: [],
        records: [],
      });
    });

    it('reports an upload without a filename as "upload"', async () => {
      const data = new FormData();
      data.append('file', new Blob(['>a\nACGT\n']), '');
      const body = await (await fetch(baseUrl + '/inspect', { method: 'POST', body: data })).json();
      expect(body.file).toBe('upload');
    });
  });

  describe('POST /validate', () => {
    it('reports warnings with passed=false and status 200', async () => {
      const res = await post('/validate', [file('bad.fa', '>a\nACGT\n>a\nACGT\n>b\n')]);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        file: 'bad.fa',
        records_num: 3,
        format: 'fasta',
        compression: null,
        passed: false,
        warning_counts: {
          duplicate_id: 1,
          empty_sequence: 1,
          invalid_characters: 0,
          undefined_sequence: 0,
        },
        warnings: [
          { record_id: 'a', kind: 'duplicate_id', message: 'duplicate ID', details: null },
          { record_id: 'b', kind: 'empty_sequence', message: 'empty sequence', details: null },
        ],
        warnings_truncated: false,
      });
    });

    it('describes invalid characters and honours max_warnings', async () => {
      const fasta = '>s1\nACGT\n>s2\nAC1GTA1\n>s2\nACGT\n';
      const body = await (await post('/validate', [file('x.fasta', fasta)])).json();
      expect(body.warnings[0]).toEqual({
        record_id: 's2',
        kind: 'invalid_characters',
        message: "invalid characters ['1']",
        details: { characters: ['1'], count: 2, first_positions: [3, 7] },
      });
      const limited = await (
        await post('/validate', [file('x.fasta', fasta), ['max_warnings', '1']])
      ).json();
      expect(limited.warnings).toHaveLength(1);
      expect(limited.warnings_truncated).toBe(true);
      expect(limited.warning_counts).toEqual(body.warning_counts);
    });

    it('passes a clean file and an empty file', async () => {
      expect((await (await post('/validate', [file('ok.fa', '>a\nACGT\n')])).json()).passed).toBe(
        true,
      );
      const empty = await (await post('/validate', [file('e.fa', '')])).json();
      expect(empty).toMatchObject({ passed: true, records_num: 0, format: null });
    });
  });

  describe('POST /stats', () => {
    it('returns one row for a raw sequence', async () => {
      const rows = await (await post('/stats', [['sequence', 'AGCGCA']])).json();
      expect(rows).toEqual([
        {
          id: 'direct_input',
          length: 6,
          description: '',
          gc_fraction: 4 / 6,
          type: 'DNA',
          source_format: 'raw',
          source_file: null,
          alphabetic_class: 'unambiguous',
          ambiguity_fraction: 0,
          invalid_char_count: 0,
          organism: null,
          molecule_type: null,
          topology: null,
          feature_count: 0,
          mean_quality: null,
          min_quality: null,
          q30_fraction: null,
        },
      ]);
    });

    it('concatenates rows from several files in upload order', async () => {
      const rows = await (
        await post('/stats', [file('sample.fastq', FASTQ), file('prot.fa', PROTEIN_FASTA)])
      ).json();
      expect(rows.map((r) => [r.id, r.source_file, r.source_format, r.type])).toEqual([
        ['read1', 'sample.fastq', 'fastq', 'DNA'],
        ['read2', 'sample.fastq', 'fastq', 'DNA'],
        ['p1', 'prot.fa', 'fasta', 'protein'],
      ]);
    });

    it('sorts with nulls last in both directions', async () => {
      const fields = [
        file('prot.fa', PROTEIN_FASTA),
        file('sample.fastq', FASTQ),
        ['sort', 'gc_fraction'],
      ];
      const asc = await (await post('/stats', fields)).json();
      expect(asc.map((r) => r.id)).toEqual(['read2', 'read1', 'p1']);
      const desc = await (await post('/stats', [...fields, ['desc', 'true']])).json();
      expect(desc.map((r) => r.id)).toEqual(['read1', 'read2', 'p1']);
    });

    it('points at the file field when neither file nor sequence is given', async () => {
      for (const fields of [[], [['sequence', '  \n ']]]) {
        const res = await post('/stats', fields);
        expect(res.status).toBe(422);
        expect(await res.json()).toEqual({
          detail: [
            {
              type: 'missing',
              loc: ['body', 'file'],
              msg: 'give one or more files or a sequence',
              input: null,
            },
          ],
        });
      }
    });

    it('points at the sequence field when both are given', async () => {
      const res = await post('/stats', [file('a.fa', '>a\nAC\n'), ['sequence', 'ACGT']]);
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({
        detail: [
          {
            type: 'value_error',
            loc: ['body', 'sequence'],
            msg: 'give either files or a sequence, not both',
            input: 'ACGT',
          },
        ],
      });
    });

    it('removes whitespace inside a pasted sequence', async () => {
      const [row] = await (await post('/stats', [['sequence', 'AC GT\nAA']])).json();
      expect(row.length).toBe(6);
    });

    it('rejects a bad sort value', async () => {
      const res = await post('/stats', [
        ['sequence', 'ACGT'],
        ['sort', 'bogus'],
      ]);
      expect(res.status).toBe(422);
      const { detail } = await res.json();
      expect(detail[0]).toMatchObject({ type: 'enum', loc: ['body', 'sort'], input: 'bogus' });
    });

    it('fails the whole request if one file is unreadable', async () => {
      const res = await post('/stats', [file('a.fa', '>a\nAC\n'), file('notes.txt', 'nope')]);
      expect(res.status).toBe(422);
      expect((await res.json()).detail).toMatch(/^notes\.txt: /);
    });
  });

  describe('POST /normalize', () => {
    it('returns plain text in the requested format', async () => {
      const res = await post('/normalize', [file('sample.fastq', FASTQ), ['format', 'fasta']]);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
      expect(res.headers.get('content-disposition')).toBe('attachment; filename="sample.fasta"');
      expect(res.headers.get('x-records-read')).toBe('2');
      expect(res.headers.get('x-records-written')).toBe('2');
      expect(res.headers.get('x-records-skipped')).toBe('0');
      expect(await res.text()).toBe(
        '>read1 high quality\nACGTACGTAC\n>read2 low quality, lowercase\nACGTNACGTA\n',
      );
    });

    it('defaults to fasta and returns an empty body for FASTA → FASTQ', async () => {
      expect(await (await post('/normalize', [file('a.fa', '>a\nacgt\n')])).text()).toBe(
        '>a\nACGT\n',
      );
      const res = await post('/normalize', [file('a.fa', '>a\nacgt\n'), ['format', 'fastq']]);
      expect(res.status).toBe(200);
      expect(res.headers.get('x-records-read')).toBe('1');
      expect(res.headers.get('x-records-written')).toBe('0');
      expect(res.headers.get('x-records-skipped')).toBe('1');
      expect(await res.text()).toBe('');
    });

    it('suggests a file name without compression and old extension', async () => {
      const gz = { name: 'reads.fq.gz', content: gzipSync(FASTQ) };
      let res = await post('/normalize', [
        ['file', gz],
        ['format', 'genbank'],
      ]);
      expect(res.headers.get('content-disposition')).toBe('attachment; filename="reads.gbk"');

      res = await post('/normalize', [file('ячейка.fa', '>a\nACGT\n')]);
      expect(res.headers.get('content-disposition')).toBe(
        `attachment; filename="______.fasta"; filename*=UTF-8''${encodeURIComponent('ячейка.fasta')}`,
      );

      const data = new FormData();
      data.append('file', new Blob(['>a\nACGT\n']), '');
      res = await fetch(baseUrl + '/normalize', { method: 'POST', body: data });
      expect(res.headers.get('content-disposition')).toBe('attachment; filename="upload.fasta"');
    });

    it('rejects a bad format', async () => {
      const res = await post('/normalize', [file('a.fa', '>a\nACGT\n'), ['format', 'xml']]);
      expect(res.status).toBe(422);
      expect((await res.json()).detail[0].loc).toEqual(['body', 'format']);
    });
  });

  describe('pipeline runs', () => {
    it('GET /runs lists summaries newest first with every status counted', async () => {
      const res = await fetch(baseUrl + '/runs');
      expect(res.status).toBe(200);
      const runs = await res.json();
      expect(runs.map((r) => r.run_id)).toEqual(
        [...SEED_RUNS]
          .map((r) => r.run_id)
          .sort()
          .reverse(),
      );
      expect(runs[0]).toEqual({
        run_id: '20261119-201710-52dea242',
        pipeline: {
          name: 'fold-rna-from-fasta',
          version: '0.1.0',
          description: 'Inspect, validate, normalize, then fold each sequence.',
        },
        status: 'running',
        created_at: '2026-11-19T20:17:10.490568Z',
        started_at: '2026-11-19T20:17:10.490638Z',
        finished_at: null,
        tasks: { pending: 2, running: 1, succeeded: 1, failed: 0, cancelled: 0 },
      });
      const statuses = new Set(runs.map((r) => r.status));
      expect([...statuses].sort()).toEqual([
        'cancelled',
        'failed',
        'pending',
        'running',
        'succeeded',
      ]);
    });

    it('GET /runs/{id} returns the run with params and tasks', async () => {
      const res = await fetch(baseUrl + '/runs/20261119-174233-0b7e6d15');
      expect(res.status).toBe(200);
      const run = await res.json();
      expect(run).toMatchObject({
        run_id: '20261119-174233-0b7e6d15',
        params: { input: 'riboswitches.fasta', min_length: '50' },
        backend: 'local',
        resume: true,
        status: 'failed',
        error: 'task fold failed',
      });
      expect(run.tasks.map((t) => [t.name, t.status])).toEqual([
        ['inspect', 'succeeded'],
        ['validate', 'succeeded'],
        ['normalize', 'succeeded'],
        ['fold', 'failed'],
      ]);
      expect(Object.keys(run.tasks[0])).toEqual([
        'name',
        'type',
        'depends_on',
        'status',
        'started_at',
        'finished_at',
        'error',
      ]);
    });

    it('GET /runs/{id} gives 404 for an unknown id, decoding percent escapes', async () => {
      let res = await fetch(baseUrl + '/runs/nope');
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ detail: 'run not found: nope' });
      res = await fetch(baseUrl + '/runs/a%20b');
      expect(await res.json()).toEqual({ detail: 'run not found: a b' });
    });
  });

  describe('stub endpoints', () => {
    const postJson = (route, body) =>
      fetch(baseUrl + route, {
        method: 'POST',
        body: typeof body === 'string' ? body : JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });

    it.each([
      ['/foldrna', { sequence: 'GGGAAAUCC' }, 'cobalt foldrna is not implemented yet'],
      ['/run', { pipeline: 'version: 1\n' }, 'cobalt run is not implemented yet'],
      [
        '/run',
        { pipeline: 'p', params: { input: 'x.fasta' }, backend: 'local', resume: true },
        'cobalt run is not implemented yet',
      ],
    ])('POST %s with a valid body returns 501', async (route, body, message) => {
      const res = await postJson(route, body);
      expect(res.status).toBe(501);
      expect(await res.json()).toEqual({ detail: message });
    });

    it('validates the JSON body before answering 501', async () => {
      let res = await postJson('/foldrna', { adapter: 'viennarna' });
      expect(res.status).toBe(422);
      expect((await res.json()).detail[0]).toMatchObject({
        type: 'missing',
        loc: ['body', 'sequence'],
      });

      res = await postJson('/run', { pipeline: 1, params: { n: 3 }, resume: 'maybe' });
      expect(res.status).toBe(422);
      expect((await res.json()).detail.map((e) => [e.type, e.loc])).toEqual([
        ['string_type', ['body', 'pipeline']],
        ['string_type', ['body', 'params', 'n']],
        ['bool_parsing', ['body', 'resume']],
      ]);

      res = await postJson('/run', '{not json');
      expect(res.status).toBe(422);
      expect((await res.json()).detail[0].type).toBe('json_invalid');

      res = await postJson('/run', '');
      expect((await res.json()).detail).toEqual([
        { type: 'missing', loc: ['body'], msg: 'Field required', input: null },
      ]);

      res = await postJson('/run', [1]);
      expect((await res.json()).detail[0].type).toBe('model_attributes_type');
    });
  });
});

describe('mock server (upload limit)', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    // 1 KiB, so small bodies pass the limit.
    ({ server, baseUrl } = await startServer({ maxUploadMb: 1 / 1024 }));
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));

  const big = '>a\n' + 'A'.repeat(4000) + '\n';

  it('refuses a body with a Content-Length over the limit', async () => {
    const res = await fetch(baseUrl + '/inspect', {
      method: 'POST',
      body: form([file('a.fa', big)]),
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ detail: `upload too large: limit is ${1 / 1024} MB` });
  });

  it('refuses a chunked body once it passes the limit', async () => {
    const body = new ReadableStream({
      start(controller) {
        for (let i = 0; i < 4; i++) controller.enqueue(new TextEncoder().encode(big));
        controller.close();
      },
    });
    const res = await fetch(baseUrl + '/run', {
      method: 'POST',
      body,
      duplex: 'half',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(413);
  });

  it('refuses a gzip upload that expands past 10 times the limit', async () => {
    const bomb = { name: 'bomb.fa.gz', content: gzipSync(big.repeat(4)) };
    const res = await fetch(baseUrl + '/inspect', { method: 'POST', body: form([['file', bomb]]) });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ detail: 'bomb.fa.gz: decompressed size exceeds the limit' });
  });

  it('accepts a body under the limit', async () => {
    const res = await fetch(baseUrl + '/inspect', {
      method: 'POST',
      body: form([file('a.fa', '>a\nACGT\n')]),
    });
    expect(res.status).toBe(200);
  });
});

describe('mock server (unexpected errors)', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    // A run without a task list makes the runs listing throw.
    ({ server, baseUrl } = await startServer({ runs: [{ run_id: 'broken' }] }));
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it('returns 500 as JSON with CORS headers', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await fetch(baseUrl + '/runs', { headers: { Origin: 'http://localhost:5173' } });
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(await res.json()).toEqual({ detail: 'Internal server error' });
  });
});

describe('loadRuns', () => {
  let dir;
  const warnings = [];
  const write = (id, manifest) => {
    fs.mkdirSync(path.join(dir, 'runs', id), { recursive: true });
    const text = typeof manifest === 'string' ? manifest : JSON.stringify(manifest);
    fs.writeFileSync(path.join(dir, 'runs', id, 'manifest.json'), text);
  };
  const manifest = (overrides) => ({
    manifest_version: 1,
    run_id: 'r1',
    pipeline: { name: 'p', version: '1', description: null },
    params: {},
    backend: 'local',
    resume: false,
    status: 'succeeded',
    created_at: '2026-11-19T20:17:10.490568+00:00',
    started_at: '2026-11-19T20:17:10.490638',
    finished_at: '2026-11-19T22:17:11+02:00',
    error: null,
    tasks: [
      {
        name: 't',
        type: 'inspect',
        depends_on: ['b', 'a'],
        status: 'succeeded',
        started_at: null,
        finished_at: null,
        error: null,
        future_key: 1,
      },
    ],
    future_key: 'ignored',
    ...overrides,
  });

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobalt-mock-'));
    write('r1', manifest());
    write('r2', manifest({ run_id: 'r2', status: 'running' }));
    write('r3', manifest({ run_id: 'other' }));
    write('r4', '{broken');
    write('r5', manifest({ run_id: 'r5', status: 'weird' }));
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('loads manifests like the real server at startup', () => {
    const runs = loadRuns(dir, { warn: (m) => warnings.push(m) });
    expect(runs.map((r) => r.run_id).sort()).toEqual(['r1', 'r2']);
    const r1 = runs.find((r) => r.run_id === 'r1');
    expect(r1).not.toHaveProperty('manifest_version');
    expect(r1).not.toHaveProperty('future_key');
    expect(r1.created_at).toBe('2026-11-19T20:17:10.490568Z');
    expect(r1.started_at).toBe('2026-11-19T20:17:10.490638Z');
    expect(r1.finished_at).toBe('2026-11-19T20:17:11.000Z');
    expect(r1.tasks[0]).toEqual({
      name: 't',
      type: 'inspect',
      depends_on: ['a', 'b'],
      status: 'succeeded',
      started_at: null,
      finished_at: null,
      error: null,
    });
    expect(runs.find((r) => r.run_id === 'r2')).toMatchObject({
      status: 'failed',
      error: 'interrupted: server stopped',
    });
    expect(warnings).toHaveLength(3);
  });

  it('returns no runs when the storage directory has none', () => {
    expect(loadRuns(path.join(dir, 'missing'))).toEqual([]);
  });
});

describe('mock server (api-key auth)', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    ({ server, baseUrl } = await startServer({ apiKeys: ['secret'] }));
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it('keeps GET /api and GET /api/health public', async () => {
    expect((await fetch(baseUrl + '/')).status).toBe(200);
    expect((await fetch(baseUrl + '/health')).status).toBe(200);
  });

  it('rejects missing or wrong keys', async () => {
    for (const headers of [{}, { 'X-API-Key': 'wrong' }]) {
      const res = await fetch(baseUrl + '/stats', {
        method: 'POST',
        body: form([['sequence', 'ACGT']]),
        headers,
      });
      expect(res.status).toBe(401);
      expect(res.headers.get('www-authenticate')).toBe('ApiKey');
      expect(await res.json()).toEqual({ detail: 'Invalid or missing API key' });
    }
    expect((await fetch(baseUrl + '/runs')).status).toBe(401);
    expect((await fetch(baseUrl + '/me')).status).toBe(401);
  });

  it('accepts a valid key', async () => {
    const res = await fetch(baseUrl + '/stats', {
      method: 'POST',
      body: form([['sequence', 'ACGT']]),
      headers: { 'X-API-Key': 'secret' },
    });
    expect(res.status).toBe(200);
  });
});

describe('mock server (user name)', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    ({ server, baseUrl } = await startServer({ userName: 'Ada Lovelace' }));
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it('GET /me returns the configured name', async () => {
    const res = await fetch(baseUrl + '/me');
    expect(await res.json()).toEqual({ name: 'Ada Lovelace' });
  });
});
