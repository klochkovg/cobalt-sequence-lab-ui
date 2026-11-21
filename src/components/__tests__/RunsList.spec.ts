import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import RunsList from '../RunsList.vue';

function jsonResponse(status: number, body: unknown, statusText = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(body),
  };
}

// The `GET /api/runs` example from api_description.md, plus an id that needs encoding.
const RUNS = [
  {
    run_id: '20261119-201710-52dea242',
    pipeline: { name: 'fold-rna-from-fasta', version: '0.1.0', description: 'Fold.' },
    status: 'running',
    created_at: '2026-11-19T20:17:10.490568Z',
    started_at: '2026-11-19T20:17:10.490638Z',
    finished_at: null,
    tasks: { pending: 2, running: 1, succeeded: 1, failed: 0, cancelled: 0 },
  },
  {
    run_id: 'odd id/1',
    pipeline: { name: 'qc-report', version: '1.2.0', description: '' },
    status: 'failed',
    created_at: '2026-11-18T08:00:00Z',
    started_at: null,
    finished_at: null,
    tasks: { pending: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0 },
  },
];

async function mountWith(response: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  const wrapper = mount(RunsList, { global: { stubs: { RouterLink: RouterLinkStub } } });
  await flushPromises();
  return { wrapper, fetchMock };
}

describe('RunsList', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads GET /api/runs and shows one row per run', async () => {
    const { wrapper, fetchMock } = await mountWith(jsonResponse(200, RUNS));

    expect(fetchMock).toHaveBeenCalledWith('/api/runs');
    const rows = wrapper.findAll('tbody tr');
    expect(rows).toHaveLength(2);

    const cells = rows[0]!.findAll('td').map((td) => td.text());
    expect(cells).toEqual([
      '20261119-201710-52dea242',
      'fold-rna-from-fasta 0.1.0',
      'running',
      '2026-11-19 20:17:10',
      '2026-11-19 20:17:10',
      '—',
      '2 pending · 1 running · 1 succeeded',
    ]);
    expect(rows[0]!.find('.status--running').exists()).toBe(true);
    expect(rows[1]!.findAll('td')[6]!.text()).toBe('no tasks');
  });

  it('links each run id to its page, percent-encoded', async () => {
    const { wrapper } = await mountWith(jsonResponse(200, RUNS));
    const links = wrapper.findAllComponents(RouterLinkStub).filter((l) => l.text() !== 'refresh');

    expect(links.map((l) => l.props('to'))).toEqual([
      '/runs/20261119-201710-52dea242',
      '/runs/odd%20id%2F1',
    ]);
  });

  it('says when there are no runs', async () => {
    const { wrapper } = await mountWith(jsonResponse(200, []));
    expect(wrapper.find('.result__empty').text()).toBe('no runs yet');
    expect(wrapper.find('table').exists()).toBe(false);
  });

  it('shows the API error', async () => {
    const { wrapper } = await mountWith(
      jsonResponse(401, { detail: 'missing or invalid API key' }, 'Unauthorized'),
    );
    expect(wrapper.find('.error').text()).toBe('Error: missing or invalid API key');
  });

  it('reloads on refresh', async () => {
    const { wrapper, fetchMock } = await mountWith(jsonResponse(200, []));
    fetchMock.mockResolvedValue(jsonResponse(200, RUNS));

    await wrapper.find('button').trigger('click');
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(wrapper.findAll('tbody tr')).toHaveLength(2);
  });
});
