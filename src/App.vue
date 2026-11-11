<script setup lang="ts">
import StatsForm from './components/StatsForm.vue';

/** API commands. Only stats has a screen yet; the others link back to the current path. */
const COMMANDS = ['stats', 'inspect', 'normalize', 'validate'] as const;
// Not `/stats` etc.: vite.config.ts proxies those paths to the API.
const currentPath = window.location.pathname;
</script>

<template>
  <nav class="nav">
    <div class="nav__inner">
      <a class="nav__brand" href="/">sequence<span>.</span>lab</a>
      <div class="nav__links">
        <a href="https://klochkov.ai">klochkov.ai</a>
      </div>
    </div>
  </nav>

  <main class="container">
    <nav class="commands" aria-label="Commands">
      <a
        v-for="cmd in COMMANDS"
        :key="cmd"
        :href="cmd === 'stats' ? '/' : currentPath"
        :class="{ 'commands__link--active': cmd === 'stats' }"
        :aria-current="cmd === 'stats' ? 'page' : undefined"
        class="commands__link"
        >{{ cmd }}</a
      >
    </nav>

    <header class="character">
      <p class="eyebrow">// cobalt sequence lab</p>
      <h1 class="character__title">Nucleotide stats<span class="cursor"></span></h1>
      <p class="character__lede">Paste a DNA sequence and get its nucleotide composition back.</p>
    </header>

    <section class="section">
      <StatsForm />
    </section>
  </main>

  <footer class="container">
    <div class="footer">
      <span>sequence.lab</span>
      <a href="https://klochkov.ai">klochkov.ai</a>
    </div>
  </footer>
</template>
