import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import App from '../App.vue';
import StatsForm from '../components/StatsForm.vue';
import InspectForm from '../components/InspectForm.vue';
import NormalizeForm from '../components/NormalizeForm.vue';
import ValidateForm from '../components/ValidateForm.vue';
import RunsList from '../components/RunsList.vue';
import RunDetail from '../components/RunDetail.vue';
import SettingsView from '../views/SettingsView.vue';
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

  it('shows the user name from /api/me at the bottom of the sidebar', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ name: 'Ada Lovelace' }) });
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountAt('/stats');
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith('/api/me');
    const user = wrapper.find('aside.sidebar section.user');
    expect(user.find('.commands__label').text()).toBe('// user');
    expect(user.find('.user__name').text()).toBe('Ada Lovelace');
  });

  it('falls back to guest when /api/me fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const { wrapper } = await mountAt('/stats');
    await flushPromises();

    expect(wrapper.find('aside.sidebar .user__name').text()).toBe('guest');
  });

  it('links to the settings page and marks it active there', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    const { wrapper } = await mountAt('/settings');
    const link = wrapper.find('aside.sidebar section.user a');

    expect(link.text()).toBe('settings');
    expect(link.attributes('href')).toBe('/settings');
    expect(link.attributes('aria-current')).toBe('page');
    expect(wrapper.find('main').findComponent(SettingsView).exists()).toBe(true);
    expect(wrapper.find('nav.commands a[aria-current="page"]').exists()).toBe(false);
  });
});
