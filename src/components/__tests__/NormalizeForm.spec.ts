import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import NormalizeForm from '../NormalizeForm.vue';

function textResponse(status: number, text: string, statusText = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(JSON.parse(text)),
  };
}

const FASTA = '>read1 high quality\nACGTACGTAC\n>read2 low quality\nACGTNACGTA\n';

async function chooseFile(wrapper: VueWrapper, name = 'sample.fastq') {
  const file = new File(['@r\nACGT\n+\nIIII\n'], name);
  const input = wrapper.find('input[type="file"]');
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
  await input.trigger('change');
  return file;
}

async function submitWith(
  text: string,
  {
    status = 200,
    name = 'sample.fastq',
    format,
  }: { status?: number; name?: string; format?: string } = {},
) {
  const fetchMock = vi.fn().mockResolvedValue(textResponse(status, text));
  vi.stubGlobal('fetch', fetchMock);
  const wrapper = mount(NormalizeForm);
  await chooseFile(wrapper, name);
  if (format) await wrapper.find('select').setValue(format);
  await wrapper.find('form').trigger('submit');
  await flushPromises();
  return { wrapper, fetchMock };
}

describe('NormalizeForm', () => {
  let urls = 0;

  beforeEach(() => {
    urls = 0;
    // jsdom has no object URLs.
    URL.createObjectURL = vi.fn(() => `blob:test/${++urls}`);
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders with send disabled until a file is chosen', async () => {
    const wrapper = mount(NormalizeForm);
    expect(wrapper.find('button').attributes('disabled')).toBeDefined();
    expect(wrapper.findAll('option').map((o) => o.text())).toEqual(['fasta', 'genbank', 'fastq']);
    await chooseFile(wrapper);
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined();
  });

  it('POSTs the file and format=fasta to /api/normalize by default', async () => {
    const { fetchMock } = await submitWith(FASTA);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/normalize');
    expect(init.method).toBe('POST');
    expect(init.headers).toBeUndefined();
    const body = init.body as FormData;
    expect((body.get('file') as File).name).toBe('sample.fastq');
    expect(body.get('format')).toBe('fasta');
  });

  it('sends the chosen format', async () => {
    const { fetchMock } = await submitWith(FASTA, { format: 'genbank' });
    expect((fetchMock.mock.calls[0]![1].body as FormData).get('format')).toBe('genbank');
  });

  it('shows the output and a download link named after the file', async () => {
    const { wrapper } = await submitWith(FASTA);
    expect(wrapper.find('pre.output').text()).toBe(FASTA.trimEnd());
    const link = wrapper.find('.result__actions a');
    expect(link.attributes('download')).toBe('sample.fasta');
    expect(link.attributes('href')).toBe('blob:test/1');
    expect(wrapper.find('.output__more').exists()).toBe(false);
  });

  it('strips compression and the old extension from the download name', async () => {
    const { wrapper } = await submitWith(FASTA, { name: 'reads.fq.gz', format: 'fastq' });
    expect(wrapper.find('.result__actions a').attributes('download')).toBe('reads.fastq');
  });

  it('truncates long output in the preview', async () => {
    const text = Array.from({ length: 250 }, (_, i) => `line${i}`).join('\n') + '\n';
    const { wrapper } = await submitWith(text);
    expect(wrapper.find('pre.output').text().split('\n')).toHaveLength(200);
    expect(wrapper.find('.output__more').text()).toBe(
      '… 50 more lines (download for the full file)',
    );
  });

  it('explains empty fastq output and offers no download', async () => {
    const { wrapper } = await submitWith('', { format: 'fastq' });
    expect(wrapper.find('.result__empty').text()).toContain('No records written.');
    expect(wrapper.find('.result__empty').text()).toContain('records with qualities');
    expect(wrapper.find('.result__actions').exists()).toBe(false);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('shows empty fasta output without the fastq hint', async () => {
    const { wrapper } = await submitWith('');
    expect(wrapper.find('.result__empty').text()).toBe('No records written.');
  });

  it('shows a string error detail from the API', async () => {
    const { wrapper } = await submitWith(
      JSON.stringify({ detail: 'notes.txt: unrecognized format' }),
      { status: 422 },
    );
    expect(wrapper.find('.error').text()).toBe('Error: notes.txt: unrecognized format');
    expect(wrapper.find('.result').exists()).toBe(false);
  });

  it('shows validation error arrays with the field name', async () => {
    const { wrapper } = await submitWith(
      JSON.stringify({
        detail: [{ type: 'enum', loc: ['body', 'format'], msg: "Input should be 'fasta'" }],
      }),
      { status: 422 },
    );
    expect(wrapper.find('.error').text()).toBe("Error: format: Input should be 'fasta'");
  });

  it('revokes the old download URL when a new result arrives and on unmount', async () => {
    const { wrapper } = await submitWith(FASTA);
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test/1');
    expect(wrapper.find('.result__actions a').attributes('href')).toBe('blob:test/2');
    wrapper.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test/2');
  });
});
