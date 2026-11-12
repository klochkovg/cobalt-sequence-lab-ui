import {
  createRouter,
  createWebHistory,
  type RouterHistory,
  type RouteRecordRaw,
} from 'vue-router';
import type { Component } from 'vue';
import StatsView from './views/StatsView.vue';
import InspectView from './views/InspectView.vue';
import CommandPlaceholderView from './views/CommandPlaceholderView.vue';

/** API commands with a page each, in menu order. Page paths never start with /api. */
export const COMMANDS = ['stats', 'inspect', 'normalize', 'validate'] as const;

/** Commands that have a page; the rest show CommandPlaceholderView. */
const PAGES: Partial<Record<(typeof COMMANDS)[number], Component>> = {
  stats: StatsView,
  inspect: InspectView,
};

export const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/stats' },
  ...COMMANDS.map((command): RouteRecordRaw => {
    const page = PAGES[command];
    return page
      ? { path: `/${command}`, component: page }
      : { path: `/${command}`, component: CommandPlaceholderView, props: { command } };
  }),
  { path: '/:pathMatch(.*)*', redirect: '/stats' },
];

export function createAppRouter(history: RouterHistory = createWebHistory()) {
  return createRouter({ history, routes });
}
