<script setup lang="ts">
import { ref } from 'vue';
import { formatValue, postForm, type Kind } from '../api';

/** One row of `POST /stats` (see api_description.md, `StatsRow`). */
interface StatsRow {
  id: string;
  length: number;
  description: string;
  gc_fraction: number | null;
  type: string;
  source_format: string;
  source_file: string | null;
  alphabetic_class: string;
  ambiguity_fraction: number | null;
  invalid_char_count: number | null;
  organism: string | null;
  molecule_type: string | null;
  topology: string | null;
  feature_count: number;
  mean_quality: number | null;
  min_quality: number | null;
  q30_fraction: number | null;
}

type Field = Exclude<keyof StatsRow, 'id'>;

// Table rows in the API's column order; `id` is the column header.
const FIELDS: { key: Field; label: string; kind: Kind }[] = [
  { key: 'length', label: 'length', kind: 'int' },
  { key: 'description', label: 'description', kind: 'text' },
  { key: 'gc_fraction', label: 'gc content', kind: 'percent' },
  { key: 'type', label: 'type', kind: 'text' },
  { key: 'source_format', label: 'source format', kind: 'text' },
  { key: 'source_file', label: 'source file', kind: 'text' },
  { key: 'alphabetic_class', label: 'alphabet', kind: 'text' },
  { key: 'ambiguity_fraction', label: 'ambiguous', kind: 'percent' },
  { key: 'invalid_char_count', label: 'invalid chars', kind: 'int' },
  { key: 'organism', label: 'organism', kind: 'text' },
  { key: 'molecule_type', label: 'molecule type', kind: 'text' },
  { key: 'topology', label: 'topology', kind: 'text' },
  { key: 'feature_count', label: 'features', kind: 'int' },
  { key: 'mean_quality', label: 'mean quality', kind: 'decimal' },
  { key: 'min_quality', label: 'min quality', kind: 'int' },
  { key: 'q30_fraction', label: 'q30', kind: 'percent' },
];

const sequence = ref('');
const result = ref<StatsRow[] | null>(null);
const error = ref<string | null>(null);

async function submit(): Promise<void> {
  error.value = null;
  result.value = null;
  try {
    const form = new FormData();
    form.append('sequence', sequence.value.trim());
    result.value = await postForm<StatsRow[]>('/stats', form);
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

    <div v-if="result !== null" class="result">
      <p v-if="result.length === 0" class="result__empty">No records.</p>
      <div v-else class="result__scroll">
        <table class="stats">
          <thead>
            <tr>
              <th scope="col">record</th>
              <th v-for="(row, index) in result" :key="index" scope="col">{{ row.id }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="field in FIELDS" :key="field.key">
              <th scope="row">{{ field.label }}</th>
              <td
                v-for="(row, index) in result"
                :key="index"
                :class="{
                  stats__num: field.kind !== 'text',
                  stats__empty: row[field.key] === null || row[field.key] === '',
                }"
              >
                {{ formatValue(row[field.key], field.kind) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss" src="./form.scss"></style>
