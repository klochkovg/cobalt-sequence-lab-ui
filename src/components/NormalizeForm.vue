<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { postFormText } from '../api';

/** Output formats of `POST /normalize` (see api_description.md, `OutputFormat`). */
const FORMATS = ['fasta', 'genbank', 'fastq'] as const;
type OutputFormat = (typeof FORMATS)[number];

const EXTENSIONS: Record<OutputFormat, string> = {
  fasta: '.fasta',
  genbank: '.gbk',
  fastq: '.fastq',
};

/** Lines shown in the preview; the download always has the whole file. */
const PREVIEW_LINES = 200;

/** `reads.fq.gz` + fastq → `reads.fastq`; the API sends no filename, so the UI picks one. */
function downloadName(original: string, format: OutputFormat): string {
  const base = original.replace(/\.(gz|bz2)$/i, '').replace(/\.[^.]*$/, '') || 'upload';
  return base + EXTENSIONS[format];
}

const file = ref<File | null>(null);
const format = ref<OutputFormat>('fasta');
const result = ref<string | null>(null);
/** Format and download name of `result`, fixed when it was requested. */
const resultFormat = ref<OutputFormat>('fasta');
const resultName = ref('');
const downloadUrl = ref<string | null>(null);
const error = ref<string | null>(null);

function onFileChange(event: Event): void {
  file.value = (event.target as HTMLInputElement).files?.[0] ?? null;
}

function setDownload(text: string | null): void {
  if (downloadUrl.value !== null) URL.revokeObjectURL(downloadUrl.value);
  downloadUrl.value = text ? URL.createObjectURL(new Blob([text], { type: 'text/plain' })) : null;
}

onBeforeUnmount(() => setDownload(null));

const preview = computed(() => {
  if (!result.value) return { text: '', more: 0 };
  const lines = result.value.replace(/\n$/, '').split('\n');
  return {
    text: lines.slice(0, PREVIEW_LINES).join('\n'),
    more: Math.max(0, lines.length - PREVIEW_LINES),
  };
});

async function submit(): Promise<void> {
  if (file.value === null) return;
  error.value = null;
  result.value = null;
  setDownload(null);
  try {
    const form = new FormData();
    form.append('file', file.value);
    form.append('format', format.value);
    resultFormat.value = format.value;
    resultName.value = downloadName(file.value.name, format.value);
    const text = await postFormText('/normalize', form);
    setDownload(text);
    result.value = text;
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
        <label>
          output format
          <select v-model="format" name="format">
            <option v-for="f in FORMATS" :key="f" :value="f">{{ f }}</option>
          </select>
        </label>
      </div>
      <button type="submit" class="btn btn--primary" :disabled="file === null">send</button>
    </form>

    <p v-if="error" class="error">Error: {{ error }}</p>

    <div v-if="result !== null" class="result">
      <p v-if="result === ''" class="result__empty">
        No records written.
        <template v-if="resultFormat === 'fastq'">
          (only records with qualities, such as FASTQ input, can be written as FASTQ)
        </template>
      </p>
      <template v-else>
        <h2 class="result__label">output</h2>
        <div class="result__actions">
          <a class="btn btn--primary" :href="downloadUrl ?? undefined" :download="resultName"
            >download</a
          >
          <span>{{ resultName }}</span>
        </div>
        <pre class="output">{{ preview.text }}</pre>
        <p v-if="preview.more > 0" class="output__more">
          … {{ preview.more }} more lines (download for the full file)
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss" src="./form.scss"></style>
