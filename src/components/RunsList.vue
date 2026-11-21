<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { formatTime, getJson } from '../api';
import { STATUSES, runPath, type RunSummary } from '../runs';

const runs = ref<RunSummary[] | null>(null);
const error = ref<string | null>(null);
const loading = ref(false);

/** Non-zero task counts, e.g. `1 succeeded · 2 pending`. */
function taskCounts(counts: RunSummary['tasks']): string {
  const parts = STATUSES.filter((s) => (counts[s] ?? 0) > 0).map((s) => `${counts[s]} ${s}`);
  return parts.length > 0 ? parts.join(' · ') : 'no tasks';
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    runs.value = await getJson<RunSummary[]>('/runs');
  } catch (err) {
    runs.value = null;
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <button type="button" class="btn" :disabled="loading" @click="load">
      {{ loading ? 'loading…' : 'refresh' }}
    </button>

    <p v-if="error" class="error">Error: {{ error }}</p>

    <div v-if="runs !== null" class="result">
      <p v-if="runs.length === 0" class="result__empty">no runs yet</p>
      <div v-else class="result__scroll">
        <table class="stats records runs">
          <thead>
            <tr>
              <th scope="col">run id</th>
              <th scope="col">pipeline</th>
              <th scope="col">status</th>
              <th scope="col">created</th>
              <th scope="col">started</th>
              <th scope="col">finished</th>
              <th scope="col">tasks</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="run in runs" :key="run.run_id">
              <td class="runs__id">
                <RouterLink :to="runPath(run.run_id)" class="link--underline">{{
                  run.run_id
                }}</RouterLink>
              </td>
              <td>{{ run.pipeline.name }} {{ run.pipeline.version }}</td>
              <td class="runs__status">
                <span class="status" :class="`status--${run.status}`">{{ run.status }}</span>
              </td>
              <td class="stats__num runs__time">{{ formatTime(run.created_at) }}</td>
              <td class="stats__num runs__time">{{ formatTime(run.started_at) }}</td>
              <td class="stats__num runs__time">{{ formatTime(run.finished_at) }}</td>
              <td>{{ taskCounts(run.tasks) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss" src="./form.scss"></style>
