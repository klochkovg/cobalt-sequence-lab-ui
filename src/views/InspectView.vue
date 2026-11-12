<script setup lang="ts">
import InspectForm from '../components/InspectForm.vue';
</script>

<template>
  <header class="character">
    <p class="eyebrow">// cobalt sequence lab</p>
    <h1 class="character__title">File inspect<span class="cursor"></span></h1>
    <p class="character__lede">Upload a sequence file and get its overview and records back.</p>
  </header>

  <section class="section">
    <InspectForm />
  </section>
</template>
