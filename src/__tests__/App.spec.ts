import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import App from '../App.vue';
import StatsForm from '../components/StatsForm.vue';
import InspectForm from '../components/InspectForm.vue';
import { createAppRouter } from '../router';

async function mountAt(path: string) {
  const router = createAppRouter(createMemoryHistory());
  router.push(path);
  await router.isReady();
  const wrapper = mount(App, { global: { plugins: [router] } });
  return { router, wrapper };
}

describe('App routing', () => {
  it('lists the commands as page links', async () => {
    const { wrapper } = await mountAt('/stats');
    const links = wrapper.findAll('nav.commands a');

    expect(links.map((a) => a.text())).toEqual(['stats', 'inspect', 'normalize', 'validate']);
    expect(links.map((a) => a.attributes('href'))).toEqual([
      '/stats',
      '/inspect',
      '/normalize',
      '/validate',
    ]);
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

    await wrapper.find('nav.commands a[href="/normalize"]').trigger('click');
    await router.isReady();
    await new Promise((resolve) => setTimeout(resolve));

    expect(router.currentRoute.value.path).toBe('/normalize');
    expect(active()).toEqual(['normalize']);
    expect(wrapper.find('h1').text()).toBe('normalize');
    expect(wrapper.text()).toContain('not available in the UI yet');
    expect(wrapper.findComponent(StatsForm).exists()).toBe(false);
  });

  it('shows the inspect form on /inspect', async () => {
    const { wrapper } = await mountAt('/inspect');
    expect(wrapper.findComponent(InspectForm).exists()).toBe(true);
    expect(wrapper.findComponent(StatsForm).exists()).toBe(false);
  });
});
