<script setup lang="ts">
import { COMMANDS, SERVICES } from './router';
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
