<script setup lang="ts">
import { ref } from 'vue';

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
type Kind = 'text' | 'int' | 'percent' | 'decimal';

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

/** Shown for null and empty values. */
const EMPTY = '—';

function formatValue(value: string | number | null, kind: Kind): string {
  if (value === null || value === '') return EMPTY;
  if (typeof value === 'string') return value;
  switch (kind) {
    case 'percent':
      return `${(value * 100).toFixed(1)}%`;
    case 'decimal':
      return value.toFixed(1);
    default:
      return String(value);
  }
}

const sequence = ref('');
const result = ref<StatsRow[] | null>(null);
const error = ref<string | null>(null);

type ValidationIssue = { loc: (string | number)[]; msg: string };

/** Turn an API error response into a message: `detail` is a string or a list of validation issues. */
async function errorMessage(response: Response): Promise<string> {
  const fallback = `${response.status} ${response.statusText}`;
  try {
    const body = (await response.json()) as { detail?: string | ValidationIssue[] };
    if (typeof body.detail === 'string') return body.detail;
    if (Array.isArray(body.detail)) {
      return body.detail.map((e) => `${e.loc.slice(1).join('.')}: ${e.msg}`).join('; ');
    }
  } catch {
    // Not JSON (e.g. a plain-text 500): keep the status line.
  }
  return fallback;
}

async function submit(): Promise<void> {
  error.value = null;
  result.value = null;
  try {
    // The API takes multipart/form-data. Don't set Content-Type: the browser adds the boundary.
    const form = new FormData();
    form.append('sequence', sequence.value.trim());
    const response = await fetch('/stats', { method: 'POST', body: form });
    if (!response.ok) {
      throw new Error(await errorMessage(response));
    }
    result.value = (await response.json()) as StatsRow[];
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

<style scoped lang="scss" src="./NucleotidesForm.scss"></style>
