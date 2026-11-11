import {
  createRouter,
  createWebHistory,
  type RouterHistory,
  type RouteRecordRaw,
} from 'vue-router';
import StatsView from './views/StatsView.vue';
import CommandPlaceholderView from './views/CommandPlaceholderView.vue';

/** API commands with a page each, in menu order. Page paths never start with /api. */
export const COMMANDS = ['stats', 'inspect', 'normalize', 'validate'] as const;

export const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/stats' },
  { path: '/stats', component: StatsView },
  ...COMMANDS.filter((command) => command !== 'stats').map((command) => ({
    path: `/${command}`,
    component: CommandPlaceholderView,
    props: { command },
  })),
  { path: '/:pathMatch(.*)*', redirect: '/stats' },
];

export function createAppRouter(history: RouterHistory = createWebHistory()) {
  return createRouter({ history, routes });
}
