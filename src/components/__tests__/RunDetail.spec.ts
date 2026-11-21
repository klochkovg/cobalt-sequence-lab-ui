import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import RunDetail from '../RunDetail.vue';

function jsonResponse(status: number, body: unknown, statusText = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(body),
  };
}

// The `GET /api/runs/{run_id}` example from api_description.md.
const RUN = {
  run_id: '20261119-201710-52dea242',
  pipeline: {
    name: 'fold-rna-from-fasta',
    version: '0.1.0',
    description: 'Inspect, validate, normalize, then fold each sequence.',
  },
  params: { min_length: '30' },
  backend: 'local',
  resume: false,
  status: 'running',
  created_at: '2026-11-19T20:17:10.490568Z',
  started_at: '2026-11-19T20:17:10.490638Z',
  finished_at: null,
  error: null,
  tasks: [
    {
      name: 'inspect',
      type: 'inspect',
      depends_on: [],
      status: 'succeeded',
      started_at: '2026-11-19T20:17:10.490640Z',
      finished_at: '2026-11-19T20:17:10.490641Z',
      error: null,
    },
    {
      name: 'normalize',
      type: 'normalize',
      depends_on: ['inspect', 'validate'],
      status: 'pending',
      started_at: null,
      finished_at: null,
      error: null,
    },
  ],
};

async function mountWith(response: unknown, runId = RUN.run_id) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  const wrapper = mount(RunDetail, {
    props: { runId },
    global: { stubs: { RouterLink: RouterLinkStub } },
  });
  await flushPromises();
  return { wrapper, fetchMock };
}

describe('RunDetail', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the run, percent-encoding its id', async () => {
    const { fetchMock } = await mountWith(jsonResponse(200, RUN), 'odd id/1');
    expect(fetchMock).toHaveBeenCalledWith('/api/runs/odd%20id%2F1');
  });

  it('shows the overview, params and tasks', async () => {
    const { wrapper } = await mountWith(jsonResponse(200, RUN));

    const overview = Object.fromEntries(
      wrapper
        .findAll('table.overview:not(.params) tr')
        .map((tr) => [tr.find('th').text(), tr.find('td').text()]),
    );
    expect(overview).toMatchObject({
      'run id': RUN.run_id,
      pipeline: 'fold-rna-from-fasta 0.1.0',
      status: 'running',
      backend: 'local',
      resume: 'no',
      created: '2026-11-19 20:17:10',
      finished: '—',
      error: '—',
    });

    expect(wrapper.find('table.params th').text()).toBe('min_length');
    expect(wrapper.find('table.params td').text()).toBe('30');

    const tasks = wrapper.findAll('table.tasks tbody tr');
    expect(tasks.map((tr) => tr.findAll('td')[0]!.text())).toEqual(['inspect', 'normalize']);
    expect(tasks[1]!.findAll('td')[2]!.text()).toBe('inspect, validate');
    expect(tasks[0]!.find('.status--succeeded').exists()).toBe(true);
  });

  it('shows the 404 detail for an unknown run', async () => {
    const { wrapper } = await mountWith(
      jsonResponse(404, { detail: 'run not found: nope' }, 'Not Found'),
      'nope',
    );
    expect(wrapper.find('.error').text()).toBe('Error: run not found: nope');
    expect(wrapper.findComponent(RouterLinkStub).props('to')).toBe('/runs');
  });

  it('reloads when the run id changes', async () => {
    const { wrapper, fetchMock } = await mountWith(jsonResponse(200, RUN));
    await wrapper.setProps({ runId: 'other' });
    await flushPromises();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/runs/other');
  });
});
