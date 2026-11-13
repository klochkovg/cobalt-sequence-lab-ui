<script setup lang="ts">
import NormalizeForm from '../components/NormalizeForm.vue';
</script>

<template>
  <header class="character">
    <p class="eyebrow">// cobalt sequence lab</p>
    <h1 class="character__title">Normalize<span class="cursor"></span></h1>
    <p class="character__lede">
      Upload a sequence file and get it back cleaned and converted to FASTA, GenBank or FASTQ.
    </p>
  </header>

  <section class="section">
    <NormalizeForm />
  </section>
</template>
