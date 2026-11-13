<script setup lang="ts">
import { COMMANDS } from './router';
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

  <main class="container">
    <nav class="commands" aria-label="Commands">
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

    <RouterView />
  </main>

  <footer class="container">
    <div class="footer">
      <span>sequence.lab</span>
      <a href="https://klochkov.ai/cobalt">cobalt</a>
    </div>
  </footer>
</template>
