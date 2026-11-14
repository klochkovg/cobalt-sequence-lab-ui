import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ValidateForm from '../ValidateForm.vue';

function jsonResponse(status: number, body: unknown, statusText = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(body),
  };
}

const NO_WARNINGS = {
  duplicate_id: 0,
  empty_sequence: 0,
  invalid_characters: 0,
  undefined_sequence: 0,
};

const PASSED = {
  file: 'clean.fa',
  records_num: 2,
  format: 'fasta',
  compression: 'gzip',
  passed: true,
  warning_counts: NO_WARNINGS,
  warnings: [],
};

// The `bad.fa` example from api_description.md.
const FAILED = {
  file: 'bad.fa',
  records_num: 3,
  format: 'fasta',
  compression: null,
  passed: false,
  warning_counts: { ...NO_WARNINGS, duplicate_id: 1, empty_sequence: 1 },
  warnings: [
    { record_id: 'a', kind: 'duplicate_id', message: 'duplicate ID' },
    { record_id: 'b', kind: 'empty_sequence', message: 'empty sequence' },
  ],
};

async function chooseFile(wrapper: VueWrapper, name = 'bad.fa') {
  const file = new File(['>a\nACGT\n'], name);
  const input = wrapper.find('input[type="file"]');
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
  await input.trigger('change');
  return file;
}

async function submitWith(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse(status, body));
  vi.stubGlobal('fetch', fetchMock);
  const wrapper = mount(ValidateForm);
  await chooseFile(wrapper);
  await wrapper.find('form').trigger('submit');
  await flushPromises();
  return { wrapper, fetchMock };
}

function overview(wrapper: VueWrapper) {
  return Object.fromEntries(
    wrapper.findAll('.overview tr').map((tr) => [tr.find('th').text(), tr.find('td').text()]),
  );
}

describe('ValidateForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders with send disabled until a file is chosen', async () => {
    const wrapper = mount(ValidateForm);
    expect(wrapper.find('button').attributes('disabled')).toBeDefined();
    await chooseFile(wrapper);
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined();
  });

  it('POSTs only the file to /api/validate', async () => {
    const { fetchMock } = await submitWith(PASSED);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/validate');
    expect(init.method).toBe('POST');
    expect(init.headers).toBeUndefined();
    const body = init.body as FormData;
    expect((body.get('file') as File).name).toBe('bad.fa');
    expect([...body.keys()]).toEqual(['file']);
  });

  it('shows a passed report without warnings', async () => {
    const { wrapper } = await submitWith(PASSED);
    const verdict = wrapper.find('.verdict');
    expect(verdict.text()).toBe('passed');
    expect(verdict.classes()).toContain('verdict--passed');
    expect(overview(wrapper)).toEqual({
      file: 'clean.fa',
      records: '2',
      format: 'fasta',
      compression: 'gzip',
      'duplicate id': '0',
      'empty sequence': '0',
      'invalid characters': '0',
      'undefined sequence': '0',
    });
    expect(wrapper.find('.warnings').exists()).toBe(false);
  });

  it('shows a failed report with its warnings', async () => {
    const { wrapper } = await submitWith(FAILED);
    const verdict = wrapper.find('.verdict');
    expect(verdict.text()).toBe('failed');
    expect(verdict.classes()).toContain('verdict--failed');
    expect(overview(wrapper)).toMatchObject({
      compression: '—',
      'duplicate id': '1',
      'empty sequence': '1',
    });
    expect(wrapper.findAll('.warnings li').map((li) => li.text())).toEqual([
      'a — duplicate ID',
      'b — empty sequence',
    ]);
  });

  it('marks an empty file as passed with no format', async () => {
    const { wrapper } = await submitWith({
      ...PASSED,
      file: 'empty.fa',
      records_num: 0,
      format: null,
      compression: null,
    });
    expect(wrapper.find('.verdict').text()).toBe('passed (empty file)');
    expect(overview(wrapper)).toMatchObject({ records: '0', format: '—' });
  });

  it('shows a string error detail from the API', async () => {
    const { wrapper } = await submitWith({ detail: 'notes.txt: unrecognized format' }, 422);
    expect(wrapper.find('.error').text()).toBe('Error: notes.txt: unrecognized format');
    expect(wrapper.find('.result').exists()).toBe(false);
  });

  it('shows validation error arrays with the field name', async () => {
    const { wrapper } = await submitWith(
      { detail: [{ type: 'missing', loc: ['body', 'file'], msg: 'Field required' }] },
      422,
    );
    expect(wrapper.find('.error').text()).toBe('Error: file: Field required');
  });
});
