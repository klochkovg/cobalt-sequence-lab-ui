<script setup lang="ts">
import StatsForm from '../components/StatsForm.vue';
</script>

<template>
  <header class="character">
    <p class="eyebrow">// cobalt sequence lab</p>
    <h1 class="character__title">Nucleotide stats<span class="cursor"></span></h1>
    <p class="character__lede">Paste a DNA sequence and get its nucleotide composition back.</p>
  </header>

  <section class="section">
    <StatsForm />
  </section>
</template>
