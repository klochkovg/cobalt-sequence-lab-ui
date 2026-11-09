<script setup lang="ts">
import NucleotidesForm from './components/NucleotidesForm.vue';
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
    <header class="character">
      <p class="eyebrow">// cobalt sequence lab</p>
      <h1 class="character__title">Nucleotide stats<span class="cursor"></span></h1>
      <p class="character__lede">Paste a DNA sequence and get its nucleotide composition back.</p>
    </header>

    <section class="section">
      <NucleotidesForm />
    </section>
  </main>

  <footer class="container">
    <div class="footer">
      <span>sequence.lab</span>
      <a href="https://klochkov.ai">klochkov.ai</a>
    </div>
  </footer>
</template>
