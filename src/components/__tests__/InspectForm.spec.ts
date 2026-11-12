import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import InspectForm from '../InspectForm.vue';

function jsonResponse(status: number, body: unknown, statusText = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(body),
  };
}

const LONG_SEQUENCE = 'ACGT'.repeat(20); // 80 letters

// What `POST /inspect` returns for a small FASTQ file with one duplicate ID.
const REPORT = {
  file: 'sample.fastq',
  records_num: 2,
  format: 'fastq',
  compression: null,
  min_length: 10,
  max_length: 80,
  mean_length: 45,
  molecule_types: { DNA: 2 },
  warning_counts: {
    duplicate_id: 1,
    empty_sequence: 0,
    invalid_characters: 0,
    undefined_sequence: 0,
  },
  warnings: [{ record_id: 'read1', kind: 'duplicate_id', message: 'duplicate ID' }],
  records: [
    {
      id: 'read1',
      length: 10,
      sequence: 'ACGTACGTAC',
      gc_fraction: 0.5,
      type: 'DNA',
      molecule_type: null,
      description: 'high quality',
      organism: null,
      mean_quality: 40,
      min_quality: 40,
      q30_fraction: 1,
    },
    {
      id: 'read1',
      length: 80,
      sequence: LONG_SEQUENCE,
      gc_fraction: 0.5,
      type: 'DNA',
      molecule_type: null,
      description: '',
      organism: null,
      mean_quality: 12.25,
      min_quality: 0,
      q30_fraction: 0.25,
    },
  ],
};

async function chooseFile(
  wrapper: VueWrapper,
  file = new File(['@r\nACGT\n+\nIIII\n'], 'sample.fastq'),
) {
  const input = wrapper.find('input[type="file"]');
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
  await input.trigger('change');
  return file;
}

async function submitWith(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse(status, body));
  vi.stubGlobal('fetch', fetchMock);
  const wrapper = mount(InspectForm);
  await chooseFile(wrapper);
  await wrapper.find('form').trigger('submit');
  await flushPromises();
  return { wrapper, fetchMock };
}

/** Cell texts of the row labelled `label` in `table`. */
function row(wrapper: VueWrapper, table: string, label: string): string[] {
  return wrapper
    .findAll(`${table} tbody tr`)
    .find((tr) => tr.find('th').text() === label)!
    .findAll('td')
    .map((td) => td.text());
}

describe('InspectForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders with send disabled until a file is chosen', async () => {
    const wrapper = mount(InspectForm);
    expect(wrapper.find('input[type="file"]').exists()).toBe(true);
    expect(wrapper.find('.result').exists()).toBe(false);
    expect(wrapper.find('button').attributes('disabled')).toBeDefined();

    await chooseFile(wrapper);
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined();
  });

  it('POSTs the file and record limit to /api/inspect as form data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, REPORT));
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mount(InspectForm);
    const file = await chooseFile(wrapper);
    await wrapper.find('input[type="number"]').setValue('5');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/inspect');
    expect(init.method).toBe('POST');
    expect(init.headers).toBeUndefined();
    const body = init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect((body.get('file') as File).name).toBe(file.name);
    expect(body.get('output_seq_number')).toBe('5');
    expect(body.has('overview_only')).toBe(false);
  });

  it('sends only the file by default', async () => {
    const { fetchMock } = await submitWith(REPORT);
    const body = fetchMock.mock.calls[0]![1].body as FormData;
    expect([...body.keys()]).toEqual(['file']);
  });

  it('sends overview_only and hides the records', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ...REPORT, records: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mount(InspectForm);
    await chooseFile(wrapper);
    await wrapper.find('input[type="number"]').setValue('5');
    await wrapper.find('input[type="checkbox"]').setValue(true);
    expect(wrapper.find('input[type="number"]').attributes('disabled')).toBeDefined();
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const body = fetchMock.mock.calls[0]![1].body as FormData;
    expect(body.get('overview_only')).toBe('true');
    expect(body.has('output_seq_number')).toBe(false);
    expect(wrapper.find('table.overview').exists()).toBe(true);
    expect(wrapper.find('table.records').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('No records.');
  });

  it('shows the overview', async () => {
    const { wrapper } = await submitWith(REPORT);
    expect(row(wrapper, 'table.overview', 'file')).toEqual(['sample.fastq']);
    expect(row(wrapper, 'table.overview', 'records')).toEqual(['2']);
    expect(row(wrapper, 'table.overview', 'compression')).toEqual(['—']);
    expect(row(wrapper, 'table.overview', 'mean length')).toEqual(['45.0']);
    expect(row(wrapper, 'table.overview', 'molecule types')).toEqual(['DNA 2']);
    expect(row(wrapper, 'table.overview', 'duplicate id')).toEqual(['1']);
    expect(row(wrapper, 'table.overview', 'empty sequence')).toEqual(['0']);
  });

  it('lists the warnings', async () => {
    const { wrapper } = await submitWith(REPORT);
    expect(wrapper.findAll('.warnings li').map((li) => li.text())).toEqual([
      'read1 — duplicate ID',
    ]);
  });

  it('shows the records as a table with one column per record', async () => {
    const { wrapper } = await submitWith(REPORT);

    const headers = wrapper.findAll('table.records thead th').map((th) => th.text());
    expect(headers).toEqual(['record', 'read1', 'read1']);
    expect(row(wrapper, 'table.records', 'length')).toEqual(['10', '80']);
    expect(row(wrapper, 'table.records', 'gc content')).toEqual(['50.0%', '50.0%']);
    expect(row(wrapper, 'table.records', 'description')).toEqual(['high quality', '—']);
    expect(row(wrapper, 'table.records', 'mean quality')).toEqual(['40.0', '12.3']);
    expect(row(wrapper, 'table.records', 'q30')).toEqual(['100.0%', '25.0%']);

    const sequences = wrapper.findAll('table.records td.stats__seq');
    expect(sequences[0]!.text()).toBe('ACGTACGTAC');
    expect(sequences[1]!.text()).toBe(`${LONG_SEQUENCE.slice(0, 60)}…`);
    expect(sequences[1]!.attributes('title')).toBe(LONG_SEQUENCE);
  });

  it('says so when there are no records', async () => {
    const { wrapper } = await submitWith({
      ...REPORT,
      records_num: 0,
      format: null,
      min_length: null,
      max_length: null,
      mean_length: null,
      molecule_types: {},
      warnings: [],
      records: [],
    });
    expect(wrapper.find('.result__empty').text()).toBe('No records.');
    expect(wrapper.find('table.records').exists()).toBe(false);
    expect(wrapper.find('.warnings').exists()).toBe(false);
    expect(row(wrapper, 'table.overview', 'molecule types')).toEqual(['—']);
  });

  it('shows a string error detail from the API', async () => {
    const { wrapper } = await submitWith({ detail: 'notes.txt: unrecognized format' }, 422);
    expect(wrapper.find('.error').text()).toBe('Error: notes.txt: unrecognized format');
    expect(wrapper.find('.result').exists()).toBe(false);
  });

  it('shows validation error arrays with the field name', async () => {
    const { wrapper } = await submitWith(
      {
        detail: [
          {
            type: 'greater_than_equal',
            loc: ['body', 'output_seq_number'],
            msg: 'Input should be greater than or equal to 0',
          },
        ],
      },
      422,
    );
    expect(wrapper.find('.error').text()).toBe(
      'Error: output_seq_number: Input should be greater than or equal to 0',
    );
  });
});
