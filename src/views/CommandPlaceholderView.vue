<script setup lang="ts">
/** Page for a command whose UI doesn't exist yet. */
defineProps<{ command: string }>();
</script>

<template>
  <header class="character">
    <p class="eyebrow">// cobalt sequence lab</p>
    <h1 class="character__title">{{ command }}<span class="cursor"></span></h1>
    <p class="character__lede">This command is not available in the UI yet.</p>
  </header>
</template>
