import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import NucleotidesForm from '../NucleotidesForm.vue';

function jsonResponse(status: number, body: unknown, statusText = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(body),
  };
}

// What `POST /stats` returns for the sequence "AAC".
const STATS_ROW = {
  id: 'direct_input',
  length: 3,
  description: '',
  gc_fraction: 1 / 3,
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
};

describe('NucleotidesForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders', () => {
    const wrapper = mount(NucleotidesForm);
    expect(wrapper.find('textarea').exists()).toBe(true);
    expect(wrapper.find('.result').exists()).toBe(false);
  });

  it('POSTs the sequence to /stats as form data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, [STATS_ROW]));
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mount(NucleotidesForm);
    await wrapper.find('textarea').setValue('  AAC\n');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/stats');
    expect(init.method).toBe('POST');
    expect(init.headers).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('sequence')).toBe('AAC');
  });

  it('shows the stats as a table with one column per record', async () => {
    const second = { ...STATS_ROW, id: 'other', gc_fraction: null, mean_quality: 31.25 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, [STATS_ROW, second])));

    const wrapper = mount(NucleotidesForm);
    await wrapper.find('textarea').setValue('AAC');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const headers = wrapper.findAll('thead th').map((th) => th.text());
    expect(headers).toEqual(['record', 'direct_input', 'other']);

    const row = (label: string) =>
      wrapper
        .findAll('tbody tr')
        .find((tr) => tr.find('th').text() === label)!
        .findAll('td')
        .map((td) => td.text());
    expect(row('length')).toEqual(['3', '3']);
    expect(row('gc content')).toEqual(['33.3%', '—']);
    expect(row('alphabet')).toEqual(['unambiguous', 'unambiguous']);
    expect(row('description')).toEqual(['—', '—']);
    expect(row('mean quality')).toEqual(['—', '31.3']);
  });

  it('says so when there are no records', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, [])));

    const wrapper = mount(NucleotidesForm);
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('.result').text()).toBe('No records.');
    expect(wrapper.find('table').exists()).toBe(false);
  });

  it('shows a string error detail from the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(422, { detail: 'give either file uploads or a sequence, not both' }),
        ),
    );

    const wrapper = mount(NucleotidesForm);
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('.error').text()).toBe(
      'Error: give either file uploads or a sequence, not both',
    );
  });

  it('shows validation error arrays with the field name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(422, {
          detail: [{ type: 'enum', loc: ['body', 'sort'], msg: 'Input should be ...' }],
        }),
      ),
    );

    const wrapper = mount(NucleotidesForm);
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('.error').text()).toBe('Error: sort: Input should be ...');
  });

  it('falls back to the status line for a non-JSON error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new SyntaxError('not JSON')),
      }),
    );

    const wrapper = mount(NucleotidesForm);
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('.error').text()).toBe('Error: 500 Internal Server Error');
  });
});
