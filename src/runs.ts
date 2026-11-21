/** Pipeline run types (see api_description.md, "Pipeline runs"). */

export const STATUSES = ['pending', 'running', 'succeeded', 'failed', 'cancelled'] as const;

/** Status of a run or a task. */
export type RunStatus = (typeof STATUSES)[number];

export interface Pipeline {
  name: string;
  version: string;
  description: string;
}

/** An item of `GET /runs`. */
export interface RunSummary {
  run_id: string;
  pipeline: Pipeline;
  status: RunStatus;
  created_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  /** Number of the run's tasks in each status. */
  tasks: Record<RunStatus, number>;
}

/** A task of a run, in execution order. */
export interface TaskRun {
  name: string;
  type: string;
  depends_on: string[];
  status: RunStatus;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
}

/** The `GET /runs/{run_id}` response. */
export interface Run {
  run_id: string;
  pipeline: Pipeline;
  params: Record<string, string>;
  backend: string;
  resume: boolean;
  status: RunStatus;
  created_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  tasks: TaskRun[];
}

/** Page path of a run's detail page. */
export function runPath(runId: string): string {
  return `/runs/${encodeURIComponent(runId)}`;
}
