<script setup lang="ts">
import { computed, ref } from 'vue';
import { EMPTY, formatValue, postForm, type Kind } from '../api';

/** See api_description.md, `RecordWarning`. */
interface RecordWarning {
  record_id: string;
  kind: string;
  message: string;
}

/** One record of `POST /inspect` (see api_description.md, `InspectRecord`). */
interface InspectRecord {
  id: string;
  length: number;
  sequence: string | null;
  gc_fraction: number | null;
  type: string;
  molecule_type: string | null;
  description: string;
  organism: string | null;
  mean_quality: number | null;
  min_quality: number | null;
  q30_fraction: number | null;
}

/** The `POST /inspect` response (see api_description.md, `InspectReport`). */
interface InspectReport {
  file: string;
  records_num: number;
  format: string | null;
  compression: string | null;
  min_length: number | null;
  max_length: number | null;
  mean_length: number | null;
  molecule_types: Record<string, number>;
  warning_counts: Record<string, number>;
  warnings: RecordWarning[];
  records: InspectRecord[];
}

type RecordField = Exclude<keyof InspectRecord, 'id' | 'sequence'>;

// Record table rows in the API's field order; `id` is the column header, `sequence` the last row.
const RECORD_FIELDS: { key: RecordField; label: string; kind: Kind }[] = [
  { key: 'length', label: 'length', kind: 'int' },
  { key: 'gc_fraction', label: 'gc content', kind: 'percent' },
  { key: 'type', label: 'type', kind: 'text' },
  { key: 'molecule_type', label: 'molecule type', kind: 'text' },
  { key: 'description', label: 'description', kind: 'text' },
  { key: 'organism', label: 'organism', kind: 'text' },
  { key: 'mean_quality', label: 'mean quality', kind: 'decimal' },
  { key: 'min_quality', label: 'min quality', kind: 'int' },
  { key: 'q30_fraction', label: 'q30', kind: 'percent' },
];

/** Sequence letters shown in the table; the full sequence is in the cell's tooltip. */
const SEQUENCE_PREVIEW = 60;

function previewSequence(sequence: string | null): string {
  if (sequence === null) return formatValue(null, 'text');
  return sequence.length > SEQUENCE_PREVIEW
    ? `${sequence.slice(0, SEQUENCE_PREVIEW)}…`
    : formatValue(sequence, 'text');
}

/** `{ DNA: 94, protein: 2 }` → `DNA 94, protein 2` (the API orders them most common first). */
function formatCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  if (entries.length === 0) return formatValue(null, 'text');
  return entries.map(([name, count]) => `${name} ${count}`).join(', ');
}

const file = ref<File | null>(null);
const overviewOnly = ref(false);
/** Empty string (or null from v-model.number on an empty field) means "all records". */
const limit = ref<number | string | null>('');
const result = ref<InspectReport | null>(null);
/** Whether `result` was requested with `overview_only`. */
const resultOverviewOnly = ref(false);
const error = ref<string | null>(null);

function onFileChange(event: Event): void {
  file.value = (event.target as HTMLInputElement).files?.[0] ?? null;
}

const overviewRows = computed<{ label: string; value: string; kind: Kind }[]>(() => {
  const report = result.value;
  if (report === null) return [];
  return [
    { label: 'file', value: report.file, kind: 'text' },
    { label: 'records', value: formatValue(report.records_num, 'int'), kind: 'int' },
    { label: 'format', value: formatValue(report.format, 'text'), kind: 'text' },
    { label: 'compression', value: formatValue(report.compression, 'text'), kind: 'text' },
    { label: 'min length', value: formatValue(report.min_length, 'int'), kind: 'int' },
    { label: 'max length', value: formatValue(report.max_length, 'int'), kind: 'int' },
    { label: 'mean length', value: formatValue(report.mean_length, 'decimal'), kind: 'decimal' },
    { label: 'molecule types', value: formatCounts(report.molecule_types), kind: 'text' },
    ...Object.entries(report.warning_counts).map(([kind, count]) => ({
      label: kind.replace(/_/g, ' '),
      value: formatValue(count, 'int'),
      kind: 'int' as Kind,
    })),
  ];
});

async function submit(): Promise<void> {
  if (file.value === null) return;
  error.value = null;
  result.value = null;
  try {
    const form = new FormData();
    form.append('file', file.value);
    if (overviewOnly.value) {
      form.append('overview_only', 'true');
    } else if (limit.value !== null && String(limit.value).trim() !== '') {
      form.append('output_seq_number', String(limit.value).trim());
    }
    resultOverviewOnly.value = overviewOnly.value;
    result.value = await postForm<InspectReport>('/inspect', form);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}
</script>

<template>
  <div>
    <form @submit.prevent="submit">
      <label>
        file
        <input type="file" name="file" @change="onFileChange" />
      </label>
      <div class="options">
        <label class="checkbox">
          <input v-model="overviewOnly" type="checkbox" name="overview_only" />
          overview only
        </label>
        <label>
          max records
          <input
            v-model="limit"
            type="number"
            name="output_seq_number"
            min="0"
            step="1"
            placeholder="all"
            :disabled="overviewOnly"
          />
        </label>
      </div>
      <button type="submit" class="btn btn--primary" :disabled="file === null">send</button>
    </form>

    <p v-if="error" class="error">Error: {{ error }}</p>

    <div v-if="result !== null" class="result">
      <h2 class="result__label">overview</h2>
      <div class="result__scroll">
        <table class="stats overview">
          <tbody>
            <tr v-for="row in overviewRows" :key="row.label">
              <th scope="row">{{ row.label }}</th>
              <td :class="{ stats__num: row.kind !== 'text', stats__empty: row.value === EMPTY }">
                {{ row.value }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <template v-if="result.warnings.length > 0">
        <h2 class="result__label">warnings</h2>
        <ul class="warnings">
          <li v-for="(warning, index) in result.warnings" :key="index">
            <span class="warnings__id">{{ warning.record_id }}</span> — {{ warning.message }}
          </li>
        </ul>
      </template>

      <template v-if="!resultOverviewOnly">
        <h2 class="result__label">records</h2>
        <p v-if="result.records.length === 0" class="result__empty">No records.</p>
        <div v-else class="result__scroll">
          <table class="stats records">
            <thead>
              <tr>
                <th scope="col">record</th>
                <th v-for="(record, index) in result.records" :key="index" scope="col">
                  {{ record.id }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="field in RECORD_FIELDS" :key="field.key">
                <th scope="row">{{ field.label }}</th>
                <td
                  v-for="(record, index) in result.records"
                  :key="index"
                  :class="{
                    stats__num: field.kind !== 'text',
                    stats__empty: record[field.key] === null || record[field.key] === '',
                  }"
                >
                  {{ formatValue(record[field.key], field.kind) }}
                </td>
              </tr>
              <tr>
                <th scope="row">sequence</th>
                <td
                  v-for="(record, index) in result.records"
                  :key="index"
                  class="stats__seq"
                  :class="{ stats__empty: !record.sequence }"
                  :title="record.sequence ?? undefined"
                >
                  {{ previewSequence(record.sequence) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss" src="./form.scss"></style>
