// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from '../server.js';

const FASTQ =
  '@read1 high quality\nACGTACGTAC\n+\nIIIIIIIIII\n@read2 low quality, lowercase\nacgtnacgta\n+\n!!!!!+++++\n';
const PROTEIN_FASTA = '>p1 a protein\nMKVLAEFW\n';

async function startServer(options) {
  const server = createServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
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
  let baseUrl;
  const post = (path, fields, init = {}) =>
    fetch(baseUrl + path, { method: 'POST', body: form(fields), ...init });

  beforeAll(async () => {
    ({ server, baseUrl } = await startServer());
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it('GET / returns title and version', async () => {
    const res = await fetch(baseUrl + '/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ title: 'Cobalt Sequence Lab', version: '0.1.0' });
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
  });

  it('returns 404 for unknown routes and 405 for wrong methods', async () => {
    expect((await fetch(baseUrl + '/nope')).status).toBe(404);
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
          { record_id: 'a', kind: 'duplicate_id', message: 'duplicate ID' },
          { record_id: 'b', kind: 'empty_sequence', message: 'empty sequence' },
        ],
      });
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

    it('rejects both or neither of file and sequence', async () => {
      for (const fields of [[], [file('a.fa', '>a\nAC\n'), ['sequence', 'ACGT']]]) {
        const res = await post('/stats', fields);
        expect(res.status).toBe(422);
        expect(await res.json()).toEqual({
          detail: 'give either file uploads or a sequence, not both',
        });
      }
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
      expect(await res.text()).toBe('');
    });

    it('rejects a bad format', async () => {
      const res = await post('/normalize', [file('a.fa', '>a\nACGT\n'), ['format', 'xml']]);
      expect(res.status).toBe(422);
      expect((await res.json()).detail[0].loc).toEqual(['body', 'format']);
    });
  });

  describe('stub endpoints', () => {
    it.each([
      ['POST', '/foldrna', 'cobalt foldrna is not implemented yet'],
      ['POST', '/run', 'cobalt run is not implemented yet'],
      ['GET', '/runs', 'cobalt runs list is not implemented yet'],
      ['GET', '/runs/abc123', 'cobalt runs show is not implemented yet'],
    ])('%s %s returns 501', async (method, path, message) => {
      const init = { method };
      if (method === 'POST') {
        init.body = JSON.stringify({ sequence: 'ACGU' });
        init.headers = { 'Content-Type': 'application/json' };
      }
      const res = await fetch(baseUrl + path, init);
      expect(res.status).toBe(501);
      expect(await res.json()).toEqual({ detail: message });
    });
  });
});

describe('mock server (api-key auth)', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    ({ server, baseUrl } = await startServer({ apiKeys: ['secret'] }));
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it('keeps GET / public', async () => {
    expect((await fetch(baseUrl + '/')).status).toBe(200);
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
