<script setup lang="ts">
import { computed, ref } from 'vue';
import { EMPTY, formatValue, postForm, type Kind } from '../api';

/** See api_description.md, `RecordWarning`. */
interface RecordWarning {
  record_id: string;
  kind: string;
  message: string;
}

/** The `POST /validate` response (see api_description.md, `QCReport`). */
interface QCReport {
  file: string;
  records_num: number;
  format: string | null;
  compression: string | null;
  passed: boolean;
  warning_counts: Record<string, number>;
  warnings: RecordWarning[];
}

const file = ref<File | null>(null);
const result = ref<QCReport | null>(null);
const error = ref<string | null>(null);

function onFileChange(event: Event): void {
  file.value = (event.target as HTMLInputElement).files?.[0] ?? null;
}

const verdict = computed(() => {
  const report = result.value;
  if (report === null) return '';
  if (!report.passed) return 'failed';
  return report.records_num === 0 ? 'passed (empty file)' : 'passed';
});

const overviewRows = computed<{ label: string; value: string; kind: Kind }[]>(() => {
  const report = result.value;
  if (report === null) return [];
  return [
    { label: 'file', value: report.file, kind: 'text' },
    { label: 'records', value: formatValue(report.records_num, 'int'), kind: 'int' },
    { label: 'format', value: formatValue(report.format, 'text'), kind: 'text' },
    { label: 'compression', value: formatValue(report.compression, 'text'), kind: 'text' },
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
    result.value = await postForm<QCReport>('/validate', form);
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
      <button type="submit" class="btn btn--primary" :disabled="file === null">send</button>
    </form>

    <p v-if="error" class="error">Error: {{ error }}</p>

    <div v-if="result !== null" class="result">
      <p class="verdict" :class="result.passed ? 'verdict--passed' : 'verdict--failed'">
        {{ verdict }}
      </p>

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
    </div>
  </div>
</template>

<style scoped lang="scss" src="./form.scss"></style>
