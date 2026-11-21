<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { EMPTY, formatTime, getJson } from '../api';
import { runPath, type Run } from '../runs';

const props = defineProps<{ runId: string }>();

const run = ref<Run | null>(null);
const error = ref<string | null>(null);
const loading = ref(false);

async function load(): Promise<void> {
  const runId = props.runId;
  loading.value = true;
  error.value = null;
  try {
    const result = await getJson<Run>(runPath(runId));
    if (runId === props.runId) run.value = result;
  } catch (err) {
    if (runId !== props.runId) return;
    run.value = null;
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    if (runId === props.runId) loading.value = false;
  }
}

watch(() => props.runId, load, { immediate: true });

const overviewRows = computed<{ label: string; value: string; status?: boolean }[]>(() => {
  const r = run.value;
  if (r === null) return [];
  return [
    { label: 'run id', value: r.run_id },
    { label: 'pipeline', value: `${r.pipeline.name} ${r.pipeline.version}` },
    { label: 'description', value: r.pipeline.description || EMPTY },
    { label: 'status', value: r.status, status: true },
    { label: 'backend', value: r.backend },
    { label: 'resume', value: r.resume ? 'yes' : 'no' },
    { label: 'created', value: formatTime(r.created_at) },
    { label: 'started', value: formatTime(r.started_at) },
    { label: 'finished', value: formatTime(r.finished_at) },
    { label: 'error', value: r.error ?? EMPTY },
  ];
});

const params = computed(() => Object.entries(run.value?.params ?? {}));
</script>

<template>
  <div>
    <RouterLink to="/runs" class="link--underline">← all runs</RouterLink>

    <p v-if="error" class="error">Error: {{ error }}</p>
    <p v-else-if="loading && run === null" class="result__empty result">loading…</p>

    <div v-if="run !== null" class="result">
      <h2 class="result__label">overview</h2>
      <div class="result__scroll">
        <table class="stats overview">
          <tbody>
            <tr v-for="row in overviewRows" :key="row.label">
              <th scope="row">{{ row.label }}</th>
              <td :class="{ stats__empty: row.value === EMPTY }">
                <span v-if="row.status" class="status" :class="`status--${row.value}`">{{
                  row.value
                }}</span>
                <template v-else>{{ row.value }}</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 class="result__label">params</h2>
      <p v-if="params.length === 0" class="result__empty">no params</p>
      <div v-else class="result__scroll">
        <table class="stats overview params">
          <tbody>
            <tr v-for="[name, value] in params" :key="name">
              <th scope="row">{{ name }}</th>
              <td>{{ value }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 class="result__label">tasks</h2>
      <p v-if="run.tasks.length === 0" class="result__empty">no tasks</p>
      <div v-else class="result__scroll">
        <table class="stats records tasks runs">
          <thead>
            <tr>
              <th scope="col">name</th>
              <th scope="col">type</th>
              <th scope="col">depends on</th>
              <th scope="col">status</th>
              <th scope="col">started</th>
              <th scope="col">finished</th>
              <th scope="col">error</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="task in run.tasks" :key="task.name">
              <td>{{ task.name }}</td>
              <td>{{ task.type }}</td>
              <td :class="{ stats__empty: task.depends_on.length === 0 }">
                {{ task.depends_on.length > 0 ? task.depends_on.join(', ') : EMPTY }}
              </td>
              <td class="runs__status">
                <span class="status" :class="`status--${task.status}`">{{ task.status }}</span>
              </td>
              <td class="stats__num runs__time">{{ formatTime(task.started_at) }}</td>
              <td class="stats__num runs__time">{{ formatTime(task.finished_at) }}</td>
              <td :class="{ stats__empty: task.error === null }">{{ task.error ?? EMPTY }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss" src="./form.scss"></style>
