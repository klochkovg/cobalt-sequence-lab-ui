import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import NucleotidesForm from '../NucleotidesForm.vue';

describe('NucleotidesForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders', () => {
    const wrapper = mount(NucleotidesForm);
    expect(wrapper.find('textarea').exists()).toBe(true);
    expect(wrapper.find('.result').isVisible()).toBe(false);
  });

  it('PUTs the sequence to /stats and shows the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ A: 2, C: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mount(NucleotidesForm);
    await wrapper.find('textarea').setValue('AAC');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith('/stats', expect.objectContaining({ method: 'PUT' }));
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ sequence: 'AAC' });
    expect(wrapper.find('.result').text()).toContain('"A": 2');
  });

  it('shows an error on a failed response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' }),
    );

    const wrapper = mount(NucleotidesForm);
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('.error').text()).toBe('Error: 500 Server Error');
  });
});
