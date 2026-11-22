import {
  createRouter,
  createWebHistory,
  type RouterHistory,
  type RouteRecordRaw,
} from 'vue-router';
import type { Component } from 'vue';
import StatsView from './views/StatsView.vue';
import InspectView from './views/InspectView.vue';
import NormalizeView from './views/NormalizeView.vue';
import ValidateView from './views/ValidateView.vue';
import CommandPlaceholderView from './views/CommandPlaceholderView.vue';
import RunsView from './views/RunsView.vue';
import RunView from './views/RunView.vue';
import SettingsView from './views/SettingsView.vue';

/** API commands with a page each, in menu order. Page paths never start with /api. */
export const COMMANDS = ['stats', 'inspect', 'normalize', 'validate'] as const;

/** Service pages (pipeline runs), in menu order. */
export const SERVICES = ['runs'] as const;

/** Commands that have a page; the rest show CommandPlaceholderView. */
const PAGES: Partial<Record<(typeof COMMANDS)[number], Component>> = {
  stats: StatsView,
  inspect: InspectView,
  normalize: NormalizeView,
  validate: ValidateView,
};

export const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/stats' },
  ...COMMANDS.map((command): RouteRecordRaw => {
    const page = PAGES[command];
    return page
      ? { path: `/${command}`, component: page }
      : { path: `/${command}`, component: CommandPlaceholderView, props: { command } };
  }),
  // Nested, so the `runs` menu link stays active on a run's page.
  {
    path: '/runs',
    children: [
      { path: '', component: RunsView },
      { path: ':runId', component: RunView, props: true },
    ],
  },
  { path: '/settings', component: SettingsView },
  { path: '/:pathMatch(.*)*', redirect: '/stats' },
];

export function createAppRouter(history: RouterHistory = createWebHistory()) {
  return createRouter({ history, routes });
}
