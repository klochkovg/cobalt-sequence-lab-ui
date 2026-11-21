<script setup lang="ts">
import RunsList from '../components/RunsList.vue';
</script>

<template>
  <header class="character">
    <p class="eyebrow">// cobalt sequence lab</p>
    <h1 class="character__title">Runs<span class="cursor"></span></h1>
    <p class="character__lede">
      Pipeline runs stored on the server, newest first. Open a run to see its tasks.
    </p>
  </header>

  <section class="section">
    <RunsList />
  </section>
</template>
