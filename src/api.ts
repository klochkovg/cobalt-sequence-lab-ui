/** Helpers shared by the command forms (see api_description.md). */

/** How a value is shown in a result table. */
export type Kind = 'text' | 'int' | 'percent' | 'decimal';

/** Shown for null and empty values. */
export const EMPTY = '—';

export function formatValue(value: string | number | null, kind: Kind): string {
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

type ValidationIssue = { loc: (string | number)[]; msg: string };

/** Turn an API error response into a message: `detail` is a string or a list of validation issues. */
export async function errorMessage(response: Response): Promise<string> {
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

/**
 * POST multipart form data to an API endpoint (e.g. `/stats`) and return the JSON body.
 * Throws an Error with a user-facing message when the response is not OK.
 */
export async function postForm<T>(path: string, form: FormData): Promise<T> {
  // Don't set Content-Type: the browser adds the multipart boundary.
  const response = await fetch(`/api${path}`, { method: 'POST', body: form });
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
  return (await response.json()) as T;
}
