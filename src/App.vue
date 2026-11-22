<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getJson, type Me } from './api';
import { COMMANDS, SERVICES } from './router';

/** Shown until `/api/me` answers, and kept if it fails. */
const userName = ref('guest');

onMounted(async () => {
  try {
    userName.value = (await getJson<Me>('/me')).name || userName.value;
  } catch {
    // No user endpoint or no connection: stay a guest.
  }
});
</script>

<template>
  <nav class="nav">
    <div class="nav__inner">
      <RouterLink class="nav__brand" to="/">sequence<span>.</span>lab</RouterLink>
      <div class="nav__links">
        <a href="https://klochkov.ai/cobalt">cobalt</a>
      </div>
    </div>
  </nav>

  <div class="layout container">
    <!-- Left "frame": the modes (one page per command) and the service pages. -->
    <aside class="sidebar">
      <div class="sidebar__inner">
        <nav class="commands" aria-label="Commands">
          <p class="commands__label">// modes</p>
          <!-- RouterLink adds aria-current="page" to the active link. -->
          <RouterLink
            v-for="cmd in COMMANDS"
            :key="cmd"
            :to="`/${cmd}`"
            class="commands__link"
            active-class="commands__link--active"
            >{{ cmd }}</RouterLink
          >
        </nav>
        <nav class="commands" aria-label="Service">
          <p class="commands__label">// service</p>
          <RouterLink
            v-for="svc in SERVICES"
            :key="svc"
            :to="`/${svc}`"
            class="commands__link"
            active-class="commands__link--active"
            >{{ svc }}</RouterLink
          >
        </nav>
        <!-- Pinned to the bottom of the column. -->
        <section class="user" aria-label="User">
          <p class="commands__label">// user</p>
          <span class="user__name">{{ userName }}</span>
          <RouterLink to="/settings" class="commands__link" active-class="commands__link--active"
            >settings</RouterLink
          >
        </section>
      </div>
    </aside>

    <main class="layout__content">
      <RouterView />
    </main>
  </div>

  <footer class="container">
    <div class="footer">
      <span>sequence.lab</span>
      <a href="https://klochkov.ai/cobalt">cobalt</a>
    </div>
  </footer>
</template>
