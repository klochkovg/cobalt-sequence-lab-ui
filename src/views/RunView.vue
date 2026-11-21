<script setup lang="ts">
import RunDetail from '../components/RunDetail.vue';

defineProps<{ runId: string }>();
</script>

<template>
  <header class="character">
    <p class="eyebrow">// cobalt sequence lab</p>
    <h1 class="character__title">Run<span class="cursor"></span></h1>
    <p class="character__lede">One pipeline run: its parameters and tasks in execution order.</p>
  </header>

  <section class="section">
    <RunDetail :run-id="runId" />
  </section>
</template>
