<script setup lang="ts">
import ValidateForm from '../components/ValidateForm.vue';
</script>

<template>
  <header class="character">
    <p class="eyebrow">// cobalt sequence lab</p>
    <h1 class="character__title">Validate<span class="cursor"></span></h1>
    <p class="character__lede">
      Upload a sequence file and get a QC report: pass or fail, plus warnings per record.
    </p>
  </header>

  <section class="section">
    <ValidateForm />
  </section>
</template>
