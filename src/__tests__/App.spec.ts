import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import App from '../App.vue';
import StatsForm from '../components/StatsForm.vue';
import InspectForm from '../components/InspectForm.vue';
import NormalizeForm from '../components/NormalizeForm.vue';
import ValidateForm from '../components/ValidateForm.vue';
import RunsList from '../components/RunsList.vue';
import RunDetail from '../components/RunDetail.vue';
import { createAppRouter } from '../router';

async function mountAt(path: string) {
  const router = createAppRouter(createMemoryHistory());
  router.push(path);
  await router.isReady();
  const wrapper = mount(App, { global: { plugins: [router] } });
  return { router, wrapper };
}

describe('App routing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists the commands as page links', async () => {
    const { wrapper } = await mountAt('/stats');
    const links = wrapper.findAll('nav[aria-label="Commands"] a');

    expect(links.map((a) => a.text())).toEqual(['stats', 'inspect', 'normalize', 'validate']);
    expect(links.map((a) => a.attributes('href'))).toEqual([
      '/stats',
      '/inspect',
      '/normalize',
      '/validate',
    ]);
  });

  it('puts the modes list in a side column and the page in main', async () => {
    const { wrapper } = await mountAt('/inspect');
    const sidebar = wrapper.find('aside.sidebar');

    expect(sidebar.find('nav[aria-label="Commands"]').exists()).toBe(true);
    expect(sidebar.find('nav[aria-label="Commands"] .commands__label').text()).toBe('// modes');
    expect(sidebar.find('nav[aria-label="Service"] .commands__label').text()).toBe('// service');
    expect(wrapper.find('main').findComponent(InspectForm).exists()).toBe(true);
    expect(wrapper.find('main nav.commands').exists()).toBe(false);
  });

  it('redirects / and unknown paths to /stats', async () => {
    for (const path of ['/', '/nope/deeper']) {
      const { router, wrapper } = await mountAt(path);
      expect(router.currentRoute.value.path).toBe('/stats');
      expect(wrapper.findComponent(StatsForm).exists()).toBe(true);
    }
  });

  it('marks the current command and shows its page', async () => {
    const { router, wrapper } = await mountAt('/stats');
    const active = () =>
      wrapper.findAll('nav.commands a[aria-current="page"]').map((a) => a.text());

    expect(active()).toEqual(['stats']);
    expect(wrapper.find('.commands__link--active').text()).toBe('stats');

    await wrapper.find('nav.commands a[href="/validate"]').trigger('click');
    await router.isReady();
    await new Promise((resolve) => setTimeout(resolve));

    expect(router.currentRoute.value.path).toBe('/validate');
    expect(active()).toEqual(['validate']);
    expect(wrapper.find('h1').text()).toBe('Validate');
    expect(wrapper.findComponent(ValidateForm).exists()).toBe(true);
    expect(wrapper.findComponent(StatsForm).exists()).toBe(false);
  });

  it('shows the inspect form on /inspect', async () => {
    const { wrapper } = await mountAt('/inspect');
    expect(wrapper.findComponent(InspectForm).exists()).toBe(true);
    expect(wrapper.findComponent(StatsForm).exists()).toBe(false);
  });

  it('shows the normalize form on /normalize', async () => {
    const { wrapper } = await mountAt('/normalize');
    expect(wrapper.findComponent(NormalizeForm).exists()).toBe(true);
    expect(wrapper.findComponent(StatsForm).exists()).toBe(false);
  });

  it('shows the validate form on /validate', async () => {
    const { wrapper } = await mountAt('/validate');
    expect(wrapper.findComponent(ValidateForm).exists()).toBe(true);
    expect(wrapper.findComponent(StatsForm).exists()).toBe(false);
  });

  it('lists the service pages in a second group', async () => {
    const { wrapper } = await mountAt('/stats');
    const links = wrapper.findAll('aside.sidebar nav[aria-label="Service"] a');

    expect(links.map((a) => a.text())).toEqual(['runs']);
    expect(links.map((a) => a.attributes('href'))).toEqual(['/runs']);
  });

  it('shows the runs list on /runs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }),
    );
    const { wrapper } = await mountAt('/runs');
    expect(wrapper.find('main').findComponent(RunsList).exists()).toBe(true);
    expect(wrapper.find('nav[aria-label="Service"] a[aria-current="page"]').text()).toBe('runs');
  });

  it('shows a run on /runs/:runId and keeps the runs link active', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    const { wrapper } = await mountAt('/runs/20261119-201710-52dea242');
    const detail = wrapper.find('main').findComponent(RunDetail);

    expect(detail.exists()).toBe(true);
    expect(detail.props('runId')).toBe('20261119-201710-52dea242');
    expect(wrapper.find('nav[aria-label="Service"] .commands__link--active').text()).toBe('runs');
    expect(wrapper.find('nav[aria-label="Commands"] .commands__link--active').exists()).toBe(false);
  });
});
