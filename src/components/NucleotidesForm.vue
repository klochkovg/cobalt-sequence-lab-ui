<script setup lang="ts">
import { ref } from 'vue';

const sequence = ref('');
const result = ref<unknown>(null);
const error = ref<string | null>(null);

async function submit(): Promise<void> {
  error.value = null;
  try {
    const response = await fetch('/stats', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sequence: sequence.value }),
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    result.value = await response.json();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}
</script>

<template>
  <div>
    <form @submit.prevent="submit">
      <label>
        sequence
        <textarea v-model="sequence" name="sequence" spellcheck="false"></textarea>
      </label>
      <button type="submit" class="btn btn--primary">send</button>
    </form>

    <p v-if="error" class="error">Error: {{ error }}</p>

    <pre v-show="result !== null" class="result code-block">{{
      JSON.stringify(result, null, 2)
    }}</pre>
  </div>
</template>

<style scoped lang="scss" src="./NucleotidesForm.scss"></style>
