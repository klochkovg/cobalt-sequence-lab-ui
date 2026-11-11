import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import App from '../App.vue';

describe('App command menu', () => {
  it('lists the commands, with stats as the current page', () => {
    const links = mount(App).findAll('nav.commands a');

    expect(links.map((a) => a.text())).toEqual(['stats', 'inspect', 'normalize', 'validate']);

    const [stats, ...others] = links;
    expect(stats!.attributes('href')).toBe('/');
    expect(stats!.attributes('aria-current')).toBe('page');
    expect(stats!.classes()).toContain('commands__link--active');

    for (const link of others) {
      expect(link.attributes('href')).toBe(window.location.pathname);
      expect(link.attributes('aria-current')).toBeUndefined();
    }
  });
});
